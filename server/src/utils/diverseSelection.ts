/**
 * Genre roadmap Phase 4 — diversity-aware final selection.
 *
 * Replaces the flat "sort by score, slice top-N" cut with greedy Maximal
 * Marginal Relevance: each pick maximizes relevance minus a genre-tunable
 * penalty proportional to its maximum temporal overlap with the already
 * selected set. Overlap is measured relative to the shorter clip, matching
 * the dedup convention used across the pipeline and the benchmark harness.
 *
 * Storytelling tolerates almost no repeated moments; gaming highlight reels
 * accept more. The penalty lives on the genre profile, not in this util.
 */

export interface DiverseSelectionCandidate {
  start_seconds: number;
  end_seconds: number;
  engagement_score: number;
}

export interface DiverseSelectionOptions {
  maxClips: number;
  /** 0 = pure relevance ranking, 1 = strongest diversity pressure. */
  redundancyPenalty: number;
}

export function overlapRelativeToShorter(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  const shorter = Math.min(aEnd - aStart, bEnd - bStart);
  if (shorter <= 0) return 0;
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  return overlap / shorter;
}

export function selectDiverseCandidates<T extends DiverseSelectionCandidate>(
  candidates: T[],
  options: DiverseSelectionOptions
): T[] {
  const maxClips = Math.max(0, Math.floor(options.maxClips));
  const penalty = Math.min(1, Math.max(0, options.redundancyPenalty ?? 0.5));
  if (maxClips === 0) return [];

  const pool = [...candidates].sort((a, b) => b.engagement_score - a.engagement_score);
  const selected: T[] = [];

  while (selected.length < maxClips && pool.length > 0) {
    let bestIndex = 0;
    let bestMarginal = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      const maxOverlap =
        selected.length === 0
          ? 0
          : Math.max(
              ...selected.map((s) =>
                overlapRelativeToShorter(s.start_seconds, s.end_seconds, candidate.start_seconds, candidate.end_seconds)
              )
            );
      // Relevance (0–100) minus diversity pressure; the 100 factor puts both
      // terms on the same scale.
      const marginal = candidate.engagement_score - penalty * 100 * maxOverlap;
      if (marginal > bestMarginal) {
        bestMarginal = marginal;
        bestIndex = i;
      }
    }
    selected.push(pool[bestIndex]);
    pool.splice(bestIndex, 1);
  }

  return selected;
}
