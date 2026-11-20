export type FinalSpeechScope = {
  status: 'unchanged' | 'changed' | 'unavailable';
  originalWordCount: number;
  finalWordCount: number;
  finalWordBoundarySafe: boolean | null;
  finalEndingPunctuation: boolean | null;
  /** Lexical review signal only, never a standalone-quality verdict. */
  finalOpeningReviewReason?: 'potential-dependent-opening';
};

/** Narrow lexical signal for omitted-question review. It never proves that an
 * opening is bad or good; only actual adjacent question evidence may repair it. */
export function potentialDependentOpening(text:string):boolean {
 return /^(?:because\b|that(?:'s| is) why\b)/i.test(text.replace(/^[\s"'“”‘’]+/u,''));
}

// Word identity is the row's position in the same source transcript, not its
// spelling. Repeated words must not hide a changed source interval.
export function compareFinalSpeechScope(input: {
  words: Array<{ start: number; end: number; word?: string; text?: string }>;
  originalStart: number; originalEnd: number; finalStart: number; finalEnd: number;
}): FinalSpeechScope {
  const ms = (time:number) => Number(time.toFixed(3));
  const words = input.words.flatMap((w, index) => w && Number.isFinite(w.start) && Number.isFinite(w.end) &&
    w.start >= 0 && w.end > w.start && typeof (w.word ?? w.text) === 'string' && String(w.word ?? w.text).trim()
    ? [{ ...w, start:ms(w.start),end:ms(w.end),index,text:String(w.word ?? w.text).trim() }] : []).filter(w => w.end > w.start);
  const validBounds = [input.originalStart,input.originalEnd,input.finalStart,input.finalEnd].every(Number.isFinite) &&
    input.originalStart >= 0 && input.finalStart >= 0 && input.originalEnd > input.originalStart && input.finalEnd > input.finalStart;
  if (!validBounds || !words.length) return {status:'unavailable',originalWordCount:0,finalWordCount:0,finalWordBoundarySafe:null,finalEndingPunctuation:null};
  input = {...input,originalStart:ms(input.originalStart),originalEnd:ms(input.originalEnd),finalStart:ms(input.finalStart),finalEnd:ms(input.finalEnd)};
  const original = words.filter(w => w.start < input.originalEnd && w.end > input.originalStart);
  const final = words.filter(w => w.start < input.finalEnd && w.end > input.finalStart);
  if (!original.length && !final.length) return {status:'unavailable',originalWordCount:0,finalWordCount:0,finalWordBoundarySafe:null,finalEndingPunctuation:null};
  const signature = (items:typeof words,start:number,end:number) => items.map(w => [w.index,w.start < start,w.end > end]);
  const safe = final.every(w => w.start >= input.finalStart && w.end <= input.finalEnd);
  const last = [...final].sort((a,b)=>a.end-b.end).at(-1);
  return {
    status: JSON.stringify(signature(original,input.originalStart,input.originalEnd)) === JSON.stringify(signature(final,input.finalStart,input.finalEnd)) ? 'unchanged' : 'changed',
    originalWordCount: original.length, finalWordCount: final.length, finalWordBoundarySafe:safe,
    ...(safe && potentialDependentOpening([...final].sort((a,b)=>a.start-b.start||a.index-b.index).slice(0,5).map(w=>w.text).join(' ')) ? {finalOpeningReviewReason:'potential-dependent-opening' as const} : {}),
    finalEndingPunctuation: Boolean(safe && last && /[.!?।॥]+[\"'”’)]*$/.test(last.text)),
  };
}

/** Exact final spoken text for internal comparison, never generated labels or
 * broad overlapping segments. Unknown/partial word evidence cannot suppress
 * another candidate as a semantic duplicate. Text is not rewritten. */
export function finalSpokenText(words:Array<{start:number;end:number;word?:string;text?:string}>,start:number,end:number):string {
 if(![start,end].every(Number.isFinite)||start<0||end<=start)return '';
 const ms=(v:number)=>Number(v.toFixed(3));start=ms(start);end=ms(end);
 const selected=words.flatMap((w,index)=>w&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start&&typeof(w.word??w.text)==='string'&&String(w.word??w.text).trim()?[{start:ms(w.start),end:ms(w.end),text:String(w.word??w.text).trim(),index}]:[]).filter(w=>w.end>w.start&&w.start<end&&w.end>start);
 if(selected.some(w=>w.start<start||w.end>end))return '';
 return selected.sort((a,b)=>a.start-b.start||a.index-b.index).map(w=>w.text).join(' ');
}

/** Provider scores describe the proposed spoken interval. Without usable words,
 * a changed clock cannot be assumed to contain the same speech. Tiny source
 * float noise is compared at the same millisecond precision as saved clips.
 * A lexical dependent-opening flag also suspends ranking for review. It is not
 * a semantic rejection, and absence of the flag is not narrative acceptance. */
export function narrativeRankingInvalidationReason(scope:FinalSpeechScope,bounds:{originalStart:number;originalEnd:number;finalStart:number;finalEnd:number}):'spoken-content-changed-after-proposal'|'changed-interval-speech-scope-unverified'|'dependent-opening-needs-review'|undefined {
 if(scope.status==='changed')return 'spoken-content-changed-after-proposal';
 if(scope.finalOpeningReviewReason)return 'dependent-opening-needs-review';
 if(scope.status!=='unavailable')return undefined;
 const values=[bounds.originalStart,bounds.originalEnd,bounds.finalStart,bounds.finalEnd];
 if(!values.every(Number.isFinite))return 'changed-interval-speech-scope-unverified';
 const [a,b,c,d]=values.map(v=>Number(v.toFixed(3)));
 return a!==c||b!==d?'changed-interval-speech-scope-unverified':undefined;
}
