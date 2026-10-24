/**
 * Genre roadmap Phase 0 — selection-quality metrics.
 *
 * Pure, dependency-free metrics for the automatable subset of the benchmark
 * (everything computable from transcripts, boundaries, and references without
 * an LLM or human raters). The runner emits NOT MEASURED for every dimension
 * that needs recorded LLM output or human labels — nothing here invents data.
 */

export interface BenchWord {
  start: number;
  end: number;
  text: string;
  sentenceIndex: number;
}

export interface BenchReferenceMoment {
  id: string;
  start: number;
  end: number;
  description: string;
}

export interface BenchCandidate {
  start: number;
  end: number;
  /** Model ranking score; required for Precision@K / Recall@K and rank agreement. */
  score?: number;
}

export interface BenchSilence {
  start: number;
  end: number;
}

export interface SelectionMetricsInput {
  words: BenchWord[];
  references: BenchReferenceMoment[];
  candidates: BenchCandidate[];
  silence: BenchSilence[];
  /** Candidate indexes (into `candidates`) ordered best-first by human raters. */
  humanRanking?: number[] | null;
}

export interface SelectionMetricReport {
  candidateCount: number;
  /** Fraction of clip boundaries landing strictly inside a spoken word. */
  midWordRate: number;
  /** Fraction of clip boundaries landing strictly inside a sentence. */
  midSentenceRate: number;
  /** Fraction of clips whose END lands mid-sentence (truncation). */
  endTruncationRate: number;
  /** Total overlap of clips with silence, as a fraction of total clip duration. */
  deadAirRate: number;
  /** Mean pairwise overlap ratio across the selected set (redundancy). */
  redundancyRate: number;
  /** Mean |start| + |end| boundary error against matched references (seconds). */
  meanBoundaryErrorSec: number | null;
  /** References matched by at least one candidate (IoU >= threshold) / all references. */
  referenceRecall: number | null;
  precisionAtK: number | null;
  recallAtK: number | null;
  kUsed: number | null;
  /** Spearman rank correlation between model order and human order, when provided. */
  rankCorrelation: number | null;
  notes: string[];
}

const EDGE_TOLERANCE_SEC = 0.02;
const IOU_MATCH_THRESHOLD = 0.3;

function overlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const shorter = Math.min(aEnd - aStart, bEnd - bStart);
  if (shorter <= 0) return 0;
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  return overlap / shorter;
}

function iou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  if (union <= 0) return 0;
  const inter = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  return inter / union;
}

export function buildSentenceSpans(words: BenchWord[]): Array<{ start: number; end: number }> {
  const bySentence = new Map<number, BenchWord[]>();
  for (const w of words) {
    const list = bySentence.get(w.sentenceIndex) || [];
    list.push(w);
    bySentence.set(w.sentenceIndex, list);
  }
  return [...bySentence.values()]
    .filter((ws) => ws.length > 0)
    .map((ws) => ({
      start: Math.min(...ws.map((w) => w.start)),
      end: Math.max(...ws.map((w) => w.end)),
    }));
}

/** A boundary is mid-word when it falls strictly inside a word beyond edge tolerance. */
export function isMidWord(boundary: number, words: BenchWord[], tolerance = EDGE_TOLERANCE_SEC): boolean {
  return words.some((w) => boundary > w.start + tolerance && boundary < w.end - tolerance);
}

export function midWordRate(candidates: BenchCandidate[], words: BenchWord[]): number {
  if (candidates.length === 0 || words.length === 0) return 0;
  let violations = 0;
  let boundaries = 0;
  for (const c of candidates) {
    boundaries += 2;
    if (isMidWord(c.start, words)) violations++;
    if (isMidWord(c.end, words)) violations++;
  }
  return violations / boundaries;
}

export function midSentenceRate(candidates: BenchCandidate[], words: BenchWord[]): number {
  return boundarySentenceViolationRate(candidates, words, 'both');
}

export function endTruncationRate(candidates: BenchCandidate[], words: BenchWord[]): number {
  return boundarySentenceViolationRate(candidates, words, 'end');
}

function boundarySentenceViolationRate(
  candidates: BenchCandidate[],
  words: BenchWord[],
  side: 'both' | 'end'
): number {
  if (candidates.length === 0 || words.length === 0) return 0;
  const sentences = buildSentenceSpans(words);
  let violations = 0;
  let boundaries = 0;
  for (const c of candidates) {
    const points = side === 'both' ? [c.start, c.end] : [c.end];
    boundaries += points.length;
    for (const p of points) {
      if (
        sentences.some((s) => p > s.start + EDGE_TOLERANCE_SEC && p < s.end - EDGE_TOLERANCE_SEC)
      ) {
        violations++;
      }
    }
  }
  return violations / boundaries;
}

export function deadAirRate(candidates: BenchCandidate[], silence: BenchSilence[]): number {
  const totalDuration = candidates.reduce((acc, c) => acc + Math.max(0, c.end - c.start), 0);
  if (totalDuration <= 0) return 0;
  const silenceOverlap = candidates.reduce((acc, c) => {
    return (
      acc +
      silence.reduce((sAcc, s) => {
        return sAcc + Math.max(0, Math.min(c.end, s.end) - Math.max(c.start, s.start));
      }, 0)
    );
  }, 0);
  return silenceOverlap / totalDuration;
}

export function redundancyRate(candidates: BenchCandidate[]): number {
  if (candidates.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      sum += overlapRatio(
        candidates[i].start,
        candidates[i].end,
        candidates[j].start,
        candidates[j].end
      );
      pairs++;
    }
  }
  return pairs > 0 ? sum / pairs : 0;
}

/**
 * Matches each reference to its best-IoU candidate (>= threshold). Returns the
 * mean absolute boundary error for matched pairs; null when nothing matches.
 */
export function boundaryError(
  candidates: BenchCandidate[],
  references: BenchReferenceMoment[],
  threshold = IOU_MATCH_THRESHOLD
): { meanErrorSec: number | null; matchedRefs: number } {
  if (candidates.length === 0 || references.length === 0) {
    return { meanErrorSec: null, matchedRefs: 0 };
  }
  let totalError = 0;
  let matched = 0;
  for (const ref of references) {
    let bestIou = 0;
    let best: BenchCandidate | null = null;
    for (const c of candidates) {
      const v = iou(ref.start, ref.end, c.start, c.end);
      if (v > bestIou) {
        bestIou = v;
        best = c;
      }
    }
    if (best && bestIou >= threshold) {
      matched++;
      totalError += Math.abs(best.start - ref.start) + Math.abs(best.end - ref.end);
    }
  }
  return { meanErrorSec: matched > 0 ? totalError / matched : null, matchedRefs: matched };
}

function sortByScoreDesc(candidates: BenchCandidate[]): BenchCandidate[] {
  return [...candidates].sort(
    (a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY)
  );
}

export function precisionRecallAtK(
  candidates: BenchCandidate[],
  references: BenchReferenceMoment[],
  k?: number,
  threshold = IOU_MATCH_THRESHOLD
): { precision: number | null; recall: number | null; k: number | null } {
  if (candidates.length === 0 || references.length === 0) {
    return { precision: null, recall: null, k: null };
  }
  const ranked = sortByScoreDesc(candidates).filter((c) => typeof c.score === 'number');
  if (ranked.length === 0) return { precision: null, recall: null, k: null };
  const effectiveK = Math.max(1, Math.min(k ?? ranked.length, ranked.length));
  const topK = ranked.slice(0, effectiveK);
  const hitRefs = new Set<string>();
  let hits = 0;
  for (const c of topK) {
    for (const ref of references) {
      if (!hitRefs.has(ref.id) && iou(ref.start, ref.end, c.start, c.end) >= threshold) {
        hitRefs.add(ref.id);
        hits++;
        break;
      }
    }
  }
  return {
    precision: hits / effectiveK,
    recall: hitRefs.size / references.length,
    k: effectiveK,
  };
}

export function referenceRecall(
  candidates: BenchCandidate[],
  references: BenchReferenceMoment[],
  threshold = IOU_MATCH_THRESHOLD
): number | null {
  if (references.length === 0 || candidates.length === 0) return null;
  const { matchedRefs } = boundaryError(candidates, references, threshold);
  return matchedRefs / references.length;
}

/** Spearman rank correlation with average-rank tie handling; null when undefined. */
export function spearmanCorrelation(modelOrder: number[], humanOrder: number[]): number | null {
  const n = modelOrder.length;
  if (n < 2 || humanOrder.length !== n) return null;

  const averageRanks = (order: number[]): number[] => {
    const sorted = [...order].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(order.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) ranks[sorted[t].i] = avg;
      i = j + 1;
    }
    return ranks;
  };

  const rm = averageRanks(modelOrder);
  const rh = averageRanks(humanOrder);
  const d2 = rm.reduce((acc, r, idx) => acc + Math.pow(r - rh[idx], 2), 0);
  const denom = n * (n * n - 1);
  if (denom === 0) return null;
  return 1 - (6 * d2) / denom;
}

/**
 * Aggregates every automatable metric for one fixture. Dimensions that need
 * real LLM output or human ratings are reported separately as NOT MEASURED —
 * they are never filled with placeholders.
 */
export function evaluateSelection(input: SelectionMetricsInput): SelectionMetricReport {
  const notes: string[] = [];
  const rankable = input.candidates.filter((c) => typeof c.score === 'number');

  let precisionAtK: number | null = null;
  let recallAtK: number | null = null;
  let kUsed: number | null = null;
  if (rankable.length > 0 && input.references.length > 0) {
    const pr = precisionRecallAtK(input.candidates, input.references);
    precisionAtK = pr.precision;
    recallAtK = pr.recall;
    kUsed = pr.k;
  } else {
    notes.push('Precision/Recall@K require scored candidates and reference moments.');
  }

  const boundary = boundaryError(input.candidates, input.references);
  const meanBoundaryErrorSec = boundary.meanErrorSec;
  if (meanBoundaryErrorSec === null) {
    notes.push('Boundary error unmatched: no candidate overlapped a reference (IoU >= 0.3).');
  }

  let rankCorrelation: number | null = null;
  if (input.humanRanking && input.humanRanking.length >= 2 && rankable.length === input.humanRanking.length) {
    const modelOrder = sortByScoreDesc(input.candidates)
      .map((c) => input.candidates.indexOf(c))
      .filter((idx) => input.humanRanking!.includes(idx));
    rankCorrelation = spearmanCorrelation(modelOrder, input.humanRanking);
  } else {
    notes.push('Rank correlation NOT MEASURED: requires a human ranking covering all scored candidates.');
  }

  return {
    candidateCount: input.candidates.length,
    midWordRate: midWordRate(input.candidates, input.words),
    midSentenceRate: midSentenceRate(input.candidates, input.words),
    endTruncationRate: endTruncationRate(input.candidates, input.words),
    deadAirRate: deadAirRate(input.candidates, input.silence),
    redundancyRate: redundancyRate(input.candidates),
    meanBoundaryErrorSec,
    referenceRecall: referenceRecall(input.candidates, input.references),
    precisionAtK,
    recallAtK,
    kUsed,
    rankCorrelation,
    notes,
  };
}

export const NOT_MEASURED_LLM_NOTE =
  'LLM selection quality NOT MEASURED: requires an approved provider run with recorded candidate output (genre roadmap Phase 3).';
export const NOT_MEASURED_HUMAN_NOTE =
  'Human-rated completeness/genre relevance NOT MEASURED: requires rated reference clips (genre roadmap Phase 3).';
