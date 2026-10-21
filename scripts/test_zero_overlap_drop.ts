import assert from 'assert';
import { enforceZeroOverlap, groupWordsIntoCues } from '../server/src/shared/captionPresets.js';

console.log('Testing enforceZeroOverlap word drop...');

const cue1 = {
  id: 'cue-1',
  start: 0.0,
  end: 2.0,
  text: 'Hello world today',
  words: [
    { text: 'Hello', start: 0.0, end: 0.5 },
    { text: 'world', start: 0.5, end: 1.0 },
    { text: 'today', start: 1.6, end: 2.0 },
  ],
};
const cue2 = {
  id: 'cue-2',
  start: 1.5,
  end: 3.0,
  text: 'we are here',
  words: [
    { text: 'we', start: 1.5, end: 1.9 },
    { text: 'are', start: 1.9, end: 2.4 },
    { text: 'here', start: 2.4, end: 3.0 },
  ],
};

function safeEnforceZeroOverlap(cues: any[]) {
  if (!cues || cues.length <= 1) return cues || [];
  const sorted = [...cues].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.end > next.start) {
      const clampedEnd = Math.max(current.start + 0.05, Number(next.start.toFixed(3)));
      current.end = clampedEnd;

      if (Array.isArray(current.words) && current.words.length > 0) {
        const needsRedistribution = current.words.some(
          (w) => w.start >= clampedEnd || Math.min(clampedEnd, w.end) - w.start < 0.02
        );

        if (needsRedistribution) {
          const totalChars = current.words.reduce(
            (sum: number, w: any) => sum + Math.max(1, (w.text || w.word || '').length),
            0
          );
          const cueDuration = Math.max(0.05, clampedEnd - current.start);
          let curStart = current.start;

          const redistributed = current.words.map((w: any, wIdx: number) => {
            const isLast = wIdx === current.words.length - 1;
            const wText = w.text || w.word || '';
            const weight = Math.max(1, wText.length) / totalChars;
            const dur = isLast
              ? Math.max(0.02, clampedEnd - curStart)
              : Math.max(0.02, Number((cueDuration * weight).toFixed(3)));
            const wEnd = isLast
              ? clampedEnd
              : Number(Math.min(clampedEnd, curStart + dur).toFixed(3));
            const token = {
              ...w,
              text: wText,
              start: Number(curStart.toFixed(3)),
              end: Number(wEnd.toFixed(3)),
            };
            curStart = wEnd;
            return token;
          });

          current.words = redistributed;
          current.tokens = redistributed;
        } else {
          current.words = current.words.map((w: any) => ({
            ...w,
            end: Number(Math.min(clampedEnd, w.end).toFixed(3)),
          }));
          current.tokens = current.words;
        }
      }
    }
  }
  return sorted;
}

const allWordsBefore = [...cue1.words, ...cue2.words].map(w => w.text);

const result = safeEnforceZeroOverlap([JSON.parse(JSON.stringify(cue1)), JSON.parse(JSON.stringify(cue2))]);
console.log('Cue 1 words after safeEnforceZeroOverlap:', result[0].words?.map((w: any) => `${w.text} (${w.start}-${w.end})`));
console.log('Cue 1 text after safeEnforceZeroOverlap:', result[0].text);
console.log('Cue 2 words after safeEnforceZeroOverlap:', result[1].words?.map((w: any) => `${w.text} (${w.start}-${w.end})`));

const allWordsAfter = [...(result[0].words || []), ...(result[1].words || [])].map((w: any) => w.text);

console.log('All words before:', allWordsBefore);
console.log('All words after:', allWordsAfter);

if (allWordsBefore.length !== allWordsAfter.length) {
  console.log('❌ BUG: Words were dropped! Dropped words:', allWordsBefore.filter(w => !allWordsAfter.includes(w)));
} else {
  console.log('✅ SUCCESS: All words preserved without dropping!');
}
