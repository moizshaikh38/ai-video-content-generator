/** A short-source review fallback is not a chosen highlight. Drop only a short
 * unpunctuated tail after a recorded complete ending, never rewrite its words.
 * Provider punctuation is a cue, not proof of meaning or speech accuracy. */
export function shortFallbackCompleteEnd(words:unknown,start:number,end:number,minimum:number):number|null {
 if(!Array.isArray(words)||!words.length||![start,end,minimum].every(Number.isFinite)||start<0||end<=start||minimum<=0)return null;
 const ms=(t:number)=>Number(t.toFixed(3));start=ms(start);end=ms(end);
 if(words.some(w=>!w||![w.start,w.end].every(Number.isFinite)||w.start<0||w.end<=w.start||typeof(w.word??w.text)!=='string'))return null;
 const ordered=words.map(w=>({start:ms(w.start),end:ms(w.end),text:String(w.word??w.text).trim()})).filter(w=>w.text&&w.start<end&&w.end>start).sort((a,b)=>a.start-b.start||a.end-b.end);
 const terminal=(text:string)=>/[.!?।॥]+["'”’)]*$/.test(text);
 if(!ordered.length||ordered.some(w=>w.start<start||w.end>end)||terminal(ordered.at(-1)!.text))return null;
 for(let i=ordered.length-2;i>=0&&ordered.length-1-i<=3;i--){
  const w=ordered[i];if(!terminal(w.text))continue;
  if(end-w.end>2.2||w.end-start<minimum||ordered.some(other=>other.start<w.end&&other.end>w.end))return null;
  return w.end;
 }
 return null;
}
