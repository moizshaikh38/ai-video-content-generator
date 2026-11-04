import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import {
  NormalizedTranscriptionResult,
  NormalizedTranscriptSegment,
  NormalizedTranscriptWord,
} from './types.js';

/**
 * Parallel transcription of long audio.
 *
 * One Whisper request processes its file serially, so a 40-minute talk waits for the whole
 * upload and the whole decode. Splitting the MP3 into time windows and sending them at once
 * finishes in roughly the time of the longest window. Each window overlaps its neighbours by
 * CHUNK_OVERLAP_SEC so no word is cut in half; the merge keeps every word in exactly one
 * window (the one owning its midpoint) and shifts all timestamps back onto the source clock.
 */

const execFileAsync = promisify(execFile);

/** Below this length one request is already fast; splitting would only add boundaries. */
export const CHUNKING_MIN_DURATION_SEC = 8 * 60;
const MIN_CHUNK_SEC = 4 * 60;
const MAX_CHUNKS = 8;
export const CHUNK_OVERLAP_SEC = 3;
/** Single-request ceiling shared by both providers. */
const SINGLE_REQUEST_MAX_BYTES = 25 * 1024 * 1024;

export interface AudioChunkPlan {
  index: number;
  /** Where the extracted window starts and how long it runs, on the source clock. */
  startSec: number;
  durationSec: number;
  /** The span this window is authoritative for; neighbours own the overlap beyond it. */
  ownStartSec: number;
  ownEndSec: number;
}

export function planAudioChunks(totalSec: number): AudioChunkPlan[] {
  if (!(totalSec > 0)) return [];
  const count = Math.min(MAX_CHUNKS, Math.max(2, Math.ceil(totalSec / MIN_CHUNK_SEC)));
  const span = totalSec / count;
  return Array.from({ length: count }, (_, index) => {
    const ownStartSec = index === 0 ? 0 : Number((index * span).toFixed(3));
    const ownEndSec = index === count - 1 ? totalSec : Number(((index + 1) * span).toFixed(3));
    const startSec = Math.max(0, ownStartSec - (index === 0 ? 0 : CHUNK_OVERLAP_SEC));
    const endSec = Math.min(totalSec, ownEndSec + (index === count - 1 ? 0 : CHUNK_OVERLAP_SEC));
    return {
      index,
      startSec: Number(startSec.toFixed(3)),
      durationSec: Number((endSec - startSec).toFixed(3)),
      ownStartSec,
      ownEndSec,
    };
  });
}

const round3 = (n: number) => Number(n.toFixed(3));
const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
// The last window runs to the end of the file, so it owns everything after its start even when
// the recorded duration was slightly short.
const owns = (plan: AudioChunkPlan, t: number, isLast: boolean) =>
  t >= plan.ownStartSec && (isLast || t < plan.ownEndSec);

/**
 * Text for the part of a segment that falls inside its window's ownership. When the segment's
 * whitespace tokens line up one-to-one with its timed words, the kept tokens come from the
 * segment text so punctuation and casing survive; otherwise the timed words are joined.
 */
function clippedSegmentText(segText: string, segWords: NormalizedTranscriptWord[], kept: NormalizedTranscriptWord[]): string {
  if (kept.length === 0) return '';
  if (kept.length === segWords.length) return segText;
  const tokens = segText.split(/\s+/).filter(Boolean);
  if (tokens.length === segWords.length) {
    const first = segWords.indexOf(kept[0]);
    return tokens.slice(first, first + kept.length).join(' ');
  }
  return kept.map((w) => w.word).join(' ');
}

/** Stitches per-window results into one transcript on the source clock (pure; unit-tested). */
export function mergeChunkTranscripts(
  parts: Array<{ plan: AudioChunkPlan; result: NormalizedTranscriptionResult }>,
  totalSec: number
): NormalizedTranscriptionResult {
  const ordered = [...parts].sort((a, b) => a.plan.index - b.plan.index);
  const words: NormalizedTranscriptWord[] = [];
  const segments: NormalizedTranscriptSegment[] = [];
  const languageVotes = new Map<string, number>();

  ordered.forEach(({ plan, result }, i) => {
    const isLast = i === ordered.length - 1;
    const offset = plan.startSec;
    const chunkWords = (result.words || []).map((w) => ({
      word: w.word,
      start: round3(w.start + offset),
      end: round3(w.end + offset),
    }));
    // Two windows can time the same boundary word a few ms apart, so both claim it; the later copy goes.
    const recent = words.slice(-6);
    const ownedWords = chunkWords.filter((w) => {
      if (!owns(plan, (w.start + w.end) / 2, isLast)) return false;
      if (i === 0 || Math.abs(w.start - plan.ownStartSec) > 1.5) return true;
      return !recent.some((p) => normalizeWord(p.word) === normalizeWord(w.word) && Math.abs(p.start - w.start) < 0.6);
    });
    words.push(...ownedWords);

    for (const seg of result.segments || []) {
      const start = round3(seg.start + offset);
      const end = round3(seg.end + offset);
      const segWords = chunkWords.filter((w) => {
        const mid = (w.start + w.end) / 2;
        return mid >= start && mid <= end;
      });
      if (segWords.length === 0) {
        // No timing detail to split on: the window holding the segment's midpoint keeps it whole.
        if (owns(plan, (start + end) / 2, isLast) && seg.text.trim()) {
          segments.push({ start, end, text: seg.text.trim() });
        }
        continue;
      }
      const kept = segWords.filter((w) => ownedWords.includes(w));
      const text = clippedSegmentText(seg.text.trim(), segWords, kept);
      if (!text) continue;
      segments.push({
        start: kept.length === segWords.length ? start : kept[0].start,
        end: kept.length === segWords.length ? end : kept[kept.length - 1].end,
        text,
      });
    }

    if (result.language) {
      languageVotes.set(result.language, (languageVotes.get(result.language) || 0) + ownedWords.length + 1);
    }
  });

  segments.sort((a, b) => a.start - b.start);
  words.sort((a, b) => a.start - b.start);
  const language = [...languageVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'en';

  const lastEnd = Math.max(segments[segments.length - 1]?.end || 0, words[words.length - 1]?.end || 0);
  return {
    text: segments.map((s) => s.text).join(' ').trim(),
    language,
    durationSeconds: round3(Math.max(totalSec, lastEnd)),
    segments,
    words,
  };
}

/** Sample-accurate window cut from the extracted MP3 (output-side seek decodes up to the cut). */
function cutAudioWindow(audioPath: string, plan: AudioChunkPlan, isLast: boolean, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // The last window has no -t: it reads to the end so a short recorded duration never drops the tail.
    const command = ffmpeg(audioPath)
      .outputOptions(isLast ? ['-ss', String(plan.startSec)] : ['-ss', String(plan.startSec), '-t', String(plan.durationSec)])
      .audioCodec('libmp3lame')
      .audioBitrate(64)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('mp3');
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { command.kill('SIGKILL'); } catch {}
      reject(new Error(`Audio window ${plan.index} cut timed out.`));
    }, config.ffmpegTimeoutMs);
    command
      .on('error', (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(new Error(`Audio window ${plan.index} cut failed: ${err.message}`));
      })
      .on('end', () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve();
      })
      .save(outPath);
  });
}

/** Duration of the extracted MP3 when the project record had none (0 when ffprobe can't tell). */
async function probeDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath],
      { timeout: 15000 }
    );
    const sec = Number(String(stdout).trim());
    return Number.isFinite(sec) && sec > 0 ? sec : 0;
  } catch {
    return 0;
  }
}

/**
 * Transcribes the extracted audio, in parallel windows when it is long enough to benefit.
 * A window failure falls back to one whole-file request when the file fits a single request,
 * so chunking can make a run faster but never makes one fail that used to succeed.
 */
export async function transcribeAudioFast(
  provider: TranscriptionProvider,
  audio: { audioBuffer: Buffer; audioPath: string },
  durationSec: number | null | undefined,
  fileName: string
): Promise<NormalizedTranscriptionResult> {
  const totalSec = Number(durationSec) || (await probeDurationSec(audio.audioPath));
  const fitsOneRequest = audio.audioBuffer.length <= SINGLE_REQUEST_MAX_BYTES;
  if (totalSec < CHUNKING_MIN_DURATION_SEC && fitsOneRequest) {
    return provider.transcribeAudio(audio.audioBuffer, fileName, 'audio/mp3');
  }
  if (!(totalSec > 0)) {
    // Oversized audio with no known duration cannot be planned; the provider reports the size limit.
    return provider.transcribeAudio(audio.audioBuffer, fileName, 'audio/mp3');
  }

  const plans = planAudioChunks(totalSec);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `vireo-chunks-${crypto.randomUUID().slice(0, 8)}-`));
  const started = Date.now();
  try {
    const parts = await Promise.all(
      plans.map(async (plan) => {
        const chunkPath = path.join(workDir, `chunk-${plan.index}.mp3`);
        await cutAudioWindow(audio.audioPath, plan, plan.index === plans.length - 1, chunkPath);
        const buffer = await fs.promises.readFile(chunkPath);
        try {
          const result = await provider.transcribeAudio(buffer, fileName.replace(/(\.\w+)?$/, `-part${plan.index}$1`), 'audio/mp3');
          return { plan, result };
        } catch (err) {
          // A window of only music or silence is a normal part of a video, not a failed run.
          if (!/returned no speech/i.test(err instanceof Error ? err.message : String(err))) throw err;
          const empty: NormalizedTranscriptionResult = { text: '', language: '', durationSeconds: plan.durationSec, segments: [], words: [] };
          return { plan, result: empty };
        }
      })
    );
    const merged = mergeChunkTranscripts(parts, totalSec);
    logger.info(
      `[Transcription] ${plans.length} parallel windows transcribed in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
        `(${merged.segments.length} segments, ${merged.words.length} words)`
    );
    if (!merged.text) {
      throw new Error('Transcription returned no speech. Ensure the video has audible speech.');
    }
    return merged;
  } catch (err) {
    if (!fitsOneRequest) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Transcription] Parallel windows failed (${msg}); retrying as a single request.`);
    return provider.transcribeAudio(audio.audioBuffer, fileName, 'audio/mp3');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
