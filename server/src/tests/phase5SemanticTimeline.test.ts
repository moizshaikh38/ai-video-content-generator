import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TimelineAnchorUtils } from '../utils/timelineAnchorUtils.js';
import { AnchoredTimelineItem, TranscriptWord } from '../types/index.js';

describe('Phase 5: Word-Anchored Semantic Timeline & Ripple Editing', () => {
  const sampleWords: TranscriptWord[] = [
    { id: 'w_0_start', word: 'Start', start: 1.0, end: 1.4 },
    { id: 'w_1_making', word: 'making', start: 1.5, end: 1.9 },
    { id: 'w_2_videos', word: 'videos', start: 2.0, end: 2.6 },
    { id: 'w_3_today', word: 'today', start: 2.7, end: 3.2 },
    { id: 'w_4_before', word: 'before', start: 3.5, end: 3.9 },
    { id: 'w_5_its', word: 'its', start: 4.0, end: 4.3 },
    { id: 'w_6_late', word: 'late', start: 4.4, end: 5.0 },
  ];

  describe('Anchor Resolution', () => {
    it('1. resolves lock_to_word_start with offset accurately', () => {
      const item: AnchoredTimelineItem = {
        id: 'overlay_1',
        type: 'broll',
        anchor: {
          anchorWordId: 'w_2_videos',
          dockingBehavior: 'lock_to_word_start',
          offsetMs: 200, // +0.2s
          durationMs: 2500, // 2.5s
        },
      };

      const resolved = TimelineAnchorUtils.resolveAnchoredItem(item, sampleWords);
      assert.strictEqual(resolved.isFloating, false);
      // w_2_videos start is 2.0, offset +0.2 -> 2.2
      assert.strictEqual(resolved.startSec, 2.2);
      // duration 2.5 -> endSec 4.7
      assert.strictEqual(resolved.endSec, 4.7);
    });

    it('2. resolves lock_to_word_end with offset accurately', () => {
      const item: AnchoredTimelineItem = {
        id: 'sfx_1',
        type: 'sfx',
        anchor: {
          anchorWordId: 'w_3_today',
          dockingBehavior: 'lock_to_word_end',
          offsetMs: -100, // 0.1s before end
          durationMs: 1000,
        },
      };

      const resolved = TimelineAnchorUtils.resolveAnchoredItem(item, sampleWords);
      assert.strictEqual(resolved.isFloating, false);
      // w_3_today end is 3.2, offset -0.1 -> endSec 3.1
      assert.strictEqual(resolved.endSec, 3.1);
      // duration 1.0 -> startSec 2.1
      assert.strictEqual(resolved.startSec, 2.1);
    });

    it('3. resolves span_words across multiple words', () => {
      const item: AnchoredTimelineItem = {
        id: 'hook_1',
        type: 'hook',
        anchor: {
          anchorWordId: 'w_0_start',
          endWordId: 'w_3_today',
          dockingBehavior: 'span_words',
          offsetMs: 0,
          endOffsetMs: 150, // +0.15s after today ends
        },
      };

      const resolved = TimelineAnchorUtils.resolveAnchoredItem(item, sampleWords);
      assert.strictEqual(resolved.isFloating, false);
      assert.strictEqual(resolved.startSec, 1.0);
      assert.strictEqual(resolved.endSec, 3.35); // 3.2 + 0.15
    });

    it('4. falls back gracefully when anchor word is missing', () => {
      const item: AnchoredTimelineItem = {
        id: 'orphan_1',
        type: 'broll',
        fallbackStartSec: 4.5,
        fallbackEndSec: 7.5,
        anchor: {
          anchorWordId: 'w_99_missing',
          dockingBehavior: 'lock_to_word_start',
        },
      };

      const resolved = TimelineAnchorUtils.resolveAnchoredItem(item, sampleWords);
      assert.strictEqual(resolved.isFloating, true);
      assert.strictEqual(resolved.startSec, 4.5);
      assert.strictEqual(resolved.endSec, 7.5);
      assert.ok(resolved.warning?.includes('not found in transcript'));
    });
  });

  describe('Ripple Adjustment & Transcript Editing', () => {
    it('1. drops item when anchor word is deleted with "delete_with_word"', () => {
      const items: AnchoredTimelineItem[] = [
        {
          id: 'broll_del',
          type: 'broll',
          anchor: {
            anchorWordId: 'w_2_videos',
            dockingBehavior: 'lock_to_word_start',
            onAnchorDeleted: 'delete_with_word',
          },
        },
      ];

      const remainingWords = sampleWords.filter((w) => w.id !== 'w_2_videos');
      const adjusted = TimelineAnchorUtils.rippleAdjustAnchoredItems({
        items,
        deletedWordIds: ['w_2_videos'],
        remainingWords,
        previousWords: sampleWords,
      });

      assert.strictEqual(adjusted.length, 0, 'Item should have been deleted');
    });

    it('2. attaches to next surviving word with "attach_to_next"', () => {
      const items: AnchoredTimelineItem[] = [
        {
          id: 'broll_next',
          type: 'broll',
          anchor: {
            anchorWordId: 'w_2_videos',
            dockingBehavior: 'lock_to_word_start',
            onAnchorDeleted: 'attach_to_next',
          },
        },
      ];

      // Delete w_2_videos
      const remainingWords = sampleWords.filter((w) => w.id !== 'w_2_videos');
      const adjusted = TimelineAnchorUtils.rippleAdjustAnchoredItems({
        items,
        deletedWordIds: ['w_2_videos'],
        remainingWords,
        previousWords: sampleWords,
      });

      assert.strictEqual(adjusted.length, 1);
      // The next word after w_2_videos is w_3_today
      assert.strictEqual(adjusted[0].anchor?.anchorWordId, 'w_3_today');
    });

    it('3. converts to floating with "convert_to_floating", capturing last known timestamps', () => {
      const items: AnchoredTimelineItem[] = [
        {
          id: 'broll_float',
          type: 'broll',
          anchor: {
            anchorWordId: 'w_1_making',
            dockingBehavior: 'lock_to_word_start',
            durationMs: 2000,
            onAnchorDeleted: 'convert_to_floating',
          },
        },
      ];

      const remainingWords = sampleWords.filter((w) => w.id !== 'w_1_making');
      const adjusted = TimelineAnchorUtils.rippleAdjustAnchoredItems({
        items,
        deletedWordIds: ['w_1_making'],
        remainingWords,
        previousWords: sampleWords,
      });

      assert.strictEqual(adjusted.length, 1);
      assert.strictEqual(adjusted[0].anchor?.dockingBehavior, 'floating');
      // w_1_making start is 1.5, duration 2.0 -> 3.5
      assert.strictEqual(adjusted[0].fallbackStartSec, 1.5);
      assert.strictEqual(adjusted[0].fallbackEndSec, 3.5);
    });

    it('4. adjusts endWordId when end word in span_words is deleted', () => {
      const items: AnchoredTimelineItem[] = [
        {
          id: 'span_item',
          type: 'hook',
          anchor: {
            anchorWordId: 'w_0_start',
            endWordId: 'w_3_today',
            dockingBehavior: 'span_words',
          },
        },
      ];

      // Delete w_3_today
      const remainingWords = sampleWords.filter((w) => w.id !== 'w_3_today');
      const adjusted = TimelineAnchorUtils.rippleAdjustAnchoredItems({
        items,
        deletedWordIds: ['w_3_today'],
        remainingWords,
        previousWords: sampleWords,
      });

      assert.strictEqual(adjusted.length, 1);
      // New end word should be the surviving preceding word w_2_videos
      assert.strictEqual(adjusted[0].anchor?.endWordId, 'w_2_videos');
    });
  });

  describe('Anchor Validation', () => {
    it('1. identifies broken and orphaned anchors', () => {
      const items: AnchoredTimelineItem[] = [
        {
          id: 'valid_item',
          type: 'broll',
          anchor: {
            anchorWordId: 'w_0_start',
            dockingBehavior: 'lock_to_word_start',
          },
        },
        {
          id: 'broken_item',
          type: 'hook',
          anchor: {
            anchorWordId: 'w_ghost_999',
            dockingBehavior: 'lock_to_word_start',
          },
        },
      ];

      const validation = TimelineAnchorUtils.validateAnchors(items, sampleWords);
      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.brokenItemIds.length, 1);
      assert.strictEqual(validation.brokenItemIds[0], 'broken_item');
    });
  });
});
