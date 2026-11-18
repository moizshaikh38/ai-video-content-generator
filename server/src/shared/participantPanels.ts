import type {ReframeSample} from '../types/index.js';
import {associatedBodyEnvelope} from './bodyContext.js';
import {PANEL_RECTS,type ItemPanels} from './panelLayouts.js';

export interface ParticipantPanelAssignment { panels:ItemPanels; trackIds:string[]; sampleCount:number; coobservedSamples:number; evidence:'face-body'|'face-window-review' }
const med=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
/** Shot-local visible participant assignment, not speaker identification.
 * A panel is assigned only to a distinct persistent face/body track. Missing,
 * back-facing, crossed or unstable tracks leave the scene in its shared view.
 * Whole measured person envelopes are contained, never duplicated as defaults.
 */
export function assignParticipantPanels(samples:ReframeSample[],sourceWidth:number,sourceHeight:number,options:{allowFaceWindowReview?:boolean}={}):ParticipantPanelAssignment|null {
 if(samples.length<6||!(sourceWidth>0&&sourceHeight>0))return null;
 const valid=(f:ReframeSample['faces'][number])=>!!f.track_id&&[f.x,f.y,f.width,f.height,f.center_x,f.center_y,f.confidence].every(Number.isFinite)&&f.confidence>=.7&&f.width*f.height>=.002&&f.x>=0&&f.y>=0&&f.x+f.width<=1.001&&f.y+f.height<=1.001;
 // Do not filter a weak extra detection into an apparently complete panel set.
 const rows=samples.filter(s=>s.faces.every(valid));
 const counts=new Map<string,number>();
 for(const s of rows)for(const id of new Set(s.faces.map(f=>f.track_id!)))counts.set(id,(counts.get(id)||0)+1);
 const ids=[...counts].filter(([,n])=>n>=samples.length*.8).map(([id])=>id);
 if(ids.length!==3&&ids.length!==4)return null;
 const together=rows.filter(s=>s.faces.length===ids.length&&new Set(s.faces.map(f=>f.track_id)).size===ids.length&&s.faces.every(f=>ids.includes(f.track_id!)));
 if(together.length<samples.length*.8)return null;
 // A persistent extra identity, even a smaller one, makes this count uncertain.
 if(rows.some(s=>s.faces.some(f=>!ids.includes(f.track_id!))))return null;
 const centers=new Map(ids.map(id=>[id,{x:med(together.map(s=>s.faces.find(f=>f.track_id===id)!.center_x)),y:med(together.map(s=>s.faces.find(f=>f.track_id===id)!.center_y))}]));
 // Deterministic spatial order, not a claim about which person is speaking.
 ids.sort((a,b)=>{const x=centers.get(a)!,y=centers.get(b)!;return Math.abs(x.y-y.y)>.15?x.y-y.y:x.x-y.x;});
 if(together.some(s=>s.faces.some(f=>{const c=centers.get(f.track_id!)!;return Math.hypot(f.center_x-c.x,f.center_y-c.y)>.12;})))return null;
 let envelopes=ids.map(id=>associatedBodyEnvelope(samples,[id]));
 const bodyComplete=envelopes.every(Boolean);
 if(!bodyComplete&&!options.allowFaceWindowReview)return null;
 if(!bodyComplete){
  const bounds=ids.map(id=>{const fs=samples.flatMap(s=>s.faces.filter(f=>f.track_id===id));return {left:Math.min(...fs.map(f=>f.x)),right:Math.max(...fs.map(f=>f.x+f.width)),top:Math.min(...fs.map(f=>f.y)),bottom:Math.max(...fs.map(f=>f.y+f.height))};});
  envelopes=bounds.map((b,i)=>{const w=b.right-b.left,h=b.bottom-b.top;const r={left:Math.max(0,b.left-w*.8),right:Math.min(1,b.right+w*.8),top:Math.max(0,b.top-h*.4),bottom:Math.min(1,b.bottom+h*1.2)};
   for(const o of bounds.filter((_,j)=>j!==i)){
    if(o.right<=b.left)r.left=Math.max(r.left,(o.right+b.left)/2);
    else if(o.left>=b.right)r.right=Math.min(r.right,(o.left+b.right)/2);
    else if(o.bottom<=b.top)r.top=Math.max(r.top,(o.bottom+b.top)/2);
    else if(o.top>=b.bottom)r.bottom=Math.min(r.bottom,(o.top+b.bottom)/2);
   }return r;});
 }
 // Unmatched people must not be erased merely because their face is unseen.
 for(const s of bodyComplete?samples:[]){
  const bodies=(s.persons||[]).filter(p=>p.confidence>=.4&&p.width>0&&p.height>0);
  if(bodies.length!==ids.length)return null;
  const owners=bodies.map(p=>s.faces.filter(f=>ids.includes(f.track_id!)&&f.center_x>=p.x&&f.center_x<=p.x+p.width&&f.center_y>=p.y&&f.center_y<=p.y+p.height*.55).map(f=>f.track_id));
  if(owners.some(o=>o.length!==1)||new Set(owners.flat()).size!==ids.length)return null;
 }
 const layout=ids.length===3?'three':'four';
 const slots=envelopes.map((e,i)=>{
  const b=e!;return {focusX:.5,focusY:.5,scale:1,fit:'contain' as const,set:true,
   sourceRect:{x:b.left,y:b.top,w:b.right-b.left,h:b.bottom-b.top}};
 });
 // No competing face fragments and no duplicated/overlapping body crops.
 if(envelopes.some((e,i)=>envelopes.some((b,j)=>i<j&&Math.min(e!.right,b!.right)>Math.max(e!.left,b!.left)&&Math.min(e!.bottom,b!.bottom)>Math.max(e!.top,b!.top))))return null;
 if(together.some(s=>slots.some((slot,i)=>s.faces.some(f=>f.track_id!==ids[i]&&f.x<slot.sourceRect.x+slot.sourceRect.w&&f.x+f.width>slot.sourceRect.x&&f.y<slot.sourceRect.y+slot.sourceRect.h&&f.y+f.height>slot.sourceRect.y))))return null;
 if(slots.length!==PANEL_RECTS[layout].length)return null;
 return {panels:{layout,slots},trackIds:ids,sampleCount:samples.length,coobservedSamples:together.length,evidence:bodyComplete?'face-body':'face-window-review'};
}
