import{MONTSERRAT_EXTRABOLD_ADVANCES}from'./captionMontserratMetrics.js';
import type{CaptionHighlightTarget}from'./captionMovingBox.js';
export interface CaptionBoxWord {text:string;start:number;end:number}
export interface CaptionBoxGlyph {text:string;x:number;line:number;wordIndex:number}
export interface CaptionBoxLayout {
 width:number;height:number;lineHeight:number;glyphs:CaptionBoxGlyph[];targets:CaptionHighlightTarget[];
}
/** Explicit per-glyph layout avoids font-shaper/ligature or DOM measurement drift.
 * ASCII-only until another script is qualified. Non-ASCII returns null, never estimates. */
export function layoutCaptionMovingBox(
 words:readonly CaptionBoxWord[],breakIndex:number,fontSize:number,letterSpacing:number,
 alignment:'left'|'center'|'right'='center',paddingX=10,paddingY=8,
 metrics:{advances:Readonly<Record<string,number>>;emRatio:number;chipGap?:number}|undefined=undefined
):CaptionBoxLayout|null{
 if(!words.length||!Number.isFinite(fontSize)||fontSize<=0||!Number.isFinite(letterSpacing)||words.some(w=>!/^[\x20-\x7E]+$/.test(w.text)||/[{}\\]/.test(w.text)))return null;
 const em=fontSize*(metrics?.emRatio??1000/1562);
 const advances=metrics?.advances??MONTSERRAT_EXTRABOLD_ADVANCES;
 const gap=metrics?.chipGap??0;
 const advance=(c:string)=>(advances[c]/1000)*em+letterSpacing;
 const wordWidth=(text:string)=>[...text].reduce((sum,c)=>sum+advance(c),0);
 const lines=breakIndex>=0&&breakIndex<words.length-1?[words.slice(0,breakIndex+1),words.slice(breakIndex+1)]:[words];
 const widths=lines.map(line=>line.reduce((sum,w)=>sum+wordWidth(w.text),0)+(line.length-1)*(advance(' ')+gap));
 const width=Math.max(...widths),height=lines.length*fontSize;
 const glyphs:CaptionBoxGlyph[]=[],targets:CaptionHighlightTarget[]=[];let index=0;
 lines.forEach((line,li)=>{
  let x=alignment==='left'?0:alignment==='right'?width-widths[li]:(width-widths[li])/2;
  for(const word of line){
   const start=x,w=wordWidth(word.text);
   for(const c of word.text){glyphs.push({text:c,x,line:li,wordIndex:index});x+=advance(c);}
   targets.push({id:`word${index++}`,start:word.start,end:word.end,x:start+w/2,y:li*fontSize+fontSize/2,width:w+paddingX*2,height:em+paddingY*2});
   x+=advance(' ')+gap;
  }
 });
 return {width,height,lineHeight:fontSize,glyphs,targets};
}
