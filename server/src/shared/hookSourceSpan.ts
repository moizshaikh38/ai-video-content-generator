/** Source-file seconds only. The hook may preview only speech that survives
 * this clip's trim and opening window. This selects evidence, not claim truth. */
export interface HookSpeechSpan {start:number;end:number;text:string}
export interface HookOpeningEvidence {sourceStart:number;sourceEnd:number;granularity:'word'|'segment';spans:HookSpeechSpan[];text:string}
export function collectHookOpeningEvidence(clip:{start_seconds:number;end_seconds:number;trim_start_offset?:number|null;trim_end_offset?:number|null},transcript:{words?:any[];segments?:any[]}):HookOpeningEvidence|null{
 const start=Number(clip.start_seconds)+Number(clip.trim_start_offset??0),end=Number(clip.end_seconds)-Number(clip.trim_end_offset??0);
 if(![start,end].every(Number.isFinite)||start<0||end<=start||Number(clip.trim_start_offset??0)<0||Number(clip.trim_end_offset??0)<0)return null;
 const sourceEnd=Math.min(end,start+40),wordMode=Array.isArray(transcript.words)&&transcript.words.length>0;
 const entries=wordMode?transcript.words:transcript.segments;if(!Array.isArray(entries))return null;
 const spans:HookSpeechSpan[]=entries.filter(v=>v&&typeof v==='object').map(v=>({start:Number(v.start),end:Number(v.end),text:typeof(v.text??v.word)==='string'?(v.text??v.word).trim():''})).filter(v=>[v.start,v.end].every(Number.isFinite)&&v.end>v.start&&v.start>=start&&v.end<=sourceEnd&&v.text.length>0).sort((a,b)=>a.start-b.start||a.end-b.end);
 // Ambiguous overlapping word/segment histories are not silently deduplicated.
 if(!spans.length||spans.some((v,i)=>i>0&&v.start<spans[i-1].end-.001))return null;
 return{sourceStart:start,sourceEnd,granularity:wordMode?'word':'segment',spans,text:spans.map(v=>v.text).join(' ')};
}
