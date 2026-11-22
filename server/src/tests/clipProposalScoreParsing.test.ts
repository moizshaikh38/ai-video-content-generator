import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipAnalysisService as Parser } from '../services/clipAnalysisService.js';
import { MultimodalScoringService as Scorer } from '../services/multimodal/multimodalScoringService.js';
import { baseCompositeScore } from '../utils/selectionShortlist.js';
const fields = ['hook_score', 'standalone_score', 'insight_score', 'emotion_score', 'platform_score'] as const;
const fixture = { start_segment_index: 0, end_segment_index: 3, title: 'Retained proposal', hook: 'Retained source hook', category: 'insight' };
const parse = (scores: Record<string, unknown>) => Parser.parseAIResponse({ clips: [{ ...fixture, ...scores }] })[0];

test('empty and whitespace-only subscore strings remain missing, never scored zero', () => {
  for (const value of ['', ' ', '\t\n', '\u00a0', '\u2009']) {
    const result = parse(Object.fromEntries(fields.map(field => [field, value])));
    for (const field of fields) assert.equal(result[field], undefined, field);
  }
});

test('missing strings do not dilute a composite made from actual available scores', () => {
  const result = parse({ hook_score: '', standalone_score: 80, insight_score: '80', emotion_score: ' ', platform_score: undefined });
  assert.equal(baseCompositeScore(result), 80);
});

test('all-blank provider metrics cannot become ranked narrative evidence', () => {
  const result = parse(Object.fromEntries(fields.map(field => [field, ' '])));
  const scored = Scorer.scoreCandidate({ start_seconds: 0, end_seconds: 30, title: result.title, hook: result.hook, baseHookScore: result.hook_score, baseStandaloneScore: result.standalone_score, baseInsightScore: result.insight_score });
  assert.equal(scored.ranking_status, 'insufficient-evidence');
  assert.equal(scored.vireo_score, 0);
  for (const field of ['hook_score', 'standalone_score', 'insight_score'] as const) assert.equal(scored.explanation[field], null);
});

test('actual zero and existing finite numeric-string compatibility are preserved', () => {
  for (const [value, expected] of [[0, 0], ['0', 0], [' 0 ', 0], [80.5, 80.5], ['80.5', 80.5], ['1e2', 100], [-1, 0], [120, 100]] as const) {
    const result = parse(Object.fromEntries(fields.map(field => [field, value])));
    for (const field of fields) assert.equal(result[field], expected);
  }
});

test('non-numeric and non-finite values stay unavailable without erasing the proposal', () => {
  for (const value of [undefined, null, false, true, [], {}, NaN, Infinity, 'not-scored', '80%']) {
    const result = parse(Object.fromEntries(fields.map(field => [field, value])));
    assert(result);
    for (const field of fields) assert.equal(result[field], undefined);
    assert.equal(result.title, fixture.title);
  }
});

test('score parsing leaves all provider fields, source IDs and words unchanged', () => {
  const raw = { clips: [{ ...fixture, hook_score: '', standalone_score: ' 80 ' }] }, before = structuredClone(raw);
  const [result] = Parser.parseAIResponse(raw);
  assert.deepEqual(raw, before);
  assert.equal(result.start_segment_index, fixture.start_segment_index);
  assert.equal(result.end_segment_index, fixture.end_segment_index);
  assert.equal(result.title, fixture.title);
  assert.equal(result.hook, fixture.hook);
});
