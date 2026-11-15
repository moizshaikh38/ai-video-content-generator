import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  shortlistCandidatesForDetailedScoring,
  shortlistBudget,
  baseCompositeScore,
} from '../utils/selectionShortlist.js';
import {
  calculateAdaptiveClipCount,
  deduplicateCandidatesByOverlap,
} from '../utils/wordSnappingUtils.js';
import { selectDiverseCandidates } from '../utils/diverseSelection.js';

/** Build an AI candidate whose every sub-score equals `score`. */
function cand(i: number, score: number, start: number, end: number) {
  return {
    id: `c${i}`,
    start_segment_index: i,
    end_segment_index: i + 1,
    title: `Moment ${i}`,
    hook: `hook ${i}`,
    reason: `reason ${i}`,
    category: 'insight' as const,
    hook_score: score,
    standalone_score: score,
    insight_score: score,
    emotion_score: score,
    platform_score: score,
    start_seconds: start,
    end_seconds: end,
    engagement_score: score, // mirrors the no-multimodal case: base scores drive ranking
  };
}

describe('Selection staging: shortlist before detailed scoring', () => {
  it('is a passthrough (same array, same order) when at or under budget', () => {
    const list = [cand(0, 50, 0, 30), cand(1, 90, 60, 90), cand(2, 10, 120, 150)];
    const out = shortlistCandidatesForDetailedScoring(list, 4);
    assert.strictEqual(out, list, 'under budget returns the identical array');
  });

  it('budget = max(3x target, 12)', () => {
    assert.equal(shortlistBudget(4), 12);
    assert.equal(shortlistBudget(6), 18);
    assert.equal(shortlistBudget(1), 12);
  });

  it('keeps exactly the top-budget candidates by base composite, in discovery order', () => {
    // 30 candidates, scores descending with index so the top 12 are unambiguous
    const list = Array.from({ length: 30 }, (_, i) => cand(i, 100 - i, i * 60, i * 60 + 30));
    const out = shortlistCandidatesForDetailedScoring(list, 2); // budget = 12
    assert.equal(out.length, 12);
    assert.deepEqual(out.map((c) => c.id), Array.from({ length: 12 }, (_, i) => `c${i}`));
    // stable: ties keep discovery order
    const tied = Array.from({ length: 20 }, (_, i) => cand(i, 50, i * 60, i * 60 + 30));
    const tiedOut = shortlistCandidatesForDetailedScoring(tied, 1); // budget 12
    assert.deepEqual(tiedOut.map((c) => c.id), Array.from({ length: 12 }, (_, i) => `c${i}`));
  });

  it('baseCompositeScore averages available sub-scores and handles missing ones', () => {
    assert.equal(baseCompositeScore({ hook_score: 80, standalone_score: 60 }), 70);
    assert.equal(baseCompositeScore({}), 0);
  });

  // Regression guard: with the shortlist stage wired in, the FINAL selected set
  // must not lose any winner the un-staged pipeline would have picked, when
  // detailed scoring preserves base-score ranking (the no-multimodal case).
  it('final selection with staging matches final selection without staging (no-multimodal recall)', () => {
    // 40 non-overlapping moments across a 40-minute source; 6 clear winners.
    const all = Array.from({ length: 40 }, (_, i) => {
      const score = i < 6 ? 95 - i : 60 - i; // top 6 stand out
      return cand(i, score, i * 60, i * 60 + 45);
    });
    const videoDuration = 2400;

    const runPipeline = (pool: typeof all) => {
      const deduped = deduplicateCandidatesByOverlap(pool, 0.25);
      const targets = calculateAdaptiveClipCount(videoDuration, deduped.length, undefined);
      return selectDiverseCandidates(deduped, {
        maxClips: targets.maxClips,
        redundancyPenalty: 0.5,
      }).map((c) => c.id).sort();
    };

    const fullSelection = runPipeline(all);
    const targets = calculateAdaptiveClipCount(videoDuration, all.length, undefined);
    const staged = shortlistCandidatesForDetailedScoring(all, targets.targetClips);
    const stagedSelection = runPipeline(staged);

    assert.deepEqual(stagedSelection, fullSelection,
      'staging must not change the final selected set when detailed ranking follows base scores');
    // every full-pipeline winner survived the shortlist
    for (const id of fullSelection) {
      assert.ok(staged.some((c) => c.id === id), `winner ${id} retained in shortlist`);
    }
  });

  it('never drops below what final selection could need even for tiny targets', () => {
    const list = Array.from({ length: 50 }, (_, i) => cand(i, 100 - i, i * 60, i * 60 + 30));
    const out = shortlistCandidatesForDetailedScoring(list, 1);
    assert.ok(out.length >= 12, 'floor of 12 detailed candidates protects post-dedupe depth');
  });
});
