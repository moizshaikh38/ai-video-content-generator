import {largestRectangleOutsideInset} from './insetExclusionGeometry.js';
import {normalizeSourceRect,type PanelRect,type ItemPanels} from './panelLayouts.js';
export interface InsetObservationReceipt {
 schema_version:number;source_sha256:string;source_start:number;source_end:number;duration_seconds:number;sample_clock:string;
 proposals:Array<{box:PanelRect;anchor_track_ids:string[];anchor_samples:number;observed_frames:number;sampled_frames:number}>;
}
/** Original geometry-only review. Nearby alternative borders bound uncertainty;
 * their enclosure is NOT labelled a measured physical edge or a human identity.
 * Only an explicitly enabled local review may use this, never a normal default. */
export function embeddedCameraPanelReview(input:{receipt:InsetObservationReceipt;sha256:string;sourceStart:number;sourceEnd:number;sourceWidth:number;sourceHeight:number}):{panels:ItemPanels;enclosure:PanelRect;anchorTrackId:string;limitations:string[]}|null {
 const {receipt:r,sha256:sha,sourceStart:start,sourceEnd:end,sourceWidth:w,sourceHeight:h}=input;
 if(!r||r.schema_version!==1||!/^([a-f0-9]{64})$/.test(sha)||r.source_sha256!==sha||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||![r.source_start,r.source_end,r.duration_seconds].every(Number.isFinite)||r.sample_clock!=='interval-relative'||Math.abs(r.source_start-start)>.001||Math.abs(r.source_end-end)>.001||Math.abs(r.duration_seconds-(end-start))>.001)return null;
 if(!Array.isArray(r.proposals)||!r.proposals.length||r.proposals.length>8)return null;
 let anchor:string|undefined;const boxes:PanelRect[]=[];
 for(const p of r.proposals){
  const b=normalizeSourceRect(p?.box);
  if(!b||!Array.isArray(p.anchor_track_ids)||p.anchor_track_ids.length!==1||typeof p.anchor_track_ids[0]!=='string'||!p.anchor_track_ids[0]||![p.anchor_samples,p.observed_frames,p.sampled_frames].every(Number.isInteger)||p.anchor_samples<6||p.sampled_frames<8||p.observed_frames>p.sampled_frames||p.observed_frames/p.sampled_frames<.85)return null;
  if(anchor&&anchor!==p.anchor_track_ids[0])return null;anchor=p.anchor_track_ids[0];boxes.push(b);
 }
 // Alternative edge hypotheses must refer to substantially the same rectangle.
 // Distant, disjoint or competing anchored regions remain unresolved.
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j],area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  if(area/(a.w*a.h+b.w*b.h-area)<.85)return null;
 }
 const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
 const enclosure={x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
 if(enclosure.w*enclosure.h>.2)return null;
 const main=largestRectangleOutsideInset(enclosure,w,h);if(!main||main.w*main.h<.5)return null;
 const topFraction=(9/16)/(enclosure.w*w/(enclosure.h*h));if(!Number.isFinite(topFraction)||topFraction<.25||topFraction>.5)return null;
 return{enclosure,anchorTrackId:anchor!,panels:{layout:'gameplay',topFraction,slots:[{set:true,focusX:.5,focusY:.5,scale:1,fit:'contain',sourceRect:enclosure},{set:true,focusX:.5,focusY:.5,scale:1,fit:'contain',sourceRect:main}]},limitations:['Explicit geometry review only. Nearby border alternatives are enclosed, not certified as one measured boundary.','Camera-like geometry is not real-person, active-speaker or gameplay proof.','Disjoint compiler-rounded source windows prevent duplicate region pixels, but exclude side context and can reduce content size.','No claim of between-sample camera-boundary completeness, HUD readability or automatic highlight quality.']};
}
