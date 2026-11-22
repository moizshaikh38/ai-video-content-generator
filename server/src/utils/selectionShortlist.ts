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
 *    can retain a deep pool when enough distinct proposals exist.
 *  - Over budget, exact main-span/teaser repeats cannot crowd out all distinct
 *    proposed footage. Unknown identities stay independent.
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

/** Exact source IDs only. No fuzzy overlap grouping or guessed identity. */
function sourceProposalKey(candidate: ShortlistScores): string | undefined {
  const row = candidate as ShortlistScores & {
    start_segment_index?: unknown;
    end_segment_index?: unknown;
    cold_open_segment_index?: unknown;
  };
  const isIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const start = row.start_segment_index, end = row.end_segment_index;
  const teaser = row.cold_open_segment_index;
  if (!isIndex(start) || !isIndex(end) || end < start) return undefined;
  if (teaser !== undefined && teaser !== null && !isIndex(teaser)) return undefined;
  return `${start}:${end}:${teaser ?? 'none'}`;
}

/**
 * Under budget, preserve the original array. Over budget, rank as before but
 * first reserve slots for distinct exact source proposals, including teaser
 * identity. If fewer distinct proposals exist, fill with the best remaining
 * duplicates. Return original objects in discovery order, within the same cap.
 */
export function shortlistCandidatesForDetailedScoring<T extends ShortlistScores>(
  candidates: T[],
  targetCount: number
): T[] {
  const budget = shortlistBudget(targetCount);
  if (candidates.length <= budget) return candidates;
  const ranked = candidates
    .map((c, i) => ({ c, i, s: baseCompositeScore(c) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i));
  const selected: typeof ranked = [];
  const deferred: typeof ranked = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = sourceProposalKey(row.c);
    if (key !== undefined && seen.has(key)) {
      deferred.push(row);
      continue;
    }
    if (key !== undefined) seen.add(key);
    selected.push(row);
    if (selected.length === budget) break;
  }
  if (selected.length < budget) selected.push(...deferred.slice(0, budget - selected.length));
  return selected.sort((a, b) => a.i - b.i).map((row) => row.c);
}
