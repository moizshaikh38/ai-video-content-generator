import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  contentTokens,
  tokenJaccard,
  cosineSimilarity,
  deduplicateSemantically,
} from '../utils/semanticDedup.js';
import {
  isQaCriticalGenre,
  tryIncludeQuestion,
} from '../utils/questionInclusion.js';

/**
 * Clipping advantage B2 (semantic dedup) + B4 (question auto-inclusion):
 * direct attacks on the ~40% discard-rate complaint every top platform has.
 */

describe('B2 — semantic dedup', () => {
  it('token Jaccard: paraphrases score high, different topics low', () => {
    const j1 = tokenJaccard(
      'the revenue doubled after we shipped the new pricing plan',
      'our revenue doubled once the new pricing plan shipped'
    );
    assert.ok(j1 > 0.6, `paraphrase similarity ${j1}`);
    const j2 = tokenJaccard(
      'the revenue doubled after we shipped the new pricing plan',
      'my grandmother taught me to bake bread every sunday morning'
    );
    assert.ok(j2 < 0.15, `different topic similarity ${j2}`);
  });

  it('stopwords and short tokens are stripped from comparison', () => {
    const toks = contentTokens('The a it is of I really think that this is going');
    assert.deepEqual(toks, []);
    const toks2 = contentTokens('Revenue DOUBLED after pricing!');
    assert.ok(toks2.includes('revenue') && toks2.includes('doubled') && toks2.includes('pricing'));
  });

  it('cosine similarity handles parallel, orthogonal, and mismatched vectors', () => {
    assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.equal(cosineSimilarity([1, 2], [1]), 0); // shape mismatch → 0, never throws
    assert.equal(cosineSimilarity([], []), 0);
  });

  it('higher-scored survivor suppresses later semantic duplicates, keeps order', () => {
    const candidates = [
      { id: 'a', text: 'revenue doubled after the new pricing plan shipped', score: 70 },
      { id: 'b', text: 'the revenue doubled once the new pricing plan shipped', score: 90 },
      { id: 'c', text: 'we hired a meditation teacher for the office dogs', score: 60 },
    ];
    const kept = deduplicateSemantically(candidates, { threshold: 0.6 });
    const ids = kept.map((c) => c.id);
    assert.deepEqual(ids, ['b', 'c'], 'duplicate "a" dropped, distinct "c" kept, order stable');
  });

  it('embeddings take precedence in auto mode (true semantics over tokens)', () => {
    const e = (x: number[]) => x;
    const candidates = [
      // Token-overlap low, but embeddings near-identical → still deduped.
      { id: 'x', text: 'monetary expansion', score: 80, embedding: e([1, 0, 0]) },
      { id: 'y', text: 'money supply growth', score: 70, embedding: e([0.99, 0.05, 0]) },
      { id: 'z', text: 'unrelated topic entirely', score: 60, embedding: e([0, 0, 1]) },
    ];
    const kept = deduplicateSemantically(candidates, { threshold: 0.95, mode: 'auto' });
    assert.deepEqual(kept.map((c) => c.id), ['x', 'z']);
  });

  it('degenerate inputs pass through unchanged', () => {
    assert.deepEqual(deduplicateSemantically([]), []);
    const single = [{ id: 'a', text: 'solo', score: 1 }];
    assert.deepEqual(deduplicateSemantically(single), single);
  });
});

describe('B4 — question auto-inclusion', () => {
  const clamps = { minDurationSec: 15, maxDurationSec: 75 };

  it('extends the clip backward to include an adjacent question', () => {
    const result = tryIncludeQuestion(
      { start_seconds: 40, end_seconds: 80, candidateText: 'it collapsed because nobody onboarded anyone' },
      { start: 35, end: 39.8, text: 'so why did the company actually collapse?' },
      clamps
    );
    assert.ok(result);
    assert.equal(result!.start_seconds, 35);
    assert.equal(result!.end_seconds, 80);
    assert.equal(result!.extendedBySec, 5);
    assert.match(result!.includedQuestionText, /collapse/);
  });

  it('refuses when the extension would exceed the genre max duration', () => {
    const result = tryIncludeQuestion(
      { start_seconds: 70, end_seconds: 140, candidateText: 'the answer is complicated' },
      { start: 60, end: 69.9, text: 'what happened next?' },
      clamps
    );
    assert.equal(result, null); // 80s > 75s max
  });

  it('refuses when the preceding segment is not a question, or the clip has one', () => {
    assert.equal(
      tryIncludeQuestion(
        { start_seconds: 10, end_seconds: 40, candidateText: 'an answer' },
        { start: 5, end: 9.9, text: 'a plain statement' },
        clamps
      ),
      null
    );
    assert.equal(
      tryIncludeQuestion(
        { start_seconds: 10, end_seconds: 40, candidateText: 'why? because data' },
        { start: 5, end: 9.9, text: 'what drove growth?' },
        clamps
      ),
      null // candidate already contains a question
    );
  });

  it('refuses non-adjacent segments and null preceding', () => {
    assert.equal(
      tryIncludeQuestion(
        { start_seconds: 100, end_seconds: 130, candidateText: 'answer' },
        { start: 5, end: 9.9, text: 'question?' },
        clamps
      ),
      null // 90s away — not adjacent
    );
    assert.equal(
      tryIncludeQuestion({ start_seconds: 10, end_seconds: 40, candidateText: 'answer' }, null, clamps),
      null
    );
  });

  it('Q&A-critical genres are podcast, news, education', () => {
    assert.equal(isQaCriticalGenre('podcast_interview'), true);
    assert.equal(isQaCriticalGenre('news_politics'), true);
    assert.equal(isQaCriticalGenre('education_tutorial'), true);
    assert.equal(isQaCriticalGenre('gaming'), false);
    assert.equal(isQaCriticalGenre(undefined), false);
  });
});

describe('B2+B4 — pipeline wiring pins', () => {
  const analysis = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipAnalysisService.ts'), 'utf8');

  it('semantic dedup runs after overlap dedup, before MMR selection', () => {
    const overlapIdx = analysis.indexOf('deduplicateCandidatesByOverlap(');
    const semanticIdx = analysis.indexOf('deduplicateSemantically(');
    const mmrIdx = analysis.indexOf('selectDiverseCandidates(');
    assert.ok(overlapIdx > 0 && semanticIdx > overlapIdx && mmrIdx > semanticIdx);
  });

  it('question inclusion runs before duration rejection and persists metadata', () => {
    assert.match(analysis, /tryIncludeQuestion\(/);
    assert.match(analysis, /question_included: questionInclusion/);
    assert.match(analysis, /isQaCriticalGenre\(genreProfile\.genre\)/);
  });
});
