import {panelSourceWindow,type ItemPanels} from './panelLayouts.js';
/** Explicit review only. Reuses the measured disjoint source regions. Fills
 * both target panels only when repeated observed face boxes fit the proposed
 * crop; this does not identify speakers or certify unmeasured side context. */
export function compactEmbeddedReviewPanels(panels:ItemPanels,samples:any[],w:number,h:number):ItemPanels|null {
 if(panels.layout!=='gameplay'||![w,h].every(v=>Number.isFinite(v)&&v>0)||!samples?.length)return null;
 const topFraction=panels.topFraction;
 if(typeof topFraction!=='number'||!Number.isFinite(topFraction)||topFraction<.25||topFraction>.5)return null;
 const slots=panels.slots.map((slot,index)=>{
  const r=slot.sourceRect;if(!r)return null;
  // The inset stays whole. Face boxes do not bound hair, hands or shoulders.
  if(index===0)return {...slot,fit:'contain' as const};
  const counts=new Map<string,number>();
  const valid=(f:any)=>typeof f?.track_id==='string'&&[f.x,f.y,f.width,f.height,f.confidence].every(Number.isFinite)&&f.confidence>=.7&&f.width>0&&f.height>0&&f.x>=r.x&&f.y>=r.y&&f.x+f.width<=r.x+r.w&&f.y+f.height<=r.y+r.h;
  for(const row of samples)for(const id of new Set((row.faces||[]).filter(valid).map((f:any)=>f.track_id)))counts.set(id as string,(counts.get(id as string)||0)+1);
  const faces=samples.flatMap(row=>(row.faces||[]).filter((f:any)=>valid(f)&&(counts.get(f.track_id)||0)>=3));if(faces.length<6)return null;
  const left=Math.min(...faces.map(f=>f.x)),right=Math.max(...faces.map(f=>f.x+f.width)),top=Math.min(...faces.map(f=>f.y)),bottom=Math.max(...faces.map(f=>f.y+f.height));
  const aspect=(9/16)/(index===0?topFraction:1-topFraction),base=panelSourceWindow({...slot,fit:undefined,scale:1,focusX:0,focusY:0},w,h,aspect);
  const desiredX=((left+right)/2)*w-base.w/2,desiredY=((top+bottom)/2)*h-base.h/2;
  const rw=panelSourceWindow({...slot,fit:'contain'},w,h,aspect);
  const focusX=rw.w<=base.w?0:Math.max(0,Math.min(1,(desiredX-rw.x)/(rw.w-base.w))),focusY=rw.h<=base.h?0:Math.max(0,Math.min(1,(desiredY-rw.y)/(rw.h-base.h)));
  const next={...slot,fit:undefined,scale:1,focusX,focusY};const shown=panelSourceWindow(next,w,h,aspect);
  // Two source pixels of margin also bound compiler rounding differences.
  if(left*w<shown.x+2||right*w>shown.x+shown.w-2||top*h<shown.y+2||bottom*h>shown.y+shown.h-2)return null;
  return next;
 });
 if(slots.some(s=>!s))return null;
 return {layout:'gameplay',topFraction,slots:slots as ItemPanels['slots']};
}
