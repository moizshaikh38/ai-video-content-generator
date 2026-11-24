import type{ReframeSample}from'../types/index.js';
import{materializePanels,type ItemPanels,type PanelRect}from'./panelLayouts.js';
export interface BalancedSplitOptions {targetFaceHeight?:number;maximumZoom?:number}
const median=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
/** Presentation only, after the existing split eligibility decision. One fixed
 * view per shot: no per-frame zoom, role inference, new cuts or panel swaps.
 * Peripheral/body cropping is intentional; unseen context remains unknown. */
export function balancedSplitPanels(samples:ReframeSample[],start:number,end:number,sourceW:number,sourceH:number,divider:number,options:BalancedSplitOptions={}):ItemPanels|null{
 const target=options.targetFaceHeight??.30,maxZoom=options.maximumZoom??1.8;
 if(![start,end,sourceW,sourceH,divider,target,maxZoom].every(Number.isFinite)||end-start<.75||sourceW<=sourceH||sourceH<=0||divider<=.15||divider>=.85||target<.2||target>.4||maxZoom<1||maxZoom>2)return null;
 if(!Array.isArray(samples)||samples.some(s=>!s||!Array.isArray(s.faces)))return null;
 const rows=samples.filter(s=>s.time>=start&&s.time<end);if(rows.length<6||rows[0].time-start>.35||end-rows.at(-1)!.time>.35||rows.some((s,i)=>!Number.isFinite(s.time)||(i>0&&(s.time<=rows[i-1].time||s.time-rows[i-1].time>.35))||s.faces.length>2))return null;
 const pairs=rows.filter(s=>s.faces.length===2).map(s=>[...s.faces].sort((a,b)=>a.center_x-b.center_x));if(pairs.length<rows.length*.8)return null;
 const ids=pairs[0].map(f=>f.track_id);if(ids.some(id=>!id)||ids[0]===ids[1]||pairs.some(p=>p.some((f,i)=>f.track_id!==ids[i])))return null;
 const faces=ids.map(id=>rows.flatMap(s=>s.faces.filter(f=>f.track_id===id)));
 if(rows.some(s=>s.faces.some(f=>!ids.includes(f.track_id)))||faces.some(fs=>fs.some(f=>![f.x,f.y,f.width,f.height,f.center_x,f.center_y,f.confidence].every(Number.isFinite)||f.confidence<.8||f.confidence>1||f.center_x<f.x||f.center_x>f.x+f.width||f.center_y<f.y||f.center_y>f.y+f.height||f.width<=0||f.height<=0||f.x<0||f.y<0||f.x+f.width>1||f.y+f.height>1)))return null;
 const regions=[{left:0,right:divider},{left:divider,right:1}];const rects:PanelRect[]=[];
 for(let i=0;i<2;i++){
  const fs=faces[i],region=regions[i],fh=median(fs.map(f=>f.height));
  if(Math.max(...fs.map(f=>f.height))/Math.min(...fs.map(f=>f.height))>1.7)return null;
  const maxHeight=Math.min(1,(region.right-region.left)*sourceW/sourceH/(9/8));
  const minHeight=Math.max(1/maxZoom,Math.max(...fs.map(f=>f.y+f.height*1.9))-Math.min(...fs.map(f=>f.y-f.height*.35)));
  const h=Math.min(maxHeight,Math.max(minHeight,fh/target)),w=h*(9/8)*sourceH/sourceW;
  if(h<minHeight||w<=0||w>region.right-region.left+1e-8)return null;
  const xLo=Math.max(region.left,...fs.map(f=>f.x+f.width+.025-w)),xHi=Math.min(region.right-w,...fs.map(f=>f.x-.025));
  const yLo=Math.max(0,...fs.map(f=>f.y+f.height*1.9-h)),yHi=Math.min(1-h,...fs.map(f=>f.y-f.height*.35));
  if(xLo>xHi||yLo>yHi)return null;
  const x=Math.max(xLo,Math.min(xHi,median(fs.map(f=>f.center_x))-w/2)),y=Math.max(yLo,Math.min(yHi,median(fs.map(f=>f.center_y))-h*.37));
  rects.push({x,y,w,h});
 }
 const scales=faces.map((fs,i)=>median(fs.map(f=>f.height))/rects[i].h);if(Math.max(...scales)/Math.min(...scales)>1.4||scales.some(s=>s<.15||s>.42))return null;
 const panels:ItemPanels={layout:'split2',slots:rects.map(sourceRect=>({sourceRect,focusX:.5,focusY:.5,scale:1,set:true}))};
 // Integer geometry is the same contract consumed by export, preview/captions.
 for(const [width,height]of[[720,1280],[1080,1920],[1440,2560],[2160,3840]]){
  const g=materializePanels(panels,sourceW,sourceH,width,height);if(!g||g.panels.some((p,i)=>faces[i].some(f=>f.x*sourceW<p.view.x+2||f.y*sourceH<p.view.y+2||(f.x+f.width)*sourceW>p.view.x+p.view.w-2||(f.y+f.height)*sourceH>p.view.y+p.view.h-2)))return null;
 }
 return panels;
}
export function balanceExistingSplitPlan<T extends{start:number;end:number;split?:any}>(plan:T[]|undefined,samples:ReframeSample[],w:number,h:number,protectedRegions:any[]=[]):T[]|undefined{
 return plan?.map(shot=>{
  if(!shot.split||shot.split.focusPanels)return shot;
  const panels=balancedSplitPanels(samples,shot.start,shot.end,w,h,shot.split.dividerX);if(!panels)return shot;
  const views=materializePanels(panels,w,h,1080,1920)!.panels.map(p=>p.view);
  // Explicit measured protected context is never waived by aesthetic balance.
  if(protectedRegions.some(r=>r?.confidence>=.7&&r.start<shot.end&&r.end>shot.start&&(![r.x,r.y,r.width,r.height].every(Number.isFinite)||!views.some(v=>r.x*w>=v.x&&r.y*h>=v.y&&(r.x+r.width)*w<=v.x+v.w&&(r.y+r.height)*h<=v.y+v.h))))return shot;
  return {...shot,split:{...shot.split,focusPanels:panels}};
 });
}
