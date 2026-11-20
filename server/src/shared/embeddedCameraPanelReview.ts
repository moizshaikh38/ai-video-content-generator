import {largestRectangleOutsideInset} from './insetExclusionGeometry.js';
import {normalizeSourceRect,type PanelRect,type ItemPanels} from './panelLayouts.js';
export interface InsetObservationReceipt {
 schema_version:number;source_sha256:string;source_start:number;source_end:number;duration_seconds:number;sample_clock:string;
 proposals:Array<{box:PanelRect;anchor_track_ids:string[];anchor_samples:number;observed_frames:number;sampled_frames:number;anchor_observations?:Array<{time:number;track_id:string}>;competing_face_samples?:number;face_sample_count?:number}>;
}
/** Original geometry-only review. Nearby alternative borders bound uncertainty;
 * their enclosure is NOT labelled a measured physical edge or a human identity.
 * Only an explicitly enabled local review may use this, never a normal default. */
export function embeddedCameraPanelReview(input:{receipt:InsetObservationReceipt;sha256:string;sourceStart:number;sourceEnd:number;sourceWidth:number;sourceHeight:number}):{panels:ItemPanels;enclosure:PanelRect;anchorTrackId:string;limitations:string[]}|null {
 const {receipt:r,sha256:sha,sourceStart:start,sourceEnd:end,sourceWidth:w,sourceHeight:h}=input;
 if(!r||![1,2].includes(r.schema_version)||!/^([a-f0-9]{64})$/.test(sha)||r.source_sha256!==sha||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||![r.source_start,r.source_end,r.duration_seconds].every(Number.isFinite)||r.sample_clock!=='interval-relative'||Math.abs(r.source_start-start)>.001||Math.abs(r.source_end-end)>.001||Math.abs(r.duration_seconds-(end-start))>.001)return null;
 if(!Array.isArray(r.proposals)||!r.proposals.length||r.proposals.length>8)return null;
 let anchor:string|undefined;const boxes:PanelRect[]=[];
 for(const p of r.proposals){
  const b=normalizeSourceRect(p?.box);
  if(!b||!Array.isArray(p.anchor_track_ids)||!p.anchor_track_ids.length||p.anchor_track_ids.length>4||p.anchor_track_ids.some(id=>typeof id!=='string'||!id)||new Set(p.anchor_track_ids).size!==p.anchor_track_ids.length||![p.anchor_samples,p.observed_frames,p.sampled_frames].every(Number.isInteger)||p.anchor_samples<6||p.sampled_frames<8||p.observed_frames>p.sampled_frames||p.observed_frames/p.sampled_frames<.85)return null;
  if(p.anchor_track_ids.length>1){
   // Multiple detector IDs do not establish one identity. A persistent source
   // region may still have exactly one observed occupant at each sample.
   const rows=p.anchor_observations;
   if(r.schema_version!==2||p.competing_face_samples!==0||!Number.isInteger(p.face_sample_count)||p.face_sample_count!<8||!Array.isArray(rows)||rows.length!==p.anchor_samples||rows.length<p.face_sample_count!*.25||rows.length>p.face_sample_count!||new Set(rows.map(v=>v.time)).size!==rows.length||rows.some(v=>!Number.isFinite(v.time)||v.time<0||v.time>=end-start||!p.anchor_track_ids.includes(v.track_id))||p.anchor_track_ids.some(id=>rows.filter(v=>v.track_id===id).length<2))return null;
  }
  const regionAnchor=[...p.anchor_track_ids].sort().join('|');
  if(anchor&&anchor!==regionAnchor)return null;anchor=regionAnchor;boxes.push(b);
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
 return{enclosure,anchorTrackId:anchor!,panels:{layout:'gameplay',topFraction,slots:[{set:true,focusX:.5,focusY:.5,scale:1,fit:'contain',sourceRect:enclosure},{set:true,focusX:.5,focusY:.5,scale:1,fit:'contain',sourceRect:main}]},limitations:['Explicit geometry review only. Nearby border alternatives are enclosed, not certified as one measured boundary.','Camera-like geometry is not real-person, active-speaker or gameplay proof. Detector IDs may refer to different occupants; no identity continuity is inferred.','Disjoint compiler-rounded source windows prevent duplicate region pixels, but exclude side context and can reduce content size.','No claim of between-sample camera-boundary completeness, HUD readability or automatic highlight quality.']};
}

/** Operational gate for extra local decoding; defaults never add work. */
export function embeddedCameraMeasurementEligible(input:{flag:unknown;sourceReceipt:unknown;layoutSource:unknown;aspect:unknown;duration:number;sceneCuts:unknown}):boolean{
 return input.flag==='1'&&!!input.sourceReceipt&&input.layoutSource==='auto'&&input.aspect==='9:16'&&Number.isFinite(input.duration)&&input.duration>0&&input.duration<=15&&Array.isArray(input.sceneCuts)&&input.sceneCuts.length===0;
}

/** Measure only an already inferred short portrait-Auto conversation split.
 * Repeated inset geometry can disprove that inference; it cannot choose roles.
 * This guard never extracts the inset or crops source context. */
export function embeddedSourceSplitMeasurementEligible(input:{sourceReceipt:unknown;layoutSource:unknown;cropMode:unknown;aspect:unknown;duration:number;sceneCuts:unknown;inferredLayout:unknown}):boolean {
 return input.cropMode==='smart'&&input.inferredLayout==='split'&&embeddedCameraMeasurementEligible({...input,flag:'1'});
}
export function embeddedSourceSplitVeto(track:any,cropConfig:any,duration:number):any[]|undefined {
 const m=track?.metadata;
 if(!Number.isFinite(duration)||duration<=0||m?.embedded_source_split_guard_enabled!==true||track.layout_mode!=='split'||cropConfig?.layout_mode_source!=='auto'||(cropConfig.mode&&cropConfig.mode!=='smart')||track.status!=='ready'||track.isStale||track.sourceObjectVerified!==true||!Array.isArray(m.scene_cuts)||m.scene_cuts.length||Math.abs(duration-(m.analyzed_source_end-m.analyzed_source_start))>.001)return undefined;
 if(!embeddedCameraPanelReview({receipt:m.embedded_camera_panel_review,sha256:m.analyzed_source_sha256,sourceStart:m.analyzed_source_start,sourceEnd:m.analyzed_source_end,sourceWidth:track.source_width,sourceHeight:track.source_height}))return undefined;
 return [{start:0,end:duration,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],presentationProtection:{preserveWindow:true,reason:'measured-context'},contextStatus:'unresolved-review-required',uncertainty:'Repeated inset-like source geometry conflicts with the inferred conversation split. Keep one unextracted source view. Source roles, readable UI and final composition remain unresolved; review before sharing.'}];
}
