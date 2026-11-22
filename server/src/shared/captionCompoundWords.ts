/** Join only a transcript-confirmed hyphenated display word. The canonical
 * transcript and each constituent's observed time span stay untouched. */
export interface CaptionCompoundPart {text:string;start:number;end:number}
export type CaptionCompoundWord=CaptionCompoundPart&{customStyle?:unknown;originalTimedParts?:CaptionCompoundPart[]};
export function joinTimedCaptionCompounds<T extends CaptionCompoundWord>(words:T[],transcriptText:string):Array<T&{originalTimedParts?:CaptionCompoundPart[]}>{
 const confirmed=new Set((String(transcriptText).match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu)??[]).map(s=>s.toLocaleLowerCase('en')));
 const out:Array<T&{originalTimedParts?:CaptionCompoundPart[]}>=[];
 for(const word of words){
  const previous=out[out.length-1],gap=previous?word.start-previous.end:Infinity;
  const compound=previous?previous.text+word.text:'';
  if(previous&&!previous.customStyle&&!word.customStyle&&!previous.originalTimedParts&&!word.originalTimedParts
   &&/^[\p{L}\p{N}]+$/u.test(previous.text)&&/^-[\p{L}\p{N}]+$/u.test(word.text)
   &&Number.isFinite(previous.start)&&Number.isFinite(word.end)&&previous.end>previous.start&&word.end>word.start
   &&Number.isFinite(gap)&&gap>=-0.001&&gap<=0.02&&confirmed.has(compound.toLocaleLowerCase('en'))){
   out[out.length-1]={...previous,text:compound,end:word.end,originalTimedParts:[{text:previous.text,start:previous.start,end:previous.end},{text:word.text,start:word.start,end:word.end}]};
  }else out.push({...word});
 }
 return out;
}
