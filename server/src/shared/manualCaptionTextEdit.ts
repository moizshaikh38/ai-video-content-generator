import {subtitleWordsMatchCue} from './subtitleWordClockReview.js';
/** Positional compatibility only, not audio alignment. A count change has no
 * observed mapping. Never manufacture timing or raise source confidence. */
export function manualCaptionTextEdit<T extends {text:string;start:number;end:number;words?:any[];tokens?:any[]}>(cue:T,text:string):T{
 const source=Array.isArray(cue.words)&&cue.words.length?cue.words:Array.isArray(cue.tokens)?cue.tokens:[];
 const sourceEntriesValid=source.length>0&&Array.from(source).every(w=>w!==null&&typeof w==='object'&&!Array.isArray(w));
 const normalized=sourceEntriesValid?source.map(w=>({...w,text:w.text??w.word})):[];
 const words=text.replace(/\\[Nn]/g,' ').trim().split(/\s+/).filter(Boolean);
 if(words.length===normalized.length&&subtitleWordsMatchCue({...cue,words:normalized})){
  const updated=normalized.map((w,index)=>({...w,text:words[index],word:words[index]}));
  return {...cue,text,words:updated,tokens:updated};
 }
 return {...cue,text,words:undefined,tokens:undefined};
}
