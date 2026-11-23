import {subtitleWordsMatchCue} from '../../server/src/shared/subtitleWordClockReview';
import { TimedCaptionCue } from '../types';

export interface FlattenedTranscriptWord {
  key: string;
  cueId: string;
  cueIdx: number;
  wordIdx: number;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  timingSource: 'word' | 'cue-only';
  globalIndex: number;
}

export interface ClipSelectionValidation {
  isValid: boolean;
  duration: number;
  message?: string;
}

/**
 * Formats seconds into MM:SS.s format safely handling null, undefined, and NaN.
 */
export function formatTranscriptTime(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '00:00.0';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const formattedSecs = secs.toFixed(1).padStart(4, '0');
  return `${mins.toString().padStart(2, '0')}:${formattedSecs}`;
}

/**
 * Deterministically flattens cues into a linear sequence of words with global contiguous indexing.
 * Keeps cue-only text editable without inventing individual word timestamps.
 */
export function flattenTranscriptWords(cues: TimedCaptionCue[]): FlattenedTranscriptWord[] {
  const result: FlattenedTranscriptWord[] = [];
  let globalIndex = 0;

  for (let cueIdx = 0; cueIdx < cues.length; cueIdx++) {
    const cue = cues[cueIdx];
    const cueStart = Number.isFinite(cue.start) ? Math.max(0, cue.start) : 0;
    const cueEnd = Number.isFinite(cue.end) ? Math.max(cueStart + 0.1, cue.end) : cueStart + 1.0;

    const normalizedWords=Array.isArray(cue.words)?cue.words.map(w=>w&&typeof w==='object'?{...w,text:w.text||(w as any).word}:w):undefined;
    if (cue.start>=0 && subtitleWordsMatchCue({...cue,words:normalizedWords as any})) {
      for (let wordIdx = 0; wordIdx < normalizedWords!.length; wordIdx++) {
        const w = normalizedWords![wordIdx];
        const text = (w.text || (w as any).word || '').trim();
        if (!text) continue;

        const start = Number.isFinite(w.start) ? w.start : cueStart;
        const end = Number.isFinite(w.end) ? Math.max(start, w.end) : cueEnd;

        result.push({
          key: `${cue.id}:${wordIdx}`,
          cueId: cue.id,
          cueIdx,
          wordIdx,
          text,
          start,
          end,
          confidence: w.confidence,
          timingSource:'word',
          globalIndex: globalIndex++,
        });
      }
    } else {
      // Display tokens share the whole cue interval, never a guessed cut interval.
      const rawWords = (cue.text || '').replace(/\\[Nn]/g,' ').trim().split(/\s+/).filter(Boolean);

      for (let wordIdx = 0; wordIdx < rawWords.length; wordIdx++) {
        const text = rawWords[wordIdx];
        const start = cueStart;
        const end = cueEnd;

        result.push({
          key: `${cue.id}:${wordIdx}`,
          cueId: cue.id,
          cueIdx,
          wordIdx,
          text,
          start,
          end,
          timingSource:'cue-only',
          globalIndex: globalIndex++,
        });
      }
    }
  }

  return result;
}

/**
 * Resolves a range selection between two word indices into a Set of word keys.
 */
export function getWordRangeSelection(
  words: FlattenedTranscriptWord[],
  anchorIdx: number,
  targetIdx: number
): { keys: Set<string>; startIndex: number; endIndex: number } {
  const start = Math.max(0, Math.min(anchorIdx, targetIdx));
  const end = Math.min(words.length - 1, Math.max(anchorIdx, targetIdx));
  const keys = new Set<string>();

  for (let i = start; i <= end; i++) {
    keys.add(words[i].key);
  }

  return { keys, startIndex: start, endIndex: end };
}

/**
 * Finds the currently active word at playhead time.
 */
export function findActiveWord(
  words: FlattenedTranscriptWord[],
  currentTime: number
): FlattenedTranscriptWord | null {
  if (!words || words.length === 0) return null;
  for (const w of words) {
    if (w.timingSource==='word' && currentTime >= w.start && currentTime <= w.end) {
      return w;
    }
  }
  return null;
}

/**
 * Validates whether selected transcript range can form a valid clip.
 */
export function validateClipSelection(
  startSec: number,
  endSec: number,
  minDuration = 0.5,
  maxDuration = 180
): ClipSelectionValidation {
  const duration = Number((Math.max(0, endSec - startSec)).toFixed(2));

  if (duration < minDuration) {
    return {
      isValid: false,
      duration,
      message: `Selection is too short (${duration}s). Minimum clip duration is ${minDuration}s.`,
    };
  }

  if (duration > maxDuration) {
    return {
      isValid: false,
      duration,
      message: `Selection is too long (${duration}s). Maximum clip duration is ${maxDuration}s.`,
    };
  }

  return {
    isValid: true,
    duration,
  };
}
