/**
 * VireoClip Timeline Anchor Utilities
 *
 * Implements Phase 5: Word-Anchored Semantic Timeline & Ripple Editing.
 * Locks timeline elements (overlays, hooks, SFX, B-roll) to immutable Word IDs
 * to prevent drift when trimming, editing, or rippling speech.
 */

import {
  AnchoredTimelineItem,
  ResolvedTimelineItem,
  WordAnchor,
  TranscriptWord,
} from '../types/index.js';

export class TimelineAnchorUtils {
  /**
   * Resolves an anchored timeline item to absolute start and end seconds
   * based on the current transcript word timestamps.
   */
  public static resolveAnchoredItem(
    item: AnchoredTimelineItem,
    words: TranscriptWord[]
  ): ResolvedTimelineItem {
    const wordMap = new Map<string, TranscriptWord>();
    for (const w of words) {
      if (w.id) {
        wordMap.set(w.id, w);
      }
    }

    const fallbackStart = Math.max(0, item.fallbackStartSec ?? 0);
    const fallbackEnd = Math.max(fallbackStart + 0.1, item.fallbackEndSec ?? fallbackStart + 3.0);

    if (!item.anchor || item.anchor.dockingBehavior === 'floating') {
      return {
        id: item.id,
        type: item.type,
        startSec: fallbackStart,
        endSec: fallbackEnd,
        isFloating: true,
      };
    }

    const anchorWord = wordMap.get(item.anchor.anchorWordId);
    if (!anchorWord) {
      return {
        id: item.id,
        type: item.type,
        startSec: fallbackStart,
        endSec: fallbackEnd,
        isFloating: true,
        warning: `Anchor word "${item.anchor.anchorWordId}" not found in transcript. Fallen back to floating mode.`,
      };
    }

    const offsetSec = (item.anchor.offsetMs ?? 0) / 1000;
    const durationSec = (item.anchor.durationMs ?? 3000) / 1000;

    switch (item.anchor.dockingBehavior) {
      case 'lock_to_word_start': {
        const startSec = Math.max(0, anchorWord.start + offsetSec);
        const endSec = startSec + durationSec;
        return {
          id: item.id,
          type: item.type,
          startSec,
          endSec,
          isFloating: false,
          anchorWordId: item.anchor.anchorWordId,
        };
      }

      case 'lock_to_word_end': {
        const endSec = Math.max(0, anchorWord.end + offsetSec);
        const startSec = Math.max(0, endSec - durationSec);
        return {
          id: item.id,
          type: item.type,
          startSec,
          endSec,
          isFloating: false,
          anchorWordId: item.anchor.anchorWordId,
        };
      }

      case 'span_words': {
        const startSec = Math.max(0, anchorWord.start + offsetSec);
        let endSec: number;

        if (item.anchor.endWordId && wordMap.has(item.anchor.endWordId)) {
          const endWord = wordMap.get(item.anchor.endWordId)!;
          const endOffsetSec = (item.anchor.endOffsetMs ?? 0) / 1000;
          endSec = Math.max(startSec + 0.1, endWord.end + endOffsetSec);
        } else {
          endSec = Math.max(startSec + 0.1, anchorWord.end + durationSec);
        }

        return {
          id: item.id,
          type: item.type,
          startSec,
          endSec,
          isFloating: false,
          anchorWordId: item.anchor.anchorWordId,
          endWordId: item.anchor.endWordId,
        };
      }

      default:
        return {
          id: item.id,
          type: item.type,
          startSec: fallbackStart,
          endSec: fallbackEnd,
          isFloating: true,
        };
    }
  }

  /**
   * Resolves a collection of anchored timeline items
   */
  public static resolveAllAnchoredItems(
    items: AnchoredTimelineItem[],
    words: TranscriptWord[]
  ): ResolvedTimelineItem[] {
    return items.map((item) => TimelineAnchorUtils.resolveAnchoredItem(item, words));
  }

  /**
   * Adjusts anchored items when words are deleted or cut from the transcript,
   * applying ripple handling (delete_with_word, attach_to_next, attach_to_previous, convert_to_floating).
   */
  public static rippleAdjustAnchoredItems(params: {
    items: AnchoredTimelineItem[];
    deletedWordIds: string[];
    remainingWords: TranscriptWord[];
    previousWords: TranscriptWord[];
  }): AnchoredTimelineItem[] {
    const { items, deletedWordIds, remainingWords, previousWords } = params;
    const deletedSet = new Set(deletedWordIds);
    const remainingIdSet = new Set(remainingWords.map((w) => w.id).filter(Boolean));

    const adjustedItems: AnchoredTimelineItem[] = [];

    for (const item of items) {
      if (!item.anchor || item.anchor.dockingBehavior === 'floating') {
        adjustedItems.push(item);
        continue;
      }

      const isAnchorDeleted = deletedSet.has(item.anchor.anchorWordId);

      if (!isAnchorDeleted) {
        // If it's a span_words anchor and the end word was deleted, adjust end word
        if (
          item.anchor.dockingBehavior === 'span_words' &&
          item.anchor.endWordId &&
          deletedSet.has(item.anchor.endWordId)
        ) {
          // Find closest previous remaining word before deleted end word
          const endIdx = previousWords.findIndex((w) => w.id === item.anchor!.endWordId);
          let newEndWordId: string | undefined;
          for (let i = endIdx - 1; i >= 0; i--) {
            if (remainingIdSet.has(previousWords[i].id)) {
              newEndWordId = previousWords[i].id;
              break;
            }
          }
          adjustedItems.push({
            ...item,
            anchor: {
              ...item.anchor,
              endWordId: newEndWordId || item.anchor.anchorWordId,
            },
          });
        } else {
          adjustedItems.push(item);
        }
        continue;
      }

      // Anchor word was deleted. Apply onAnchorDeleted policy:
      const action = item.anchor.onAnchorDeleted ?? 'convert_to_floating';

      if (action === 'delete_with_word') {
        // Drop the item
        continue;
      }

      const deletedIdx = previousWords.findIndex((w) => w.id === item.anchor!.anchorWordId);

      if (action === 'attach_to_next') {
        let nextWord: TranscriptWord | undefined;
        for (let i = deletedIdx + 1; i < previousWords.length; i++) {
          if (remainingIdSet.has(previousWords[i].id)) {
            nextWord = previousWords[i];
            break;
          }
        }

        if (nextWord && nextWord.id) {
          adjustedItems.push({
            ...item,
            anchor: {
              ...item.anchor,
              anchorWordId: nextWord.id,
            },
          });
          continue;
        }
      } else if (action === 'attach_to_previous') {
        let prevWord: TranscriptWord | undefined;
        for (let i = deletedIdx - 1; i >= 0; i--) {
          if (remainingIdSet.has(previousWords[i].id)) {
            prevWord = previousWords[i];
            break;
          }
        }

        if (prevWord && prevWord.id) {
          adjustedItems.push({
            ...item,
            anchor: {
              ...item.anchor,
              anchorWordId: prevWord.id,
            },
          });
          continue;
        }
      }

      // Default or fallback: convert_to_floating
      const lastKnown = TimelineAnchorUtils.resolveAnchoredItem(item, previousWords);
      adjustedItems.push({
        ...item,
        fallbackStartSec: lastKnown.startSec,
        fallbackEndSec: lastKnown.endSec,
        anchor: {
          ...item.anchor,
          dockingBehavior: 'floating',
        },
      });
    }

    return adjustedItems;
  }

  /**
   * Validates whether all anchored items point to valid, existing words in the transcript.
   */
  public static validateAnchors(
    items: AnchoredTimelineItem[],
    words: TranscriptWord[]
  ): {
    valid: boolean;
    brokenItemIds: string[];
    orphanedCount: number;
  } {
    const wordIdSet = new Set(words.map((w) => w.id).filter(Boolean));
    const brokenItemIds: string[] = [];

    for (const item of items) {
      if (item.anchor && item.anchor.dockingBehavior !== 'floating') {
        if (!wordIdSet.has(item.anchor.anchorWordId)) {
          brokenItemIds.push(item.id);
        } else if (
          item.anchor.dockingBehavior === 'span_words' &&
          item.anchor.endWordId &&
          !wordIdSet.has(item.anchor.endWordId)
        ) {
          brokenItemIds.push(item.id);
        }
      }
    }

    return {
      valid: brokenItemIds.length === 0,
      brokenItemIds,
      orphanedCount: brokenItemIds.length,
    };
  }
}
