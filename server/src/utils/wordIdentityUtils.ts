import crypto from 'node:crypto';
import { TranscriptWord } from '../types/index.js';

export interface IdentifiedWord extends TranscriptWord {
  id: string;
}

/**
 * FNV-1a 32-bit hash function returning a compact 6-character hex string.
 * Deterministic, fast, and dependency-free.
 */
export function hashWordContent(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * Generates a deterministic, collision-resistant word ID based on its text,
 * start/end timing (in milliseconds), and positional index.
 */
export function generateWordId(
  wordText: string,
  start: number,
  end: number,
  index: number,
  transcriptSalt?: string
): string {
  const cleanWord = String(wordText || '').trim().toLowerCase();
  const startMs = Math.round((Number(start) || 0) * 1000);
  const endMs = Math.round((Number(end) || 0) * 1000);
  const salt = transcriptSalt ? `:${transcriptSalt}` : '';
  const hash = hashWordContent(`${cleanWord}:${startMs}:${endMs}${salt}`);
  return `w_${index}_${hash}`;
}

/**
 * Assigns immutable, unique IDs to a list of word tokens.
 * - Preserves existing word.id if already valid and unique.
 * - Generates deterministic IDs for un-identified tokens.
 * - Handles duplicate tokens and collisions gracefully.
 */
export function assignWordIds<T extends { word?: string; text?: string; start: number; end: number; id?: string }>(
  words: T[],
  transcriptSalt?: string
): (T & { id: string })[] {
  if (!Array.isArray(words)) return [];

  const seenIds = new Set<string>();

  return words.map((w, idx) => {
    const textVal = w.word || w.text || '';
    let finalId = w.id && typeof w.id === 'string' && w.id.trim() ? w.id.trim() : '';

    if (!finalId) {
      finalId = generateWordId(textVal, w.start, w.end, idx, transcriptSalt);
    }

    // Guard against collision within the same transcript
    if (seenIds.has(finalId)) {
      let counter = 1;
      let suffixedId = `${finalId}_${counter}`;
      while (seenIds.has(suffixedId)) {
        counter++;
        suffixedId = `${finalId}_${counter}`;
      }
      finalId = suffixedId;
    }

    seenIds.add(finalId);
    return {
      ...w,
      id: finalId,
      word: textVal,
    };
  });
}

/**
 * Splits a single word into two sub-tokens (e.g. for user transcript cuts),
 * assigning derived deterministic IDs that preserve provenance.
 */
export function splitWord<T extends { word?: string; text?: string; start: number; end: number; id?: string }>(
  word: T,
  splitTime: number,
  firstPartText: string,
  secondPartText: string
): [T & { id: string }, T & { id: string }] {
  const baseId = word.id || generateWordId(word.word || word.text || '', word.start, word.end, 0);
  const clampedSplit = Math.max(word.start, Math.min(word.end, splitTime));

  const first: T & { id: string } = {
    ...word,
    id: `${baseId}_p1`,
    word: firstPartText,
    text: firstPartText,
    start: word.start,
    end: clampedSplit,
  };

  const second: T & { id: string } = {
    ...word,
    id: `${baseId}_p2`,
    word: secondPartText,
    text: secondPartText,
    start: clampedSplit,
    end: word.end,
  };

  return [first, second];
}

/**
 * Merges multiple adjacent words into a single token while tracking origin.
 */
export function mergeWords<T extends { word?: string; text?: string; start: number; end: number; id?: string }>(
  words: T[],
  customMergedText?: string
): T & { id: string } {
  if (!words || words.length === 0) {
    throw new Error('mergeWords requires at least one word token.');
  }
  if (words.length === 1) {
    return {
      ...words[0],
      id: words[0].id || generateWordId(words[0].word || words[0].text || '', words[0].start, words[0].end, 0),
    };
  }

  const sorted = [...words].sort((a, b) => a.start - b.start);
  const start = sorted[0].start;
  const end = sorted[sorted.length - 1].end;
  const text = customMergedText !== undefined 
    ? customMergedText 
    : sorted.map((w) => w.word || w.text || '').filter(Boolean).join(' ');

  const primaryId = sorted[0].id || generateWordId(text, start, end, 0);
  const mergedId = `${primaryId}_m${sorted.length}`;

  return {
    ...sorted[0],
    id: mergedId,
    word: text,
    text,
    start,
    end,
  };
}

/**
 * Maps old word IDs to new word IDs when a transcript is re-transcribed or updated.
 * Matches based on maximal temporal overlap and string similarity.
 */
export function remapWordIds(
  oldWords: { id?: string; start: number; end: number; word?: string; text?: string }[],
  newWords: { id?: string; start: number; end: number; word?: string; text?: string }[]
): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!oldWords?.length || !newWords?.length) return mapping;

  for (const oldWord of oldWords) {
    if (!oldWord.id) continue;
    const oldText = (oldWord.word || oldWord.text || '').toLowerCase().trim();

    let bestMatchId: string | null = null;
    let maxScore = 0;

    for (const newWord of newWords) {
      if (!newWord.id) continue;
      const overlapStart = Math.max(oldWord.start, newWord.start);
      const overlapEnd = Math.min(oldWord.end, newWord.end);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);

      if (overlapDuration > 0) {
        const newText = (newWord.word || newWord.text || '').toLowerCase().trim();
        const textExactMatch = oldText === newText ? 1.0 : (oldText.includes(newText) || newText.includes(oldText) ? 0.5 : 0.1);
        const score = overlapDuration * textExactMatch;

        if (score > maxScore) {
          maxScore = score;
          bestMatchId = newWord.id;
        }
      }
    }

    if (bestMatchId) {
      mapping.set(oldWord.id, bestMatchId);
    }
  }

  return mapping;
}
