export type FinalSpeechScope = {
  status: 'unchanged' | 'changed' | 'unavailable';
  originalWordCount: number;
  finalWordCount: number;
  finalWordBoundarySafe: boolean | null;
  finalEndingPunctuation: boolean | null;
};

// Word identity is the row's position in the same source transcript, not its
// spelling. Repeated words must not hide a changed source interval.
export function compareFinalSpeechScope(input: {
  words: Array<{ start: number; end: number; word?: string; text?: string }>;
  originalStart: number; originalEnd: number; finalStart: number; finalEnd: number;
}): FinalSpeechScope {
  const words = input.words.flatMap((w, index) => w && Number.isFinite(w.start) && Number.isFinite(w.end) &&
    w.start >= 0 && w.end > w.start && typeof (w.word ?? w.text) === 'string' && String(w.word ?? w.text).trim()
    ? [{ ...w, index, text: String(w.word ?? w.text).trim() }] : []);
  const validBounds = [input.originalStart,input.originalEnd,input.finalStart,input.finalEnd].every(Number.isFinite) &&
    input.originalStart >= 0 && input.finalStart >= 0 && input.originalEnd > input.originalStart && input.finalEnd > input.finalStart;
  if (!validBounds || !words.length) return {status:'unavailable',originalWordCount:0,finalWordCount:0,finalWordBoundarySafe:null,finalEndingPunctuation:null};
  const original = words.filter(w => w.start < input.originalEnd && w.end > input.originalStart);
  const final = words.filter(w => w.start < input.finalEnd && w.end > input.finalStart);
  if (!original.length && !final.length) return {status:'unavailable',originalWordCount:0,finalWordCount:0,finalWordBoundarySafe:null,finalEndingPunctuation:null};
  const signature = (items:typeof words,start:number,end:number) => items.map(w => [w.index,w.start < start,w.end > end]);
  const safe = final.every(w => w.start >= input.finalStart && w.end <= input.finalEnd);
  const last = [...final].sort((a,b)=>a.end-b.end).at(-1);
  return {
    status: JSON.stringify(signature(original,input.originalStart,input.originalEnd)) === JSON.stringify(signature(final,input.finalStart,input.finalEnd)) ? 'unchanged' : 'changed',
    originalWordCount: original.length, finalWordCount: final.length, finalWordBoundarySafe:safe,
    finalEndingPunctuation: Boolean(safe && last && /[.!?।॥]+[\"'”’)]*$/.test(last.text)),
  };
}
