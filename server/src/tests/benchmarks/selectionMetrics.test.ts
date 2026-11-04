import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deadAirRate,
  endTruncationRate,
  evaluateSelection,
  midSentenceRate,
  midWordRate,
  precisionRecallAtK,
  redundancyRate,
  spearmanCorrelation,
  NOT_MEASURED_HUMAN_NOTE,
  NOT_MEASURED_LLM_NOTE,
} from './selectionMetrics.js';
import { buildFixtures, fixtureInput } from './syntheticFixtures.js';

/**
 * Phase 0 — metric-harness validation. The metrics must detect known defects on
 * hand-built cases, and the golden fixture sets must be perfect before any
 * engine output is measured against this harness.
 */

const WORD = 0.4;

const makeWords = (sentenceTexts: string[], perWord = WORD) => {
  const words = [];
  let t = 0;
  sentenceTexts.forEach((text, si) => {
    for (const token of text.split(' ')) {
      words.push({ start: t, end: t + perWord, text: token, sentenceIndex: si });
      t += perWord + 0.02;
    }
    t += 0.1;
  });
  return words;
};

describe('Phase 0 — mid-word / mid-sentence metrics', () => {
  const words = makeWords(['one two three four', 'five six seven']);

  it('flags boundaries strictly inside words and passes clean boundaries', () => {
    const mid = midWordRate([{ start: words[1].start + 0.2, end: words[3].end }], words);
    assert.equal(mid, 0.5); // one of two boundaries mid-word
    const clean = midWordRate([{ start: words[0].start, end: words[3].end }], words);
    assert.equal(clean, 0);
  });

  it('counts end-side truncation separately', () => {
    // Sentence 0 spans words[0..3]; ending inside it is a truncation.
    const truncated = endTruncationRate([{ start: words[0].start, end: words[2].end }], words);
    assert.equal(truncated, 1);
    const complete = endTruncationRate(
      [{ start: words[0].start, end: words[3].end }],
      words
    );
    assert.equal(complete, 0);
    const overall = midSentenceRate([{ start: words[0].start, end: words[2].end }], words);
    assert.equal(overall, 0.5);
  });
});

describe('Phase 0 — dead air and redundancy', () => {
  it('measures silence overlap fraction', () => {
    const silence = [{ start: 0, end: 2 }];
    assert.equal(deadAirRate([{ start: 0, end: 2 }], silence), 1);
    assert.equal(deadAirRate([{ start: 0, end: 4 }], silence), 0.5);
    assert.equal(deadAirRate([{ start: 2.5, end: 3 }], silence), 0);
  });

  it('detects duplicate selections via pairwise overlap', () => {
    // Overlap ratio is relative to the SHORTER clip: full containment = 1.0.
    assert.equal(redundancyRate([{ start: 0, end: 10 }, { start: 0.5, end: 10 }]), 1);
    assert.equal(redundancyRate([{ start: 0, end: 5 }, { start: 10, end: 15 }]), 0);
    assert.equal(redundancyRate([{ start: 0, end: 5 }]), 0);
  });
});

describe('Phase 0 — precision/recall@K and boundary error', () => {
  const references = [
    { id: 'r1', start: 0, end: 4, description: 'arc one' },
    { id: 'r2', start: 10, end: 14, description: 'arc two' },
  ];

  it('rewards top-ranked hits and penalizes misses', () => {
    const candidates = [
      { start: 0, end: 4, score: 90 },   // hits r1
      { start: 50, end: 54, score: 80 }, // miss
      { start: 10, end: 14, score: 70 }, // hits r2
    ];
    const pr = precisionRecallAtK(candidates, references, 2);
    assert.equal(pr.precision, 0.5);
    assert.equal(pr.recall, 0.5);
    assert.equal(pr.k, 2);

    const full = precisionRecallAtK(candidates, references, 3);
    assert.equal(full.precision, 2 / 3);
    assert.equal(full.recall, 1);
  });

  it('reports null metrics when inputs cannot support them', () => {
    const unscored = precisionRecallAtK([{ start: 0, end: 4 }], references, 2);
    assert.equal(unscored.precision, null);
    assert.equal(unscored.k, null);
  });
});

describe('Phase 0 — rank correlation', () => {
  it('returns 1 for identical orderings and negative for inversions', () => {
    assert.equal(spearmanCorrelation([1, 2, 3], [1, 2, 3]), 1);
    assert.equal(spearmanCorrelation([3, 2, 1], [1, 2, 3]), -1);
  });

  it('handles ties with average ranks and rejects mismatched lengths', () => {
    // [1,1,3] → average ranks [1.5,1.5,3]; d² = 0.25+0.25+0 = 0.5
    // ρ = 1 − 6·0.5/(3·8) = 1 − 3/24 = 0.875
    assert.equal(spearmanCorrelation([1, 1, 3], [1, 2, 3]), 0.875);
    assert.equal(spearmanCorrelation([1, 2], [1, 2, 3]), null);
    assert.equal(spearmanCorrelation([5], [5]), null);
  });
});

describe('Phase 0 — fixture sanity via evaluateSelection', () => {
  const fixtures = buildFixtures();

  it('scores every golden set perfectly on all automatable metrics', () => {
    for (const fixture of fixtures) {
      const report = evaluateSelection(fixtureInput(fixture, fixture.goldenCandidates));
      assert.equal(report.midWordRate, 0, `${fixture.id} golden mid-word`);
      assert.equal(report.midSentenceRate, 0, `${fixture.id} golden mid-sentence`);
      assert.equal(report.endTruncationRate, 0, `${fixture.id} golden truncation`);
      assert.equal(report.deadAirRate, 0, `${fixture.id} golden dead air`);
      assert.equal(report.redundancyRate, 0, `${fixture.id} golden redundancy`);
      assert.equal(report.referenceRecall, 1, `${fixture.id} golden recall`);
      assert.equal(report.precisionAtK, 1, `${fixture.id} golden precision`);
    }
  });

  it('degraded sets trigger every trap the fixtures embed', () => {
    const pod = evaluateSelection(
      fixtureInput(fixtures[0], fixtures[0].degradedCandidates)
    );
    assert.ok(pod.midWordRate > 0.5, 'mid-word trap detected');
    assert.ok(pod.redundancyRate > 0.1, 'duplicate trap detected');

    const gaming = evaluateSelection(
      fixtureInput(fixtures[1], fixtures[1].degradedCandidates)
    );
    assert.ok(gaming.deadAirRate > 0.5, 'low-dialogue dead-air trap detected');
  });

  it('marks human- and LLM-dependent dimensions as NOT MEASURED, never fabricated', () => {
    const fixture = fixtures[0];
    const report = evaluateSelection(fixtureInput(fixture, fixture.goldenCandidates, null));
    assert.equal(report.rankCorrelation, null);
    assert.ok(report.notes.some((n) => /human ranking/i.test(n)));
    assert.ok(NOT_MEASURED_LLM_NOTE.includes('NOT MEASURED'));
    assert.ok(NOT_MEASURED_HUMAN_NOTE.includes('NOT MEASURED'));
  });
});
