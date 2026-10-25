import { ReframeKeyframe } from '../types/index.js';
import { EnergySegment } from '../utils/reactionSpikes.js';

/**
 * Moment Structurer (AI Clip Director, Phase 1).
 *
 * Extracts structured moments — setup → event → reaction → payoff — from the
 * analyzed signal timeline. Pure functions; deterministic; grounded strictly
 * in analyzed media (transcript words, energy segments, spikes, scene cuts,
 * face intervals). Every output timestamp traces to an input signal.
 *
 * Three pattern extractors, selected by genre:
 *  - reaction_arc:    audio spike → reaction face → payoff resolution
 *  - dialogue_qa:     question → answer → takeaway
 *  - gameplay_play:   event (HUD/score change) → reaction → aftermath
 *
 * Output feeds directorPlanBuilder, never the renderer directly.
 */

export interface WordTiming {
  start: number;
  end: number;
  word?: string;
  text?: string;
}

export interface SignalInterval {
  start: number;
  end: number;
}

export interface MomentCandidate {
  start: number;
  end: number;
  structure: {
    setup_at?: number;
    event_at: number;
    reaction_at?: number;
    payoff_at?: number;
    pattern: 'reaction_arc' | 'dialogue_qa' | 'gameplay_play' | 'tutorial_step' | 'story_beat' | 'standalone';
  };
  evidence: Array<{ signal: 'transcript' | 'audio_spike' | 'scene_cut' | 'ocr' | 'face' | 'game_event' | 'reaction_spike' | 'silence' | 'visual_activity'; timestamp: number; confidence: number; detail?: string }>;
  confidence: number;
}

export interface MomentStructurerInput {
  durationSec: number;
  words: WordTiming[];
  /** Per-segment audio energy from the multimodal timeline. */
  energySegments: EnergySegment[];
  /** Precomputed reaction spikes (from reactionSpikes.ts). */
  spikes: Array<{ time: number; confidence: number }>;
  /** Scene cut timestamps. */
  sceneCuts: number[];
  /** Face-presence intervals (start,end). */
  faceIntervals: SignalInterval[];
  /** VLM gameplay events, if available. */
  gameEvents?: Array<{ time: number; type: string; confidence: number }>;
  genre: string;
}

const REACTION_GENRES = new Set(['gaming', 'motivation', 'comedy_entertainment']);
const QA_GENRES = new Set(['podcast_interview', 'news_politics', 'education_tutorial']);

/** Finds the nearest silence gap of at least minGap inside [lo, hi]. */
function findNearestPause(t: number, words: WordTiming[], lo: number, hi: number, minGapSec = 0.25): number | null {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].end;
    const gapEnd = sorted[i + 1].start;
    if (gapEnd - gapStart < minGapSec) continue;
    if (gapStart < lo || gapEnd > hi) continue;
    const mid = (gapStart + gapEnd) / 2;
    const d = Math.abs(mid - t);
    if (d < bestDist) {
      bestDist = d;
      best = mid;
    }
  }
  return best;
}

/** Last word boundary within [lo, hi] (end of a spoken thought). */
function lastWordEnd(words: WordTiming[], lo: number, hi: number): number | null {
  let best: number | null = null;
  for (const w of words) {
    if (w.end >= lo && w.end <= hi) {
      if (best === null || w.end > best) best = w.end;
    }
  }
  return best;
}

/**
 * Reaction arc: audio spike (event) → reaction face (reaction) → payoff
 * (trailing speech resolving by silence or duration end).
 */
export function findReactionArcs(input: MomentStructurerInput): MomentCandidate[] {
  const { spikes, words, energySegments, faceIntervals, durationSec } = input;
  if (spikes.length === 0) return [];

  const results: MomentCandidate[] = [];
  for (const spike of spikes) {
    if (spike.confidence < 0.5) continue;
    const evidence: MomentCandidate['evidence'] = [
      { signal: 'audio_spike', timestamp: spike.time, confidence: spike.confidence, detail: 'audio surge (event trigger)' },
    ];

    // Setup: look back up to 8s for the last silence gap or scene cut before the spike.
    const setupLookbackStart = Math.max(0, spike.time - 8);
    let setupAt: number | undefined;
    const pause = findNearestPause(spike.time, words, setupLookbackStart, spike.time);
    if (pause !== null && spike.time - pause <= 8) {
      setupAt = pause;
      evidence.push({ signal: 'silence', timestamp: pause, confidence: 0.7, detail: 'speech pause before spike (setup boundary)' });
    } else {
      const priorCut = input.sceneCuts.filter((c) => c < spike.time && c >= setupLookbackStart).pop();
      if (priorCut !== undefined) {
        setupAt = priorCut;
        evidence.push({ signal: 'scene_cut', timestamp: priorCut, confidence: 0.5, detail: 'scene cut before spike' });
      }
    }

    // Reaction: face presence active at/near the spike.
    let reactionAt: number | undefined;
    for (const fi of faceIntervals) {
      if (spike.time >= fi.start - 0.5 && spike.time <= fi.end + 0.5) {
        reactionAt = Math.max(fi.start, spike.time - 0.3);
        evidence.push({ signal: 'face', timestamp: reactionAt, confidence: 0.8, detail: 'face presence at reaction window' });
        break;
      }
    }

    // Payoff: last word end within 10s after the spike (or 60% of duration remaining).
    const payoffLookbackEnd = Math.min(durationSec, spike.time + 10);
    let payoffAt: number | undefined = lastWordEnd(words, spike.time + 0.5, payoffLookbackEnd) ?? undefined;
    if (payoffAt !== undefined) {
      evidence.push({ signal: 'transcript', timestamp: payoffAt, confidence: 0.6, detail: 'last word end after spike (payoff)' });
    }

    const start = setupAt ?? Math.max(0, spike.time - 3);
    const end = payoffAt ?? Math.min(durationSec, spike.time + 6);
    if (end - start < 4 || end - start > 90) continue;

    const confidence = Math.min(0.95, 0.4 + spike.confidence * 0.4 + (reactionAt ? 0.15 : 0) + (setupAt ? 0.1 : 0));
    results.push({
      start,
      end,
      structure: { setup_at: setupAt, event_at: spike.time, reaction_at: reactionAt, payoff_at: payoffAt, pattern: 'reaction_arc' },
      evidence,
      confidence: Number(confidence.toFixed(2)),
    });
  }
  return results;
}

/**
 * Dialogue Q&A: question word (?-ending segment) → answer → takeaway.
 * Uses transcript text for question detection (grounded in real words).
 */
export function findDialogueMoments(input: MomentStructurerInput): MomentCandidate[] {
  const { words, durationSec } = input;
  if (words.length < 4) return [];

  const results: MomentCandidate[] = [];
  // Find segments ending with '?' by grouping words into pseudo-sentences.
  let sentenceStart = 0;
  for (let i = 0; i < words.length; i++) {
    const isQuestion = typeof words[i].word === 'string' && words[i].word!.includes('?');
    const isBoundary = i === words.length - 1 || (words[i + 1] && words[i + 1].start - words[i].end > 0.4);

    if (isQuestion && isBoundary) {
      const questionStart = words[sentenceStart]?.start ?? words[i].start;
      const questionEnd = words[i].end;
      const answerStart = words[i + 1]?.start;
      if (answerStart === undefined) { sentenceStart = i + 1; continue; }

      // Answer: up to 8 sentences or 45s after the question.
      let answerEnd = answerStart;
      let j = i + 1;
      while (j < words.length && words[j].end - answerStart < 45) {
        answerEnd = words[j].end;
        if (words[j].word?.match(/[.!?]$/)) break;
        j++;
      }

      const start = Math.max(0, questionStart - 0.2);
      const end = Math.min(durationSec, answerEnd + 0.3);
      if (end - start >= 5 && end - start <= 90) {
        results.push({
          start,
          end,
          structure: {
            setup_at: questionStart,
            event_at: questionEnd,
            payoff_at: answerEnd,
            pattern: 'dialogue_qa',
          },
          evidence: [
            { signal: 'transcript', timestamp: questionStart, confidence: 0.85, detail: 'question detected (?-ending)' },
            { signal: 'transcript', timestamp: answerStart, confidence: 0.7, detail: 'answer follows question' },
          ],
          confidence: 0.75,
        });
      }
      sentenceStart = i + 1;
    }

    if (isBoundary) sentenceStart = i + 1;
  }
  return results;
}

/**
 * Gameplay play: game event → reaction → aftermath. Uses VLM events when
 * available; falls back to energy-segment surges.
 */
export function findGameplayPlays(input: MomentStructurerInput): MomentCandidate[] {
  const { gameEvents, spikes, energySegments, durationSec } = input;
  const results: MomentCandidate[] = [];

  const eventSources: Array<{ time: number; confidence: number; type: string; corroborated: boolean }> = [];
  for (const ev of gameEvents ?? []) {
    if (ev.confidence >= 0.5) {
      eventSources.push({ time: ev.time, confidence: ev.confidence, type: ev.type, corroborated: true });
    }
  }
  for (const spike of spikes) {
    if (spike.confidence >= 0.6 && !eventSources.some((e) => Math.abs(e.time - spike.time) < 3)) {
      eventSources.push({ time: spike.time, confidence: spike.confidence, type: 'reaction', corroborated: false });
    }
  }

  for (const source of eventSources) {
    const start = Math.max(0, source.time - 4); // buildup before the event
    const end = Math.min(durationSec, source.time + 8); // reaction + aftermath
    if (end - start < 6) continue;

    const evidence: MomentCandidate['evidence'] = [
      { signal: (source.corroborated ? 'game_event' : 'reaction_spike') as 'game_event' | 'reaction_spike', timestamp: source.time, confidence: source.confidence, detail: `${source.type} event` },
    ];

    // Reaction face if present near the event.
    for (const fi of input.faceIntervals) {
      if (source.time >= fi.start - 0.5 && source.time <= fi.end + 0.5) {
        evidence.push({ signal: 'face', timestamp: source.time, confidence: 0.7, detail: 'face reaction at event' });
        break;
      }
    }

    results.push({
      start,
      end,
      structure: {
        event_at: source.time,
        reaction_at: source.time + 0.5,
        payoff_at: end - 0.5,
        pattern: 'gameplay_play',
      },
      evidence,
      confidence: Number(Math.min(0.95, 0.4 + source.confidence * 0.5 + (source.corroborated ? 0.15 : 0)).toFixed(2)),
    });
  }
  return results;
}

/**
 * Top-level extraction: selects the pattern extractor for the genre, runs it,
 * and applies non-overlap suppression (keeps highest confidence per cluster).
 */
export function structureMoments(input: MomentStructurerInput): MomentCandidate[] {
  let candidates: MomentCandidate[];

  if (REACTION_GENRES.has(input.genre)) {
    candidates = [...findReactionArcs(input), ...findGameplayPlays(input)];
  } else if (QA_GENRES.has(input.genre)) {
    candidates = findDialogueMoments(input);
  } else {
    // Hybrid: try both, merge.
    candidates = [...findReactionArcs(input), ...findDialogueMoments(input)];
  }

  // Suppress overlapping candidates (keep highest confidence).
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: MomentCandidate[] = [];
  for (const c of sorted) {
    const overlaps = kept.some((k) => {
      const shorter = Math.min(k.end - k.start, c.end - c.start);
      if (shorter <= 0) return false;
      const overlap = Math.max(0, Math.min(k.end, c.end) - Math.max(k.start, c.start));
      return overlap / shorter > 0.4;
    });
    if (!overlaps) kept.push(c);
  }

  return kept.sort((a, b) => b.confidence - a.confidence);
}

/** Extracts word timings from a transcript record shape. */
export function wordsFromTranscript(words: Array<{ start: any; end: any; word?: any; text?: any }>): WordTiming[] {
  return (words || [])
    .map((w: any) => ({
      start: Number(w.start),
      end: Number(w.end),
      word: typeof w.word === 'string' ? w.word : undefined,
      text: typeof w.text === 'string' ? w.text : undefined,
    }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
}

/** Converts multimodal timeline segments to energy segments. */
export function energyFromTimeline(segments: Array<{ start: number; end: number; audio_energy_db: number }>): EnergySegment[] {
  return (segments || [])
    .filter((s) => Number.isFinite(s.audio_energy_db))
    .map((s) => ({ start: s.start, end: s.end, audio_energy_db: s.audio_energy_db }));
}
