import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { getMongoDb, isMongoConfigured } from '../db/mongoClient.js';
import { defaultAiProvider } from './aiProviderClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  EnergySegment,
  ReactionSpike,
  corroborateEventWithSpikes,
  detectReactionSpikes,
} from '../utils/reactionSpikes.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * VLM game-event detection (gaming advantage over Eklipse: ANY game, no
 * per-game training). Samples frames across the source, asks a vision-capable
 * LLM to read the game HUD/state, persists a `game_events` timeline, and
 * cross-validates with audio reaction spikes. Eklipse's moat is ~43 natively
 * trained games; a VLM generalizes to arbitrary titles at frame-sample cost.
 *
 * Cost-gated: GAME_EVENTS_AUTO=on + vision-capable provider required. Every
 * failure degrades to "no events" — clipping works unchanged without it.
 */

export interface GameEvent {
  time: number;
  type: 'kill' | 'multi_kill' | 'death' | 'victory' | 'defeat' | 'clutch' | 'achievement' | 'reaction' | 'other';
  game?: string;
  confidence: number;
  corroborated_by_audio: boolean;
  note?: string;
}

export interface GameEventAnalysis {
  project_id: string;
  game?: string;
  events: GameEvent[];
  created_at: string;
}

const MAX_FRAMES = 24; // ~1 frame per 2.5s of a 60s clip; scales to caps
const FRAME_JPEG_QUALITY = '4';
const TIMEOUT_MS = 45_000;

interface FrameSample {
  time: number;
  base64: string;
}

async function extractFrames(localSourcePath: string, startSec: number, durationSec: number): Promise<FrameSample[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-gameframes-'));
  const count = Math.max(4, Math.min(MAX_FRAMES, Math.ceil(durationSec / 2.5)));
  const interval = durationSec / count;
  const frames: FrameSample[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const t = startSec + i * interval;
      const out = path.join(dir, `f${i}.jpg`);
      await execFileAsync(
        ffmpegBin,
        ['-y', '-ss', t.toFixed(2), '-i', localSourcePath, '-frames:v', '1',
         '-vf', `scale=640:-2`, '-q:v', FRAME_JPEG_QUALITY, out],
        { timeout: 20_000 }
      );
      if (fs.existsSync(out) && fs.statSync(out).size > 0) {
        frames.push({ time: Number(t.toFixed(2)), base64: fs.readFileSync(out).toString('base64') });
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return frames;
}

function buildVlmPrompt(frames: FrameSample[], durationSec: number): string {
  const imageBlocks = frames
    .map((f, i) => `Image ${i + 1} @ t=${f.time.toFixed(1)}s`)
    .join(', ');
  return `You are analyzing frames of a gaming stream (clip duration ${durationSec.toFixed(0)}s).
Frames (base64 JPEG, in order): ${imageBlocks}.

For EACH frame, look at the game HUD/state: kill feeds, scoreboard, victory/defeat screens, achievement popups, kill counters, round-result banners. Also note visible player-cam emotional reactions.

Return ONLY JSON:
{
  "game": "best-guess game title or 'unknown'",
  "events": [
    {"frame_index": 2, "type": "kill|multi_kill|death|victory|defeat|clutch|achievement|reaction|other", "confidence": 0.0-1.0, "note": "short evidence e.g. 'kill feed shows elimination'"}
  ]
}
Rules: only report events you can SEE evidence for in a frame; confidence < 0.4 guesses are discarded downstream; empty events array is a valid answer.`;
}

export class GameEventService {
  /** Runs VLM game-event detection on an already-local source. Never throws. */
  public static async analyzeLocalVideo(
    projectId: string,
    userId: string,
    localSourcePath: string,
    startSec: number,
    durationSec: number,
    energySegments: EnergySegment[] = []
  ): Promise<GameEventAnalysis> {
    const empty: GameEventAnalysis = { project_id: projectId, events: [], created_at: new Date().toISOString() };
    try {
      if (!config.gameEventsAuto || durationSec < 8) return empty;

      const frames = await extractFrames(localSourcePath, startSec, durationSec);
      if (frames.length < 4) return empty;

      const spikes: ReactionSpike[] = detectReactionSpikes(energySegments);

      const completion = await Promise.race([
        defaultAiProvider.generateJsonCompletion<{ game?: string; events?: Array<{ frame_index?: number; type?: string; confidence?: number; note?: string }> }>({
          systemPrompt: 'You are a precise game-stream vision analyst. Only report visually evidenced events.',
          userPrompt: buildVlmPrompt(frames, durationSec),
          temperature: 0.1,
          maxTokens: 900,
          responseFormat: 'json_object',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('VLM game analysis timed out.')), TIMEOUT_MS)
        ),
      ]);

      const rawEvents = Array.isArray(completion?.events) ? completion.events : [];
      const events: GameEvent[] = [];
      const validTypes = new Set(['kill', 'multi_kill', 'death', 'victory', 'defeat', 'clutch', 'achievement', 'reaction', 'other']);

      for (const ev of rawEvents) {
        const idx = Number(ev?.frame_index);
        if (!Number.isInteger(idx) || idx < 1 || idx > frames.length) continue;
        const type = validTypes.has(String(ev?.type)) ? (ev.type as GameEvent['type']) : 'other';
        let confidence = Number(ev?.confidence);
        if (!Number.isFinite(confidence)) continue;
        confidence = Math.min(1, Math.max(0, confidence));
        if (confidence < 0.4) continue;

        const frameTime = frames[idx - 1].time;
        const audio = corroborateEventWithSpikes(frameTime, confidence, spikes);
        events.push({
          time: frameTime,
          type,
          confidence: audio.confidence,
          corroborated_by_audio: audio.corroborated,
          note: typeof ev.note === 'string' ? ev.note.slice(0, 120) : undefined,
        });
      }

      // Standalone high-confidence audio spikes become 'reaction' events when
      // no VLM event is near them (Eklipse's fallback signal, transparently).
      for (const spike of spikes) {
        const nearVlm = events.some((e) => Math.abs(e.time - spike.time) <= 4);
        if (!nearVlm && spike.confidence >= 0.7) {
          events.push({
            time: spike.time,
            type: 'reaction',
            confidence: spike.confidence,
            corroborated_by_audio: true,
            note: `audio spike +${spike.magnitude}dB`,
          });
        }
      }

      events.sort((a, b) => a.time - b.time);
      const analysis: GameEventAnalysis = {
        project_id: projectId,
        game: typeof completion?.game === 'string' ? completion.game.slice(0, 60) : undefined,
        events: events.slice(0, 60),
        created_at: new Date().toISOString(),
      };

      if (isMongoConfigured) {
        const db = await getMongoDb();
        await db.collection('game_events').updateOne(
          { project_id: projectId },
          { $set: { ...analysis, user_id: userId, updated_at: new Date() } },
          { upsert: true }
        );
      }
      logger.info(`[GameEvents] ${projectId}: ${analysis.events.length} events${analysis.game ? ` (${analysis.game})` : ''}`);
      return analysis;
    } catch (err: any) {
      logger.info(`[GameEvents] ${projectId}: unavailable (${err?.message || err}) — clipping unaffected`);
      return empty;
    }
  }

  /** Fetches stored events for a project (owner check by caller). */
  public static async getEvents(projectId: string): Promise<GameEventAnalysis | null> {
    if (!isMongoConfigured) return null;
    const db = await getMongoDb();
    const doc = await db.collection<GameEventAnalysis & { user_id?: string }>('game_events').findOne({ project_id: projectId });
    if (!doc) return null;
    return { project_id: doc.project_id, game: doc.game, events: doc.events || [], created_at: doc.created_at };
  }
}
