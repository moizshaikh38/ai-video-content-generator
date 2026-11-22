import test from 'node:test';
import assert from 'node:assert/strict';
import { shortlistCandidatesForDetailedScoring as shortlist, shortlistBudget } from '../utils/selectionShortlist.js';

const proposal = (id: string, start: number, score: number, teaser?: number | null) => ({
  id, start_segment_index: start, end_segment_index: start + 1,
  cold_open_segment_index: teaser, hook_score: score,
});
const key = (c: ReturnType<typeof proposal>) => `${c.start_segment_index}:${c.end_segment_index}:${c.cold_open_segment_index ?? 'none'}`;

test('exact repeated source proposals cannot consume every detailed-scoring slot', () => {
  const duplicates = Array.from({ length: 13 }, (_, i) => proposal(`dup${i}`, 0, 100));
  const distinct = Array.from({ length: 12 }, (_, i) => proposal(`unique${i}`, (i + 1) * 2, 80 - i));
  const out = shortlist([...duplicates, ...distinct], 2);
  assert.equal(out.length, 12);
  assert.equal(new Set(out.map(key)).size, 12);
  assert.equal(out.filter(c => c.start_segment_index === 0).length, 1);
});

test('the highest-ranked representative survives, not whichever duplicate appeared first', () => {
  const all = [proposal('low', 0, 1), ...Array.from({ length: 15 }, (_, i) => proposal(`other${i}`, i * 2 + 2, 50)), proposal('high', 0, 100)];
  const out = shortlist(all, 1);
  assert(out.some(c => c.id === 'high'));
  assert(!out.some(c => c.id === 'low'));
  assert.deepEqual(out.map(c => all.indexOf(c)), out.map(c => all.indexOf(c)).sort((a, b) => a - b));
});

test('different teaser footage remains a distinct source proposal', () => {
  const all = [...Array.from({ length: 13 }, (_, i) => proposal(`same${i}`, 0, 100, 8)), proposal('other-teaser', 0, 90, 9), proposal('no-teaser', 0, 89, null), ...Array.from({ length: 12 }, (_, i) => proposal(`other${i}`, i * 2 + 2, 80 - i))];
  const out = shortlist(all, 1);
  assert(out.some(c => c.id === 'other-teaser'));
  assert(out.some(c => c.id === 'no-teaser'));
});

test('under-budget callers keep the same array even if it contains repeated footage', () => {
  const all = [proposal('one', 0, 100), proposal('two', 0, 90)];
  assert.strictEqual(shortlist(all, 1), all);
});

test('unknown or malformed source identities are never collapsed into one group', () => {
  const all: any[] = Array.from({ length: 15 }, (_, i) => ({ id: i, hook_score: 100 - i }));
  for (const mutate of [(c: any) => c, (c: any) => ({ ...c, start_segment_index: '1', end_segment_index: 2 }), (c: any) => ({ ...c, start_segment_index: 1, end_segment_index: 2, cold_open_segment_index: NaN })]) {
    const rows = all.map(mutate);
    assert.deepEqual(shortlist(rows, 1).map(c => c.id), Array.from({ length: 12 }, (_, i) => i));
  }
});

test('when too few distinct proposals exist, remaining slots keep the original best duplicates', () => {
  const all = Array.from({ length: 20 }, (_, i) => proposal(`dup${i}`, 0, 100 - i));
  const out = shortlist(all, 1);
  assert.equal(out.length, 12);
  assert.deepEqual(out.map(c => c.id), all.slice(0, 12).map(c => c.id));
});

test('stable score ties keep the earliest representative and discovery order', () => {
  const all = [proposal('first', 0, 50), ...Array.from({ length: 12 }, (_, i) => proposal(`duplicate${i}`, 0, 50)), ...Array.from({ length: 12 }, (_, i) => proposal(`other${i}`, 2 * i + 2, 50))];
  const out = shortlist(all, 1);
  assert.equal(out[0].id, 'first');
  assert.equal(new Set(out.map(key)).size, 12);
  assert.deepEqual(out.slice(1).map(c => c.id), Array.from({ length: 11 }, (_, i) => `other${i}`));
});

test('shortlisting neither mutates source proposals nor invents new ones', () => {
  const all = [...Array.from({ length: 14 }, (_, i) => proposal(`dup${i}`, 0, 100)), ...Array.from({ length: 15 }, (_, i) => proposal(`other${i}`, i * 2 + 2, 80 - i))];
  const before = structuredClone(all);
  all.forEach(Object.freeze); Object.freeze(all);
  const out = shortlist(all, 1);
  assert.deepEqual(all, before);
  assert(out.every(c => all.includes(c)));
});

test('bounded randomized pools retain the available distinct source depth', () => {
  let state = 417;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state; };
  for (let trial = 0; trial < 100; trial++) {
    const all = Array.from({ length: 80 }, (_, i) => proposal(`${trial}:${i}`, (random() % 19) * 2, random() % 101, random() % 3));
    const out = shortlist(all, 1), budget = shortlistBudget(1);
    assert.equal(out.length, budget);
    assert.equal(new Set(out.map(key)).size, Math.min(budget, new Set(all.map(key)).size));
    for (const sourceKey of new Set(out.map(key))) {
      const best = all.filter(c => key(c) === sourceKey).sort((a, b) => b.hook_score - a.hook_score)[0];
      assert(out.includes(best));
    }
  }
});

test('null and absent teasers describe the same footage, but teaser index zero does not', () => {
  const all = [...Array.from({ length: 13 }, (_, i) => proposal(`none${i}`, 0, 100, i % 2 ? null : undefined)), proposal('teaser-zero', 0, 90, 0), ...Array.from({ length: 12 }, (_, i) => proposal(`other${i}`, 2 * i + 2, 80 - i))];
  const out = shortlist(all, 1);
  assert.equal(out.filter(c => c.start_segment_index === 0 && c.cold_open_segment_index == null).length, 1);
  assert(out.some(c => c.id === 'teaser-zero'));
  assert.equal(new Set(out.map(key)).size, 12);
});
