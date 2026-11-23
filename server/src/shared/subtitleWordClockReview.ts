interface CueWordClock {text:string;start:number;end:number}
interface CueDisplayClock {text:string;start:number;end:number;words?:CueWordClock[];tokens?:unknown[]}

const displayWords=(text:string)=>text.replace(/\\[Nn]/g,' ').trim().split(/\s+/).filter(Boolean);
/** Word clocks are reusable only for exactly the displayed text and cue window.
 * A manual correction must never be replaced by old provider word text. Do not
 * invent replacement word timings; the renderer already supports segment text.
 */
export function subtitleWordsMatchCue(cue:CueDisplayClock):boolean {
 if(typeof cue.text!=='string'||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.end<=cue.start||!Array.isArray(cue.words)||cue.words.length===0)return false;
 const text=displayWords(cue.text);if(text.length!==cue.words.length)return false;
 let previous=cue.start;
 for(let index=0;index<cue.words.length;index++){
  const word=cue.words[index];
  if(!word||typeof word.text!=='string'||word.text!==text[index]||
   typeof word.start!=='number'||!Number.isFinite(word.start)||typeof word.end!=='number'||!Number.isFinite(word.end)||
   word.start<cue.start||word.end>cue.end||word.end<=word.start||word.start<previous)return false;
  previous=word.end;
 }
 return true;
}
export function subtitleRenderCues<T extends CueDisplayClock>(cues:T[]):T[]{
 return cues.map(cue=>subtitleWordsMatchCue(cue)?cue:{...cue,words:undefined,tokens:undefined});
}
