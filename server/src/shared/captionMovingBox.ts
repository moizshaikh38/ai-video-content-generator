/** Independent moving highlight-box state. Caller supplies glyph geometry from its
 * actual bound font/layout. No guessed character widths, clocks or DOM access. */
export interface CaptionHighlightTarget {
  id:string; start:number; end:number; x:number; y:number; width:number; height:number;
}
export interface CaptionMovingBoxState {
  targetId:string; x:number; y:number; width:number; height:number;
  scale:number; opacity:number; moving:boolean;
}
export interface CaptionMovingBoxOptions { durationMs:number; entryMs:number; tickMs:number }
const defaults:CaptionMovingBoxOptions={durationMs:120,entryMs:100,tickMs:20};
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
/** Pure seekable state. Targets belong to ONE original cue/metadata boundary.
 * Interpolates center and dimensions with cubic ease-out. Rapid interruptions start
 * at the preceding transition's actual state, not its final target, so no jump.
 * First target begins with a small scale-in; no fake targets for segment-only text.
 * These are independent candidate motion parameters, not competitor timing. */
export function getCaptionMovingBox(
  supplied:readonly CaptionHighlightTarget[],time:number,cueStart:number,cueEnd:number,
  options:Partial<CaptionMovingBoxOptions>={}
):CaptionMovingBoxState|null {
  if(![time,cueStart,cueEnd].every(Number.isFinite)||cueEnd<=cueStart||time<cueStart||time>=cueEnd)return null;
  const duration=clamp(Number.isFinite(options.durationMs)?options.durationMs!:defaults.durationMs,0,500)/1000;
  const entry=clamp(Number.isFinite(options.entryMs)?options.entryMs!:defaults.entryMs,0,500)/1000;
  const tick=clamp(Number.isFinite(options.tickMs)?options.tickMs!:defaults.tickMs,1,100)/1000;
  const targets=supplied.map((t,index)=>({...t,index,start:Math.max(cueStart,t.start),end:Math.min(cueEnd,t.end)}))
    .filter(t=>[t.start,t.end,t.x,t.y,t.width,t.height].every(Number.isFinite)&&t.end>t.start&&t.start<cueEnd&&t.width>0&&t.height>0)
    .sort((a,b)=>a.start-b.start||a.index-b.index).slice(0,120);
  if(!targets.length||time<targets[0].start)return null;
  const t=cueStart+Math.floor((time-cueStart)/tick+1e-7)*tick;
  const lerp=(a:number,b:number,p:number)=>a+(b-a)*p;
  const ease=(p:number)=>1-Math.pow(1-clamp(p,0,1),3);
  let current=targets[0];let origin={x:current.x,y:current.y,width:current.width,height:current.height};
  let start=current.start;
  const geometryAt=(at:number)=>{
    const p=duration<=0?1:ease((at-start)/duration);
    return {x:lerp(origin.x,current.x,p),y:lerp(origin.y,current.y,p),width:lerp(origin.width,current.width,p),height:lerp(origin.height,current.height,p)};
  };
  for(let i=1;i<targets.length&&targets[i].start<=t;i++){
    const next=targets[i];origin=geometryAt(next.start);current=next;start=next.start;
  }
  const geometry=geometryAt(t);
  const entryProgress=entry<=0?1:ease((t-targets[0].start)/entry);
  return {targetId:current.id,...geometry,scale:entryProgress,opacity:1,moving:duration>0&&t-start<duration};
}
