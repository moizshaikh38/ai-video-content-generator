/** Independent chip motion/colors. No clock, browser state or reference-code dependency. */
export interface CaptionChipWord {start:number;end:number}
export interface CaptionChipState {scale:number;offsetY:number;color:string;active:number}
const mix=(a:string,b:string,p:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-p)+parseInt(b.slice(i,i+2),16)*p).toString(16).padStart(2,'0')).join('').toUpperCase();
/** Candidate160ms state transitions, mild held lift/scale. Shared20ms ticks. */
export function getCaptionChipStates(words:readonly CaptionChipWord[],time:number,cueStart:number,cueEnd:number,rest='#FFFFFF',active='#F7C204'):CaptionChipState[]{
 const valid=/^#[0-9a-fA-F]{6}$/;rest=valid.test(rest)?rest:'#FFFFFF';active=valid.test(active)?active:'#F7C204';
 const t=cueStart+Math.floor((time-cueStart)*50+1e-7)/50;
 const on=(start:number,end:number)=>{
  if(![t,start,end].every(Number.isFinite)||end<=start||time<cueStart||time>=cueEnd)return 0;
  const duration=Math.min(.16,(end-start)/2),rise=(t-start)/Math.max(.01,duration),fall=(end-t)/Math.max(.01,duration);
  const p=Math.max(0,Math.min(1,rise,fall));return 1-Math.pow(1-p,3);
 };
 return words.map(w=>{const p=on(w.start,w.end);return {active:p,scale:1+.045*p,offsetY:p?-14*p:0,color:mix(rest,active,p)};});
}
