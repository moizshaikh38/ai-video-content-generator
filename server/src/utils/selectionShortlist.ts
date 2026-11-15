/**
 * Selection staging (OpenShorts-style): cheap shortlist before detailed scoring.
 *
 * Whole-transcript LLM discovery stays unchanged (recall: every moment in the
 * source can still be proposed). The shortlist only bounds how many proposed
 * candidates go through the expensive detailed stage (multimodal scoring,
 * word snapping, shot-boundary fusion). Ranking uses the AI's own sub-scores -
 * the same base inputs that feed the vireo_score - so detailed effort goes to
 * the candidates most likely to survive final selection.
 *
 * Recall guards:
 *  - Passthrough (order preserved) when candidate count <= budget.
 *  - Budget floor: max(targetCount * MARGIN, MIN_DETAILED) so final selection
 *    always has a deep pool after dedupe.
 *  - Stable sort: ties keep discovery order.
 */

export interface ShortlistScores {
  hook_score?: number;
  standalone_score?: number;
  insight_score?: number;
  emotion_score?: number;
  platform_score?: number;
}

export const SHORTLIST_MARGIN = 3;
export const SHORTLIST_MIN_DETAILED = 12;

/** Mean of the available AI sub-scores; missing scores are skipped. */
export function baseCompositeScore(c: ShortlistScores): number {
  const vals = [c.hook_score, c.standalone_score, c.insight_score, c.emotion_score, c.platform_score]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function shortlistBudget(targetCount: number): number {
  const t = Number.isFinite(targetCount) && targetCount > 0 ? Math.floor(targetCount) : 1;
  return Math.max(t * SHORTLIST_MARGIN, SHORTLIST_MIN_DETAILED);
}

/**
 * Returns the candidates to send through detailed scoring. Either the input
 * array itself (passthrough, identical order) or a new array of the top
 * `budget` candidates by base composite score, in discovery order.
 */
export function shortlistCandidatesForDetailedScoring<T extends ShortlistScores>(
  candidates: T[],
  targetCount: number
): T[] {
  const budget = shortlistBudget(targetCount);
  if (candidates.length <= budget) return candidates;
  const ranked = candidates
    .map((c, i) => ({ c, i, s: baseCompositeScore(c) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, budget)
    .sort((a, b) => a.i - b.i);
  return ranked.map((r) => r.c);
}
