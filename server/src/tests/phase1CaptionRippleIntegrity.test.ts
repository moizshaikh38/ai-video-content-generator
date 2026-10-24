import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  shiftCaptionItemsForRippleDelete,
  cloneCaptionCuesForDuplicate,
  sliceAndShiftCues,
} from '../utils/editorRippleCut.js';
import { CaptionService } from '../services/captionService.js';
import { TimedCaptionCue } from '../types/index.js';

/**
 * Phase 1 data-integrity regressions (audit findings H-2 / M-3):
 * - Ripple-delete must not shrink caption items that end before the deleted range,
 *   and must slide caption items after the range together with their cues.
 * - Duplicated caption items must rebase cue times and regenerate cue IDs so the
 *   export aggregation keeps them at the duplicate's position.
 * - Export cue aggregation must not collapse cues that lack IDs.
 */

const cue = (id: string | undefined, start: number, end: number, text: string, words?: Array<{ word: string; start: number; end: number }>): TimedCaptionCue =>
  ({ id, start, end, text, ...(words ? { words } : {}) }) as TimedCaptionCue;

describe('Phase 1 — ripple-delete caption item integrity', () => {
  const deletePoint = 4;
  const duration = 2;

  it('leaves items entirely before the deleted range untouched (bounds and cues)', () => {
    const before = {
      timeline_start: 0,
      timeline_end: 3.5,
      caption: { cues: [cue('a', 0.5, 1.5, 'hello'), cue('b', 2.0, 3.4, 'world')] },
    };
    const after = {
      timeline_start: 6,
      timeline_end: 10,
      caption: { cues: [cue('c', 6.5, 7.5, 'kept'), cue('d', 9.0, 9.8, 'shifted')] },
    };

    const result = shiftCaptionItemsForRippleDelete([before, after], deletePoint, duration);

    assert.equal(result.length, 2);
    // Regression: the pre-cut item keeps its full duration and cue times.
    assert.equal(result[0].timeline_start, 0);
    assert.equal(result[0].timeline_end, 3.5);
    assert.deepEqual(result[0].caption?.cues?.map((c) => [c.start, c.end]), [[0.5, 1.5], [2.0, 3.4]]);

    // The post-cut item slides with the timeline: both bounds and all cues.
    assert.equal(result[1].timeline_start, 4);
    assert.equal(result[1].timeline_end, 8);
    assert.deepEqual(result[1].caption?.cues?.map((c) => [c.start, c.end]), [[4.5, 5.5], [7.0, 7.8]]);
  });

  it('keeps the start of a spanning item, shrinks its end, and excises cues inside the cut', () => {
    const spanning = {
      timeline_start: 0,
      timeline_end: 10,
      caption: {
        cues: [
          cue('p', 1.0, 2.0, 'before'),
          cue('q', 3.5, 4.5, 'clamped'),
          cue('t', 4.2, 5.5, 'inside-cut'),
          cue('r', 4.2, 6.8, 'straddles', [
            { word: 'keep', start: 4.2, end: 4.8 },
            { word: 'later', start: 6.1, end: 6.5 },
          ]),
          cue('s', 7.0, 8.0, 'after'),
        ],
      },
    };

    const result = shiftCaptionItemsForRippleDelete([spanning], deletePoint, duration);

    assert.equal(result[0].timeline_start, 0);
    assert.equal(result[0].timeline_end, 8);

    const cues = result[0].caption?.cues ?? [];
    const byText = new Map(cues.map((c) => [c.text, c]));
    // Cue fully inside the cut is dropped.
    assert.equal(byText.has('inside-cut'), false);
    // Cue overlapping the cut start survives truncated to the cut start.
    assert.deepEqual([byText.get('clamped')?.start, byText.get('clamped')?.end], [3.5, 4.0]);
    // Cue before the cut is untouched.
    assert.deepEqual([byText.get('before')?.start, byText.get('before')?.end], [1.0, 2.0]);
    // Cue after the cut is shifted left by the cut duration.
    assert.deepEqual([byText.get('after')?.start, byText.get('after')?.end], [5.0, 6.0]);
    // Word tokens: the word fully inside the cut is dropped, the word after it
    // shifts left; the surviving cue is rebuilt from surviving words.
    const straddle = byText.get('later');
    assert.ok(straddle, 'straddling cue should survive with rebuilt text');
    assert.deepEqual(
      straddle?.words?.map((w) => [w.start, w.end]),
      [[4.1, 4.5]]
    );
  });

  it('returns the input unchanged for zero or negative durations', () => {
    const items = [{ timeline_start: 0, timeline_end: 5, caption: { cues: [cue('x', 1, 2, 'a')] } }];
    assert.equal(shiftCaptionItemsForRippleDelete(items, 2, 0), items);
    assert.equal(shiftCaptionItemsForRippleDelete(items, 2, -1), items);
  });

  it('cue slicing matches the shared sliceAndShiftCues semantics used by range ripple cuts', () => {
    const cues = [cue('a', 1, 3, 'left'), cue('b', 5, 7, 'right')];
    // Deleting [4, 6): 'a' untouched; 'b' starts inside the cut so its start clamps
    // to the cut start and its end shifts left by the cut duration.
    const result = sliceAndShiftCues(cues, 4, 6, 2);
    assert.deepEqual(result.map((c) => [c.start, c.end]), [[1, 3], [4, 5]]);
  });
});

describe('Phase 1 — duplicate caption item integrity', () => {
  it('rebases cue and word times by the placement offset and regenerates cue IDs', () => {
    const source = [
      cue('cue-1', 1.0, 2.0, 'first', [{ word: 'first', start: 1.0, end: 2.0 }]),
      cue(undefined, 2.5, 3.0, 'second'),
    ];

    const clones = cloneCaptionCuesForDuplicate(source, 4);

    assert.deepEqual(clones.map((c) => [c.start, c.end]), [[5.0, 6.0], [6.5, 7.0]]);
    assert.deepEqual(clones[0].words?.map((w) => [w.start, w.end]), [[5.0, 6.0]]);
    // IDs are regenerated for cues that had them (export dedups by seen IDs).
    assert.notEqual(clones[0].id, 'cue-1');
    assert.ok(clones[0].id);
    // Cues without IDs keep having no ID rather than a fabricated one.
    assert.equal(clones[1].id, undefined);
    // Source cues are not mutated.
    assert.equal(source[0].start, 1.0);
    assert.equal(source[0].id, 'cue-1');
  });

  it('keeps cue times when the offset is zero', () => {
    const source = [cue('cue-1', 1.0, 2.0, 'a')];
    const clones = cloneCaptionCuesForDuplicate(source, 0);
    assert.deepEqual(clones.map((c) => [c.start, c.end]), [[1.0, 2.0]]);
    assert.notEqual(clones[0].id, 'cue-1');
  });
});

describe('Phase 1 — editor cue aggregation dedup guards', () => {
  const projectWith = (items: Array<{ timeline_start: number; timeline_end: number; cues: TimedCaptionCue[] }>) => ({
    tracks: [
      {
        type: 'CAPTION',
        hidden: false,
        items: items.map((i, idx) => ({
          id: `item-${idx}`,
          hidden: false,
          timeline_start: i.timeline_start,
          timeline_end: i.timeline_end,
          caption: { style: 'clean', position: 'bottom', cues: i.cues },
        })),
      },
    ],
  });

  it('does not collapse cues that lack IDs into the first cue', () => {
    const proj = projectWith([
      { timeline_start: 0, timeline_end: 4, cues: [cue(undefined, 1, 2, 'alpha'), cue(undefined, 2.5, 3.5, 'beta')] },
    ]);

    const extracted = CaptionService.extractEditorCuesFromProject(proj as any);
    assert.ok(extracted);
    assert.equal(extracted.cues.length, 2);
  });

  it('still drops verbatim copies that share a cue ID (why duplicates regenerate IDs)', () => {
    const proj = projectWith([
      { timeline_start: 0, timeline_end: 4, cues: [cue('shared', 1, 2, 'alpha')] },
      { timeline_start: 4, timeline_end: 8, cues: [cue('shared', 1, 2, 'alpha')] },
    ]);

    const extracted = CaptionService.extractEditorCuesFromProject(proj as any);
    assert.ok(extracted);
    assert.equal(extracted.cues.length, 1);
  });

  it('aggregates multi-item absolute cues in timeline order', () => {
    const proj = projectWith([
      { timeline_start: 0, timeline_end: 4, cues: [cue('a', 1, 2, 'first')] },
      { timeline_start: 4, timeline_end: 8, cues: [cue('b', 5, 6, 'second')] },
    ]);

    const extracted = CaptionService.extractEditorCuesFromProject(proj as any);
    assert.ok(extracted);
    assert.deepEqual(extracted.cues.map((c) => [c.start, c.text]), [[1, 'first'], [5, 'second']]);
  });
});

describe('Phase 1 — service wiring guards', () => {
  const serviceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/proEditorService.ts'),
    'utf8'
  );

  it('rippleDelete uses the shared caption ripple helper instead of inline logic', () => {
    assert.match(serviceSource, /shiftCaptionItemsForRippleDelete\(tr\.items, deletePoint, duration\)/);
    // The old inline caption loop shifted every item regardless of position — it must not return.
    assert.doesNotMatch(serviceSource, /for \(const cue of itm\.caption\.cues\)/);
  });

  it('duplicateItem rebases caption cues via the shared clone helper', () => {
    assert.match(serviceSource, /cloneCaptionCuesForDuplicate\(duplicatedCaption\.cues, newItemStart - sourceStart\)/);
  });
});
