/** Independent idle-caret candidate:500ms cycle,250ms on/250ms off.
 * Blink is observed, but these intervals are NOT measured Opus timing.
 * Uses centiseconds so preview and ASS can share deterministic seek state. */
export const CAPTION_CARET_IDLE_HALF_PERIOD=.25;
export function isCaptionCaretVisible(time:number,completedAt:number):boolean{
 if(!Number.isFinite(time)||!Number.isFinite(completedAt))return false;
 const tick=Number(time.toFixed(2)),complete=Number(completedAt.toFixed(2));
 if(tick<complete)return true;
 return Math.floor((tick-complete+1e-7)/CAPTION_CARET_IDLE_HALF_PERIOD)%2===0;
}
export function getCaptionCaretBlinkBoundaries(start:number,end:number,completedAt:number):number[]{
 if(![start,end,completedAt].every(Number.isFinite)||end<=start)return [];
 const result:number[]=[];
 const first=Math.max(1,Math.floor((start-completedAt)/CAPTION_CARET_IDLE_HALF_PERIOD)+1);
 for(let i=first;;i++){
  const t=Number((completedAt+i*CAPTION_CARET_IDLE_HALF_PERIOD).toFixed(2));
  if(t>=end)break;
  if(t>start)result.push(t);
 }
 return result;
}
