import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as serverRipple from '../utils/editorRippleCut.js';
import * as clientRipple from '../../../src/utils/editorRippleCut.js';

/**
 * Production-audit finding L-1: `src/utils/editorRippleCut.ts` and
 * `server/src/utils/editorRippleCut.ts` are maintained as two copies. They
 * cannot share one module (the server copy imports node:crypto), so this suite
 * pins both implementations to IDENTICAL behavior on the same inputs — any
 * drift between browser preview and backend edit semantics fails here.
 */

const cueSets = [
  // Word-token cues straddling a cut
  [
    { id: 'a', start: 1, end: 3, text: 'before cut', words: [{ word: 'before', start: 1, end: 1.9 }, { word: 'cut', start: 2.1, end: 3 }] },
    { id: 'b', start: 4.2, end: 6.5, text: 'after the cut region', words: [{ word: 'after', start: 4.2, end: 5 }, { word: 'the', start: 5.1, end: 5.5 }, { word: 'cut', start: 5.6, end: 6.1 }] },
    { id: 'c', start: 7, end: 9, text: 'tail' },
  ],
  // Segment cues without word tokens
  [
    { id: 'x', start: 2, end: 4, text: 'mid' },
    { id: 'y', start: 5, end: 8, text: 'spans', words: [] },
  ],
] as any[];

const cutCases: Array<[number, number, number]> = [
  [3.5, 6, 2.5], // classic mid cut
  [0, 1.5, 1.5], // cut before everything
  [8, 10, 2], // cut after everything
];

describe('Ripple-cut parity: sliceAndShiftCues (server vs client copies)', () => {
  for (const [caseIdx, cues] of cueSets.entries()) {
    for (const [cutStart, cutEnd, cutDuration] of cutCases) {
      it(`case ${caseIdx} cut [${cutStart}, ${cutEnd})`, () => {
        const serverResult = serverRipple.sliceAndShiftCues(cues as any, cutStart, cutEnd, cutDuration);
        const clientResult = (clientRipple as any).sliceAndShiftCues(cues, cutStart, cutEnd, cutDuration);
        assert.deepEqual(clientResult, serverResult);
      });
    }
  }
});

describe('Ripple-cut parity: partitionCaptionCues (server vs client copies)', () => {
  for (const [caseIdx, cues] of cueSets.entries()) {
    for (const splitTime of [2.5, 5, 7.5]) {
      it(`case ${caseIdx} split at ${splitTime}`, () => {
        const serverResult = serverRipple.partitionCaptionCues(cues as any, splitTime, 0);
        const clientResult = (clientRipple as any).partitionCaptionCues(cues, splitTime, 0);
        assert.deepEqual(clientResult, serverResult);
      });
    }
  }
});

describe('Ripple-cut parity: applyRippleCutToProject (server vs client copies)', () => {
  // Split media items receive fresh crypto.randomUUID() ids per run — normalize
  // UUID-shaped strings so only structural/semantic differences fail the test.
  const normalizeUuids = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? 'UUID' : value;
    }
    if (Array.isArray(value)) return value.map(normalizeUuids);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, normalizeUuids(v)]));
    }
    return value;
  };

  const makeProject = () =>
    ({
      canvas: { duration: 20, width: 1080, height: 1920, fps: 30, aspect_ratio: '9:16' },
      tracks: [
        {
          id: 'cap',
          type: 'CAPTION',
          name: 'Subtitles',
          locked: false,
          muted: true,
          hidden: false,
          items: [
            {
              id: 'cap-item-1',
              type: 'CAPTION',
              timeline_start: 0,
              timeline_end: 18,
              source_start: 0,
              source_end: 18,
              caption: { cues: cueSets[0], style: 'clean', position: 'bottom' },
            },
          ],
        },
        {
          id: 'vid',
          type: 'VIDEO',
          name: 'V1',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            { id: 'v1', type: 'VIDEO', timeline_start: 0, timeline_end: 8, source_start: 0, source_end: 8 },
            { id: 'v2', type: 'VIDEO', timeline_start: 8, timeline_end: 18, source_start: 8, source_end: 18 },
          ],
        },
      ],
    }) as any;

  for (const [cutStart, cutEnd] of [[4, 6], [0, 2], [16, 20]] as Array<[number, number]>) {
    it(`project ripple cut [${cutStart}, ${cutEnd})`, () => {
      const serverResult = normalizeUuids(serverRipple.applyRippleCutToProject(makeProject(), cutStart, cutEnd));
      const clientResult = normalizeUuids((clientRipple as any).applyRippleCutToProject(makeProject(), cutStart, cutEnd));
      assert.deepEqual(clientResult, serverResult);
    });
  }
});
