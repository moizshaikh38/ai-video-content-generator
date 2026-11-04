import { TranscriptWord } from '../types/index.js';

export interface WordSnappingConfig {
  searchWindowSec?: number;      // How far to search for a word boundary (default 1.5s)
  leadSilenceSec?: number;       // Acoustic lead-in padding (default 0.35s)
  tailSilenceSec?: number;       // Acoustic tail padding (default 0.45s)
  minDurationSec?: number;       // Min clip duration (default 15.0s)
  maxDurationSec?: number;       // Max clip duration (default 60.0s)
  preferSentenceEndings?: boolean; // When close to end, snap to punctuation
}

export interface WordSnappingResult {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  was_snapped: boolean;
  snapped_start: boolean;
  snapped_end: boolean;
  matched_start_word?: string;
  matched_end_word?: string;
  lead_silence_applied: number;
  tail_silence_applied: number;
  explanation: string;
}

export interface WordSnappingParams {
  start: number;
  end: number;
  words?: TranscriptWord[] | null;
  videoDuration?: number | null;
  config?: WordSnappingConfig;
}

/**
 * Normalizes input word token text and timestamps.
 */
function normalizeWordToken(w: any): { word: string; start: number; end: number } | null {
  if (!w || typeof w !== 'object') return null;
  const word = String(w.word || w.text || '').trim();
  const start = Number(w.start);
  const end = Number(w.end);
  if (!word || isNaN(start) || isNaN(end) || start < 0 || end < start) return null;
  return { word, start, end };
}

/**
 * Snaps proposed clip boundaries onto real word timestamps with acoustic silence padding.
 * 
 * Based on production-proven heuristics from OpenShorts (MIT License):
 * LLMs are poor at millisecond arithmetic; spoken word timestamps are ground truth.
 * Leading into speech with 0.35s silence and trailing out with 0.45s silence guarantees
 * cuts sound natural and never chop syllables mid-word.
 */
export function snapClipToWordBoundaries(params: WordSnappingParams): WordSnappingResult {
  const { start, end, words, videoDuration, config = {} } = params;

  const rawStart = Math.max(0, Number(start) || 0);
  const rawEnd = Math.max(rawStart + 1.0, Number(end) || rawStart + 1.0);
  const sourceDur = typeof videoDuration === 'number' && videoDuration > 0 ? videoDuration : Infinity;

  const searchWindow = config.searchWindowSec ?? 1.5;
  const leadSilence = Math.max(0, config.leadSilenceSec ?? 0.35);
  const tailSilence = Math.max(0, config.tailSilenceSec ?? 0.45);
  const minDur = config.minDurationSec ?? 15.0;
  const maxDur = config.maxDurationSec ?? 60.0;
  const preferPunctuation = config.preferSentenceEndings ?? true;

  const fallbackResult: WordSnappingResult = {
    start_seconds: Number(rawStart.toFixed(3)),
    end_seconds: Number(Math.min(sourceDur, rawEnd).toFixed(3)),
    duration_seconds: Number((Math.min(sourceDur, rawEnd) - rawStart).toFixed(3)),
    was_snapped: false,
    snapped_start: false,
    snapped_end: false,
    lead_silence_applied: 0,
    tail_silence_applied: 0,
    explanation: 'No valid word timestamps available for snapping; returned raw boundaries clamped to duration.',
  };

  if (!Array.isArray(words) || words.length === 0) {
    return fallbackResult;
  }

  const validWords = words
    .map(normalizeWordToken)
    .filter((w): w is { word: string; start: number; end: number } => w !== null)
    .sort((a, b) => a.start - b.start);

  if (validWords.length === 0) {
    return fallbackResult;
  }

  let snappedStart = rawStart;
  let snappedEnd = rawEnd;
  let hasSnappedStart = false;
  let hasSnappedEnd = false;
  let matchedStartWord: string | undefined;
  let matchedEndWord: string | undefined;
  let leadApplied = 0;
  let tailApplied = 0;

  // 1. SNAP START BOUNDARY
  // Find words within searchWindow of rawStart
  const startCandidates = validWords.filter((w) => Math.abs(w.start - rawStart) <= searchWindow);
  if (startCandidates.length > 0) {
    // Pick the word whose start is closest to rawStart
    const bestStartWord = startCandidates.reduce((prev, curr) =>
      Math.abs(curr.start - rawStart) < Math.abs(prev.start - rawStart) ? curr : prev
    );

    matchedStartWord = bestStartWord.word;
    hasSnappedStart = true;

    // Check for previous word to determine silence gap
    const prevWords = validWords.filter((w) => w.end <= bestStartWord.start);
    const prevWordEnd = prevWords.length > 0 ? prevWords[prevWords.length - 1].end : 0;
    const gapBefore = Math.max(0, bestStartWord.start - prevWordEnd);

    // Apply lead-in silence (up to leadSilence, but at most half the gap before previous word)
    leadApplied = Math.min(leadSilence, gapBefore > 0 ? gapBefore / 2 : leadSilence);
    snappedStart = Math.max(0, bestStartWord.start - leadApplied);
  }

  // 2. SNAP END BOUNDARY
  // Find words within searchWindow of rawEnd
  const endCandidates = validWords.filter((w) => Math.abs(w.end - rawEnd) <= searchWindow);
  if (endCandidates.length > 0) {
    let bestEndWord: { word: string; start: number; end: number };

    // If preferPunctuation is enabled, check if any candidate in the search window ends a sentence
    const sentenceEndingCandidates = endCandidates.filter(
      (w) => /[.!?]["']?$/.test(w.word) && w.end - snappedStart <= maxDur && w.end - snappedStart >= minDur
    );

    if (preferPunctuation && sentenceEndingCandidates.length > 0) {
      bestEndWord = sentenceEndingCandidates[sentenceEndingCandidates.length - 1];
    } else {
      bestEndWord = endCandidates.reduce((prev, curr) =>
        Math.abs(curr.end - rawEnd) < Math.abs(prev.end - rawEnd) ? curr : prev
      );
    }

    matchedEndWord = bestEndWord.word;
    hasSnappedEnd = true;

    // Check for next word to determine silence gap
    const nextWords = validWords.filter((w) => w.start >= bestEndWord.end);
    const nextWordStart = nextWords.length > 0 ? nextWords[0].start : sourceDur;
    const gapAfter = Math.max(0, nextWordStart - bestEndWord.end);

    // Apply tail silence (up to tailSilence, but at most half the gap after next word)
    tailApplied = Math.min(tailSilence, gapAfter > 0 ? gapAfter / 2 : tailSilence);
    snappedEnd = Math.min(sourceDur, bestEndWord.end + tailApplied);
  }

  // 3. ENFORCE DURATION & BOUNDS CONSTRAINTS
  snappedStart = Math.max(0, snappedStart);
  if (sourceDur !== Infinity) {
    snappedEnd = Math.min(sourceDur, snappedEnd);
    snappedStart = Math.min(sourceDur, snappedStart);
  }

  let duration = snappedEnd - snappedStart;

  // If snapped duration is shorter than minDur, attempt stepping end forward
  if (duration < minDur && sourceDur > snappedStart + minDur) {
    const target = snappedStart + minDur;
    const laterWords = validWords.filter((w) => w.end >= target && w.end - snappedStart <= maxDur);
    if (laterWords.length > 0) {
      snappedEnd = Math.min(sourceDur, laterWords[0].end + tailSilence);
      matchedEndWord = laterWords[0].word;
      hasSnappedEnd = true;
      duration = snappedEnd - snappedStart;
    }
  }

  // If snapped duration is longer than maxDur, step end backward to nearest word boundary
  if (duration > maxDur) {
    const target = snappedStart + maxDur;
    const earlierWords = validWords.filter((w) => w.end <= target && w.end - snappedStart >= minDur);
    if (earlierWords.length > 0) {
      const steppedWord = earlierWords[earlierWords.length - 1];
      snappedEnd = Math.min(sourceDur, steppedWord.end + tailSilence);
      matchedEndWord = steppedWord.word;
      hasSnappedEnd = true;
      duration = snappedEnd - snappedStart;
    }
  }

  // Final sanity validation: if boundaries became inverted or invalid, fall back safely
  if (snappedEnd <= snappedStart || duration < Math.min(2.0, minDur)) {
    return fallbackResult;
  }

  return {
    start_seconds: Number(snappedStart.toFixed(3)),
    end_seconds: Number(snappedEnd.toFixed(3)),
    duration_seconds: Number(duration.toFixed(3)),
    was_snapped: hasSnappedStart || hasSnappedEnd,
    snapped_start: hasSnappedStart,
    snapped_end: hasSnappedEnd,
    matched_start_word: matchedStartWord,
    matched_end_word: matchedEndWord,
    lead_silence_applied: Number(leadApplied.toFixed(3)),
    tail_silence_applied: Number(tailApplied.toFixed(3)),
    explanation: `Successfully snapped boundaries: start snapped to "${matchedStartWord || 'n/a'}" (-${leadApplied.toFixed(2)}s lead), end snapped to "${matchedEndWord || 'n/a'}" (+${tailApplied.toFixed(2)}s tail).`,
  };
}

/**
 * Calculates adaptive clip-count targets based on source video duration and available candidates.
 * 
 * Based on OpenShorts empirical user retention research:
 * Delivering >=4 clips yields significantly higher user return rates (16.1% vs 0.4%) compared to
 * delivering only 1–3 clips. However, clips are never manufactured if source footage is genuinely too short.
 */
export function calculateAdaptiveClipCount(
  videoDurationSec: number,
  candidateCount: number,
  userRequestedCount?: number
): { minClips: number; maxClips: number; targetClips: number; reason: string } {
  if (typeof userRequestedCount === 'number' && userRequestedCount > 0) {
    const clamped = Math.max(1, Math.min(20, userRequestedCount));
    return {
      minClips: clamped,
      maxClips: clamped,
      targetClips: clamped,
      reason: `User explicitly requested ${clamped} clips.`,
    };
  }

  const duration = Math.max(0, Number(videoDurationSec) || 0);

  // Short source under 3 minutes
  if (duration < 180) {
    return {
      minClips: 1,
      maxClips: 3,
      targetClips: Math.min(2, Math.max(1, candidateCount)),
      reason: 'Short source (<3 min); targeted 1–3 clips to avoid over-segmentation.',
    };
  }

  // Medium source 3 to 10 minutes
  if (duration < 600) {
    return {
      minClips: 2,
      maxClips: 5,
      targetClips: Math.min(4, Math.max(2, candidateCount)),
      reason: 'Medium source (3–10 min); targeted 2–5 clips.',
    };
  }

  // Long source 10 to 30 minutes
  if (duration < 1800) {
    const floor = Math.min(candidateCount, 4); // Enforce empirical 4+ floor if candidates exist
    return {
      minClips: floor,
      maxClips: 8,
      targetClips: Math.min(6, Math.max(floor, candidateCount)),
      reason: 'Standard long-form podcast (10–30 min); empirical 4+ floor applied for optimal retention.',
    };
  }

  // Very long source 30+ minutes
  const floor = Math.min(candidateCount, 6);
  return {
    minClips: floor,
    maxClips: 12,
    targetClips: Math.min(10, Math.max(floor, candidateCount)),
    reason: 'Deep long-form content (30+ min); targeted 6–12 clips.',
  };
}

/**
 * Deduplicates candidate moments based on pairwise temporal overlap.
 * 
 * OpenShorts empirical finding: an overlap ratio threshold of 0.25 (25%) is optimal.
 * A 0.50 threshold allowed duplicate punchlines and identical punchlines with shifted edges
 * to survive into the final candidate shortlist.
 */
export function deduplicateCandidatesByOverlap<
  T extends { start_seconds: number; end_seconds: number; engagement_score?: number; score?: number }
>(candidates: T[], maxOverlapRatio = 0.25): T[] {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return candidates || [];
  }

  const getScore = (c: T): number => Number(c.engagement_score ?? c.score ?? 0);

  // Sort descending by score, tie-breaking by earlier start time
  const sorted = [...candidates].sort((a, b) => {
    const scoreDiff = getScore(b) - getScore(a);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return a.start_seconds - b.start_seconds;
  });

  const kept: T[] = [];

  for (const candidate of sorted) {
    const cStart = candidate.start_seconds;
    const cEnd = candidate.end_seconds;
    const cDur = Math.max(1e-6, cEnd - cStart);

    let hasClash = false;
    for (const existing of kept) {
      const eStart = existing.start_seconds;
      const eEnd = existing.end_seconds;
      const eDur = Math.max(1e-6, eEnd - eStart);

      const overlapStart = Math.max(cStart, eStart);
      const overlapEnd = Math.min(cEnd, eEnd);
      const overlapDur = Math.max(0, overlapEnd - overlapStart);

      const shorterDur = Math.min(cDur, eDur);
      if (overlapDur > 0 && overlapDur / shorterDur >= maxOverlapRatio) {
        hasClash = true;
        break;
      }
    }

    if (!hasClash) {
      kept.push(candidate);
    }
  }

  // Return surviving candidates in chronological transcript order
  return kept.sort((a, b) => a.start_seconds - b.start_seconds);
}
