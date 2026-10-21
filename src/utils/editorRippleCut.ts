import { EditorProject, EditorTrack, EditorTrackItem, TimedCaptionCue, TimedCaptionToken } from '../types';

export interface TimeRange {
  startSec: number;
  endSec: number;
}

/**
 * Shifts and slices caption cues and their nested word tokens when a time range is cut.
 */
export function sliceAndShiftCues(
  cues: TimedCaptionCue[],
  cutStart: number,
  cutEnd: number,
  cutDuration: number
): TimedCaptionCue[] {
  if (cutDuration <= 0) return cues;

  const result: TimedCaptionCue[] = [];

  for (const cue of cues) {
    // 1. Completely before cut: retain untouched
    if (cue.end <= cutStart) {
      result.push(cue);
      continue;
    }

    // 2. Completely after cut: shift timestamps left by cutDuration
    if (cue.start >= cutEnd) {
      const shiftedWords: TimedCaptionToken[] | undefined = Array.isArray(cue.words)
        ? cue.words.map((w: TimedCaptionToken) => ({
            ...w,
            text: w.text || w.word || '',
            word: w.word || w.text || '',
            start: Math.max(0, Number((w.start - cutDuration).toFixed(3))),
            end: Math.max(0.05, Number((w.end - cutDuration).toFixed(3))),
          }))
        : cue.words;

      result.push({
        ...cue,
        start: Math.max(0, Number((cue.start - cutDuration).toFixed(3))),
        end: Math.max(0.1, Number((cue.end - cutDuration).toFixed(3))),
        words: shiftedWords,
      });
      continue;
    }

    // 3. Completely inside cut: dropped entirely
    if (cue.start >= cutStart && cue.end <= cutEnd) {
      continue;
    }

    // 4. Overlapping or spanning: slice nested words or trim boundaries
    if (Array.isArray(cue.words) && cue.words.length > 0) {
      const survivingWords: TimedCaptionToken[] = cue.words
        .filter((w: TimedCaptionToken) => !(w.start >= cutStart && w.end <= cutEnd))
        .map((w: TimedCaptionToken) => {
          const wordText = w.text || w.word || '';
          if (w.start >= cutEnd) {
            return {
              ...w,
              text: wordText,
              word: wordText,
              start: Math.max(0, Number((w.start - cutDuration).toFixed(3))),
              end: Math.max(0.05, Number((w.end - cutDuration).toFixed(3))),
            };
          }
          if (w.start < cutStart && w.end > cutStart && w.end <= cutEnd) {
            return { ...w, text: wordText, word: wordText, end: Number(cutStart.toFixed(3)) };
          }
          if (w.start >= cutStart && w.start < cutEnd && w.end > cutEnd) {
            return {
              ...w,
              text: wordText,
              word: wordText,
              start: Number(cutStart.toFixed(3)),
              end: Math.max(cutStart + 0.05, Number((w.end - cutDuration).toFixed(3))),
            };
          }
          return { ...w, text: wordText, word: wordText };
        });

      if (survivingWords.length > 0) {
        const newStart = Math.min(...survivingWords.map((w: TimedCaptionToken) => w.start));
        const newEnd = Math.max(...survivingWords.map((w: TimedCaptionToken) => w.end));
        result.push({
          ...cue,
          start: Number(newStart.toFixed(3)),
          end: Number(newEnd.toFixed(3)),
          text: survivingWords.map((w: TimedCaptionToken) => w.text).join(' '),
          words: survivingWords,
        });
      }
    } else {
      // Cue without word tokens
      if (cue.start < cutStart && cue.end > cutStart && cue.end <= cutEnd) {
        result.push({
          ...cue,
          end: Number(cutStart.toFixed(3)),
        });
      } else if (cue.start >= cutStart && cue.start < cutEnd && cue.end > cutEnd) {
        result.push({
          ...cue,
          start: Number(cutStart.toFixed(3)),
          end: Math.max(cutStart + 0.1, Number((cue.end - cutDuration).toFixed(3))),
        });
      } else if (cue.start < cutStart && cue.end > cutEnd) {
        // Spans across: trim left segment
        result.push({
          ...cue,
          end: Number(cutStart.toFixed(3)),
        });
      }
    }
  }

  return result;
}

export interface PartitionCaptionCuesOptions {
  /** If true, the returned right segment cues are translated to be relative to the split point (0-indexed). */
  segmentRelativeRight?: boolean;
}

export interface PartitionCaptionCuesResult {
  leftCues: TimedCaptionCue[];
  rightCues: TimedCaptionCue[];
}

/**
 * Partitions caption cues across a split boundary (`splitTime`).
 *
 * Boundary policy:
 * - Cues ending at or before `splitTime` (`cue.end <= splitTime`) belong to `leftCues`.
 * - Cues starting at or after `splitTime` (`cue.start >= splitTime`) belong to `rightCues`.
 * - Cues straddling `splitTime` (`cue.start < splitTime && cue.end > splitTime`):
 *   - If word tokens exist, words ending <= splitTime go left, words starting >= splitTime go right.
 *     A word straddling splitTime is assigned to the side where the majority of its duration falls.
 *     Left and right split cues are formed from surviving words, preserving all styling and cue metadata.
 *   - If no word tokens exist (segment cue), the cue is split at splitTime into two halves:
 *     left half [cue.start, splitTime] and right half [splitTime, cue.end].
 * - If `segmentRelativeRight` is true (or if input cues were segment-relative with itemTimelineStart > 0),
 *   right cues have their timestamps translated relative to splitTime (starting at 0).
 */
export function partitionCaptionCues(
  cues: TimedCaptionCue[],
  splitTime: number,
  itemTimelineStart = 0,
  options?: PartitionCaptionCuesOptions
): PartitionCaptionCuesResult {
  if (!Array.isArray(cues) || cues.length === 0) {
    return { leftCues: [], rightCues: [] };
  }

  // Detect if input cues are segment-relative
  const isInputSegmentRelative =
    itemTimelineStart > 0 &&
    cues.length > 0 &&
    cues.every((c) => c.start < itemTimelineStart);

  const effectiveCutPoint = isInputSegmentRelative
    ? Math.max(0, Number((splitTime - itemTimelineStart).toFixed(3)))
    : splitTime;

  const leftCues: TimedCaptionCue[] = [];
  const rightCues: TimedCaptionCue[] = [];

  for (const cue of cues) {
    // 1. Completely before split
    if (cue.end <= effectiveCutPoint) {
      leftCues.push(cue);
      continue;
    }

    // 2. Completely after split
    if (cue.start >= effectiveCutPoint) {
      rightCues.push(cue);
      continue;
    }

    // 3. Straddling cue: cue.start < effectiveCutPoint && cue.end > effectiveCutPoint
    if (Array.isArray(cue.words) && cue.words.length > 0) {
      const leftWords: TimedCaptionToken[] = [];
      const rightWords: TimedCaptionToken[] = [];

      for (const w of cue.words) {
        const wordText = w.text || (w as any).word || '';
        if (w.end <= effectiveCutPoint) {
          leftWords.push({ ...w, text: wordText, word: wordText });
        } else if (w.start >= effectiveCutPoint) {
          rightWords.push({ ...w, text: wordText, word: wordText });
        } else {
          // Word straddles effectiveCutPoint
          const wordMidpoint = (w.start + w.end) / 2;
          if (effectiveCutPoint >= wordMidpoint) {
            // Majority on left
            leftWords.push({
              ...w,
              text: wordText,
              word: wordText,
              end: Number(effectiveCutPoint.toFixed(3)),
            });
          } else {
            // Majority on right
            rightWords.push({
              ...w,
              text: wordText,
              word: wordText,
              start: Number(effectiveCutPoint.toFixed(3)),
            });
          }
        }
      }

      if (leftWords.length > 0) {
        const leftStart = Math.min(...leftWords.map((w) => w.start));
        const leftEnd = Math.max(...leftWords.map((w) => w.end));
        leftCues.push({
          ...cue,
          id: cue.id,
          start: Number(leftStart.toFixed(3)),
          end: Number(Math.min(effectiveCutPoint, leftEnd).toFixed(3)),
          text: leftWords.map((w) => w.text || (w as any).word || '').join(' '),
          words: leftWords,
        });
      }

      if (rightWords.length > 0) {
        const rightStart = Math.min(...rightWords.map((w) => w.start));
        const rightEnd = Math.max(...rightWords.map((w) => w.end));
        rightCues.push({
          ...cue,
          id: `${cue.id}_split`,
          start: Number(Math.max(effectiveCutPoint, rightStart).toFixed(3)),
          end: Number(rightEnd.toFixed(3)),
          text: rightWords.map((w) => w.text || (w as any).word || '').join(' '),
          words: rightWords,
        });
      }
    } else {
      // Segment cue without word tokens
      leftCues.push({
        ...cue,
        id: cue.id,
        start: cue.start,
        end: Number(effectiveCutPoint.toFixed(3)),
      });

      rightCues.push({
        ...cue,
        id: `${cue.id}_split`,
        start: Number(effectiveCutPoint.toFixed(3)),
        end: cue.end,
      });
    }
  }

  // Handle segment-relative translation for right cues if requested or if input was segment-relative
  const shouldMakeRightSegmentRelative = Boolean(
    options?.segmentRelativeRight || isInputSegmentRelative
  );

  const finalRightCues = shouldMakeRightSegmentRelative
    ? rightCues.map((c) => {
        const offset = effectiveCutPoint;
        const shiftedWords = Array.isArray(c.words)
          ? c.words.map((w) => ({
              ...w,
              start: Math.max(0, Number((w.start - offset).toFixed(3))),
              end: Math.max(0.05, Number((w.end - offset).toFixed(3))),
            }))
          : c.words;
        return {
          ...c,
          start: Math.max(0, Number((c.start - offset).toFixed(3))),
          end: Math.max(0.05, Number((c.end - offset).toFixed(3))),
          words: shiftedWords,
        };
      })
    : rightCues;

  return { leftCues, rightCues: finalRightCues };
}

/**
 * Applies a single ripple cut across all unlocked media tracks and caption tracks of an EditorProject.
 */
export function applyRippleCutToProject(
  project: EditorProject,
  startSec: number,
  endSec: number
): EditorProject {
  const cutStart = Math.min(startSec, endSec);
  const cutEnd = Math.max(startSec, endSec);
  const cutDuration = Number((cutEnd - cutStart).toFixed(3));

  if (cutDuration <= 0) return project;

  const nextTracks: EditorTrack[] = project.tracks.map((track) => {
    if (track.locked) return track;

    // Handle CAPTION tracks with accurate item slicing, shifting and cue synchronization
    if (track.type === 'CAPTION') {
      const slicedItems: EditorTrackItem[] = track.items.flatMap((item) => {
        // 1. Completely before cut: retain untouched
        if (item.timeline_end <= cutStart) {
          return [item];
        }

        // 2. Completely inside cut: dropped entirely
        if (item.timeline_start >= cutStart && item.timeline_end <= cutEnd) {
          return [];
        }

        const updatedCues: TimedCaptionCue[] = Array.isArray(item.caption?.cues)
          ? sliceAndShiftCues(item.caption.cues as TimedCaptionCue[], cutStart, cutEnd, cutDuration)
          : [];

        const updatedCaption = item.caption
          ? {
              ...item.caption,
              cues: updatedCues,
            }
          : undefined;

        // 3. Completely after cut: shift timestamps left by cutDuration
        if (item.timeline_start >= cutEnd) {
          return [
            {
              ...item,
              timeline_start: Math.max(0, Number((item.timeline_start - cutDuration).toFixed(3))),
              timeline_end: Math.max(0.1, Number((item.timeline_end - cutDuration).toFixed(3))),
              caption: updatedCaption,
            },
          ];
        }

        // 4. Spans across cut: shorten duration and slice/shift cues
        if (item.timeline_start <= cutStart && item.timeline_end >= cutEnd) {
          return [
            {
              ...item,
              timeline_end: Math.max(0.1, Number((item.timeline_end - cutDuration).toFixed(3))),
              caption: updatedCaption,
            },
          ];
        }

        // 5. Overlaps left edge of cut: trim right edge
        if (item.timeline_start < cutStart && item.timeline_end > cutStart && item.timeline_end <= cutEnd) {
          return [
            {
              ...item,
              timeline_end: Number(cutStart.toFixed(3)),
              caption: updatedCaption,
            },
          ];
        }

        // 6. Overlaps right edge of cut: trim left edge and shift
        if (item.timeline_start >= cutStart && item.timeline_start < cutEnd && item.timeline_end > cutEnd) {
          return [
            {
              ...item,
              timeline_start: Number(cutStart.toFixed(3)),
              timeline_end: Math.max(0.1, Number((item.timeline_end - cutDuration).toFixed(3))),
              caption: updatedCaption,
            },
          ];
        }

        return [item];
      });

      return {
        ...track,
        items: slicedItems,
      };
    }

    // Media tracks: VIDEO, AUDIO, TEXT, OVERLAY, IMAGE
    const slicedItems: EditorTrackItem[] = track.items.flatMap((item) => {
      const speed =
        typeof item.speed === 'object' && item.speed?.speed
          ? item.speed.speed
          : typeof item.speed === 'number'
          ? item.speed
          : 1;

      // 1. Completely before cut: keep unchanged
      if (item.timeline_end <= cutStart) {
        return [item];
      }

      // 2. Completely after cut: shift left
      if (item.timeline_start >= cutEnd) {
        return [
          {
            ...item,
            timeline_start: Math.max(0, Number((item.timeline_start - cutDuration).toFixed(3))),
            timeline_end: Math.max(0.1, Number((item.timeline_end - cutDuration).toFixed(3))),
          },
        ];
      }

      // 3. Completely inside cut: remove item
      if (item.timeline_start >= cutStart && item.timeline_end <= cutEnd) {
        return [];
      }

      // 4. Spans across the entire cut: split into two sliced items
      if (item.timeline_start < cutStart && item.timeline_end > cutEnd) {
        const leftItem: EditorTrackItem = {
          ...item,
          timeline_start: item.timeline_start,
          timeline_end: Number(cutStart.toFixed(3)),
          source_start: item.source_start,
          source_end: Number(
            (item.source_start + (cutStart - item.timeline_start) * speed).toFixed(3)
          ),
        };

        const rightItem: EditorTrackItem = {
          ...JSON.parse(JSON.stringify(item)),
          id: crypto.randomUUID(),
          timeline_start: Number(cutStart.toFixed(3)),
          timeline_end: Number((item.timeline_end - cutDuration).toFixed(3)),
          source_start: Number(
            (item.source_start + (cutEnd - item.timeline_start) * speed).toFixed(3)
          ),
          source_end: item.source_end,
        };

        return [leftItem, rightItem];
      }

      // 5. Overlaps left edge of cut: trim right edge
      if (
        item.timeline_start < cutStart &&
        item.timeline_end > cutStart &&
        item.timeline_end <= cutEnd
      ) {
        return [
          {
            ...item,
            timeline_end: Number(cutStart.toFixed(3)),
            source_end: Number(
              (item.source_start + (cutStart - item.timeline_start) * speed).toFixed(3)
            ),
          },
        ];
      }

      // 6. Overlaps right edge of cut: trim left edge and shift
      if (
        item.timeline_start >= cutStart &&
        item.timeline_start < cutEnd &&
        item.timeline_end > cutEnd
      ) {
        const trimmed = cutEnd - item.timeline_start;
        return [
          {
            ...item,
            timeline_start: Number(cutStart.toFixed(3)),
            timeline_end: Number((item.timeline_end - cutDuration).toFixed(3)),
            source_start: Number((item.source_start + trimmed * speed).toFixed(3)),
          },
        ];
      }

      return [item];
    });

    return {
      ...track,
      items: slicedItems,
    };
  });

  const newCanvasDuration = Math.max(0.5, Number((project.canvas.duration - cutDuration).toFixed(3)));

  return {
    ...project,
    canvas: {
      ...project.canvas,
      duration: newCanvasDuration,
    },
    tracks: nextTracks,
  };
}

/**
 * Batch ripple cuts multiple time ranges in reverse chronological order
 * so earlier cut coordinates remain valid on the uncut timeline.
 */
export function applyBatchRippleCuts(
  project: EditorProject,
  ranges: TimeRange[]
): EditorProject {
  if (!ranges || ranges.length === 0) return project;

  const sorted = [...ranges]
    .map((r) => ({
      startSec: Math.min(r.startSec, r.endSec),
      endSec: Math.max(r.startSec, r.endSec),
    }))
    .filter((r) => r.endSec > r.startSec)
    .sort((a, b) => b.startSec - a.startSec);

  let currentProject = project;
  for (const range of sorted) {
    currentProject = applyRippleCutToProject(currentProject, range.startSec, range.endSec);
  }

  return currentProject;
}

/**
 * Batch ripple cuts for cues array in reverse chronological order.
 */
export function applyBatchRippleCutsToCues(
  cues: TimedCaptionCue[],
  ranges: TimeRange[]
): TimedCaptionCue[] {
  if (!ranges || ranges.length === 0) return cues;

  const sorted = [...ranges]
    .map((r) => ({
      startSec: Math.min(r.startSec, r.endSec),
      endSec: Math.max(r.startSec, r.endSec),
    }))
    .filter((r) => r.endSec > r.startSec)
    .sort((a, b) => b.startSec - a.startSec);

  let currentCues = cues;
  for (const range of sorted) {
    const cutDur = Number((range.endSec - range.startSec).toFixed(3));
    currentCues = sliceAndShiftCues(currentCues, range.startSec, range.endSec, cutDur);
  }

  return currentCues;
}
