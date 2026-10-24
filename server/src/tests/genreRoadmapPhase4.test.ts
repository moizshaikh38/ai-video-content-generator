import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  selectDiverseCandidates,
  overlapRelativeToShorter,
} from '../utils/diverseSelection.js';
import { MultimodalScoringService } from '../services/multimodal/multimodalScoringService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { GenreProfileConfig } from '../types/index.js';

/**
 * Genre roadmap Phase 4 — diversity-aware selection and mechanical contextual
 * completeness; Phase 6-lite — boundary property checks on fixture words.
 */

const profileOf = (genre: string): GenreProfileConfig =>
  GenreIntelligenceService.getGenreProfile(genre);

describe('Genre Phase 4 — MMR diverse selection', () => {
  const clustered = [
    { start_seconds: 0, end_seconds: 10, engagement_score: 95 },
    { start_seconds: 1, end_seconds: 10.5, engagement_score: 93 }, // duplicate of first
    { start_seconds: 1.5, end_seconds: 11, engagement_score: 91 }, // duplicate of first
    { start_seconds: 60, end_seconds: 72, engagement_score: 80 },  // distinct moment
  ];

  it('prefers a distinct lower-scored moment over near-duplicates of the leader', () => {
    const picked = selectDiverseCandidates(clustered, { maxClips: 2, redundancyPenalty: 0.8 });
    assert.equal(picked.length, 2);
    assert.equal(picked[0].engagement_score, 95); // leader first
    // With penalty 0.8 the second duplicate's marginal is 93-80=13 while the
    // distinct moment's is 80 — the distinct moment must win the slot.
    assert.equal(picked[1].start_seconds, 60);
  });

  it('degrades to pure relevance ranking when the penalty is zero', () => {
    const picked = selectDiverseCandidates(clustered, { maxClips: 3, redundancyPenalty: 0 });
    assert.deepEqual(
      picked.map((c) => c.engagement_score),
      [95, 93, 91]
    );
  });

  it('is deterministic and respects maxClips, including zero', () => {
    const a = selectDiverseCandidates(clustered, { maxClips: 4, redundancyPenalty: 0.5 });
    const b = selectDiverseCandidates(clustered, { maxClips: 4, redundancyPenalty: 0.5 });
    assert.deepEqual(a, b);
    assert.equal(a.length, 4);
    assert.deepEqual(selectDiverseCandidates(clustered, { maxClips: 0, redundancyPenalty: 0.5 }), []);
  });

  it('overlap is measured relative to the shorter clip (full containment = 1)', () => {
    assert.equal(overlapRelativeToShorter(0, 10, 2, 7), 1);
    assert.equal(overlapRelativeToShorter(0, 10, 5, 15), 0.5);
  });
});

describe('Genre Phase 4 — per-genre redundancy penalties', () => {
  it('gives storytelling the strictest pressure and gaming/sports the loosest', () => {
    expectPenalty('storytelling', 0.8);
    expectPenalty('gaming', 0.3);
    expectPenalty('sports', 0.3);
    expectPenalty('news_politics', 0.7);
    expectPenalty('comedy_entertainment', 0.4);
    expectPenalty('general', 0.5);
  });

  it('defines the penalty on all 11 genres', () => {
    for (const profile of GenreIntelligenceService.getAllGenreProfiles()) {
      assert.equal(
        typeof profile.redundancyPenalty, 'number',
        `${profile.genre} is missing redundancyPenalty`
      );
      assert.ok(profile.redundancyPenalty! >= 0 && profile.redundancyPenalty! <= 1);
    }
  });

  function expectPenalty(genre: string, expected: number) {
    assert.equal(profileOf(genre).redundancyPenalty, expected, genre);
  }
});

describe('Genre Phase 4 — mechanical contextual completeness guard', () => {
  const base = {
    title: 'Answer clip',
    hook: 'It collapsed because nobody onboarded anyone',
  };

  const score = (over: Record<string, unknown>) =>
    MultimodalScoringService.scoreCandidate({
      start_seconds: 10,
      end_seconds: 40,
      ...base,
      ...over,
      genreProfile: profileOf('podcast_interview'),
      baseHookScore: 80,
      baseStandaloneScore: 80,
      baseInsightScore: 80,
    } as any);

  it('penalizes a clip that answers a question it never includes', () => {
    const penalized = score({
      precedingSegment: { text: 'so why did the company actually collapse?', end: 9.5 },
      candidateText: 'it collapsed because nobody onboarded anyone properly',
    });
    assert.ok(
      penalized.explanation.reasons.some((r) => /answers a question/.test(r)),
      'explanation must disclose the context penalty'
    );

    const control = score({
      precedingSegment: { text: 'plain statement with no question', end: 9.5 },
      candidateText: 'it collapsed because nobody onboarded anyone properly',
    });
    assert.ok(
      penalized.vireo_score < control.vireo_score,
      `penalized ${penalized.vireo_score} must score below control ${control.vireo_score}`
    );
  });

  it('does not penalize when the question is inside the clip or far away', () => {
    const included = score({
      precedingSegment: { text: 'irrelevant', end: 2 },
      candidateText: 'so why did it collapse? it collapsed because nobody onboarded anyone',
    });
    const control = score({
      precedingSegment: { text: 'irrelevant', end: 2 },
      candidateText: 'it collapsed because nobody onboarded anyone properly',
    });
    assert.equal(included.vireo_score, control.vireo_score);

    const farAway = score({
      precedingSegment: { text: 'why did it collapse?', end: 2 },
      candidateText: 'it collapsed because nobody onboarded anyone properly',
    });
    assert.equal(farAway.vireo_score, control.vireo_score);
  });
});

describe('Genre Phase 6-lite — boundary property checks (wired through scoring)', () => {
  it('reports a redistribution note and null dimension transparently when the LLM omits scores', () => {
    const result = MultimodalScoringService.scoreCandidate({
      start_seconds: 10,
      end_seconds: 40,
      title: 'Partial',
      hook: 'hook line',
      genreProfile: profileOf('podcast_interview'),
      baseHookScore: 90,
      baseStandaloneScore: null,
      baseInsightScore: 90,
      precedingSegment: { text: 'a question here?', end: 9 },
      candidateText: 'an answer with no question mark inside',
    });
    // The context penalty only applies to a scored standalone dimension; with
    // standalone absent it must NOT silently fabricate one.
    assert.equal(result.explanation.standalone_score, null);
    assert.ok(!result.explanation.reasons.some((r) => /answers a question/.test(r)));
    assert.ok(result.explanation.reasons.some((r) => /standalone subscore/.test(r)));
  });

  it('production analysis wires diversity selection and context passing', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/clipAnalysisService.ts'),
      'utf8'
    );
    assert.match(src, /selectDiverseCandidates\(deduped, \{\s*\n\s*maxClips: adaptiveTargets\.maxClips,\s*\n\s*redundancyPenalty: genreProfile\.redundancyPenalty \?\? 0\.5/);
    assert.match(src, /precedingSegment:\s*\n\s*precedingSeg && typeof precedingSeg\.text === 'string'/);
  });
});
