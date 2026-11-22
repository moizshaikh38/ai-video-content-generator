export interface BareSmartSplitReview {
 sourcePath:string; sourceStart:number; sourceEnd:number; analyzedTrimStart:number; analyzedTrimEnd:number; analysisVersion:number; plan:any[]; explicitAutoPlan?:any[];
}

/** New legacy eligibility only. Never takes ownership of any manual channel. */
export function splitReviewItemCropConfig(item:any,sourcePath?:string,window?:{start:number;end:number}):any {
 const config=item?.crop_config;
 const bare=config?.mode==='smart'&&Object.keys(config).every(key=>key==='mode');
 if(bare&&(item?.crop||item?.panels||item?.framing_window!==undefined||item?.tracker?.enabled||item?.is_title_card||
   (sourcePath&&item?.source_path!==sourcePath)||
   (window&&(!Number.isFinite(item?.source_start)||!Number.isFinite(item?.source_end)||item.source_end<=item.source_start||item.source_start<window.start-1e-5||item.source_end>window.end+1e-5))))return {...config,layout_mode:'preserved_item_override'};
 return splitReviewCropConfig(config,item?.layout_mode);
}

/** A source-bound template, deliberately independent of the latest saved project.
 * Consumers resolve their own actual frozen/local item, never another revision. */
export function createBareSmartSplitReview(track:any,duration:number,resolvePlan:(track:any,config:any,duration:number)=>any[]|undefined=automaticSplitReviewPlan):BareSmartSplitReview|null {
 if(track?.sourceObjectVerified!==true||track?.isStale!==false||track?.status!=='ready'||typeof track?.metadata?.analyzed_source_path!=='string'||!Number.isFinite(track?.analysis_version))return null;
 const start=track.analyzed_trim_start,end=track.analyzed_trim_end;
 const sourceStart=track.metadata.analyzed_source_start,sourceEnd=track.metadata.analyzed_source_end;
 const span=sourceEnd-sourceStart;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<0||!Number.isFinite(sourceStart)||!Number.isFinite(sourceEnd)||sourceStart<0||!Number.isFinite(track.metadata.clip_duration)||!(span>0)||!Number.isFinite(duration)||Math.abs(duration-span)>.001||Math.abs(Number(track.metadata.clip_duration)-span)>.001)return null;
 // Eligibility is the narrow new guard, but use the SAME existing service
 // resolver as picture/captions, including explicitly enabled review refinements.
 if(!automaticSplitReviewPlan(track,{mode:'smart'},span))return null;
 const plan=resolvePlan(track,{mode:'smart'},span);
 if(!Array.isArray(plan)||!plan.length)return null;
 const explicitAutoPlan=resolvePlan(track,{mode:'smart',layout_mode_source:'auto'},span);
 return {sourcePath:track.metadata.analyzed_source_path,sourceStart,sourceEnd,analyzedTrimStart:start,analyzedTrimEnd:end,analysisVersion:track.analysis_version,plan,...(Array.isArray(explicitAutoPlan)&&explicitAutoPlan.length?{explicitAutoPlan}:{})};
}

/** Plan clock is relative to compositionClipStart, exactly like shotComposition.
 * Call with the resolved scene item so explicit scene overrides retain priority. */
export function bareSmartSplitReviewForItem(item:any,review:BareSmartSplitReview|null|undefined,compositionClipStart:number):any[]|undefined {
 if(!review||!Number.isFinite(compositionClipStart)||Math.abs(compositionClipStart-review.sourceStart)>1e-5)return undefined;
 const cfg=splitReviewItemCropConfig(item,review.sourcePath,{start:compositionClipStart,end:review.sourceEnd});
 const explicitAuto=cfg?.mode==='smart'&&cfg.layout_mode_source==='auto'&&Object.keys(cfg).every(key=>key==='mode'||key==='layout_mode_source');
 const bare=cfg?.mode==='smart'&&Object.keys(cfg).every(key=>key==='mode');
 if(!bare&&!explicitAuto)return undefined;
 const start=Number(item?.source_start),end=Number(item?.source_end);
 const duration=review.sourceEnd-review.sourceStart;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start<compositionClipStart-1e-5||end>compositionClipStart+duration+1e-5)return undefined;
 if(explicitAuto){
  // Reuse the service's separately resolved explicit-Auto plan, never relabel
  // the bare plan. Local Auto changes do not invalidate a source-only key.
  if(item?.source_path!==review.sourcePath||item?.crop||item?.panels||item?.framing_window!==undefined||item?.tracker?.enabled||item?.is_title_card||(typeof item?.layout_mode==='string'&&item.layout_mode!=='track'))return undefined;
  return Array.isArray(review.explicitAutoPlan)&&review.explicitAutoPlan.length?review.explicitAutoPlan:undefined;
 }
 return review.plan;
}

/** Measured automatic Split must not join unrelated subject tracks from different
 * shots. Explicit user and legacy layout choices stay authoritative. */
export function splitReviewCropConfig(cropConfig:any,itemLayoutMode?:unknown):any {
 const bareSmart=cropConfig?.mode==='smart'&&Object.keys(cropConfig).every(key=>key==='mode');
 // Old editor items may own a layout outside crop_config. Pass that existing
 // choice into the review guard without changing persisted settings.
 return bareSmart&&typeof itemLayoutMode==='string'&&itemLayoutMode!=='track'
  ? {...cropConfig,layout_mode:itemLayoutMode}:cropConfig;
}

export function automaticSplitReviewPlan(track:any,cropConfig:any,duration:number):any[]|undefined {
 const automaticProvenance=['auto','genre_recommendation'].includes(cropConfig?.layout_mode_source);
 // Old bare-smart records request measurement, but contain no chosen layout.
 // Only the exact unowned shape is eligible: never infer ownership from an
 // explicitly marked legacy/user record or replace crop/panel overrides.
 const bareSmart=cropConfig?.mode==='smart'&&Object.keys(cropConfig).every(key=>key==='mode');
 if((!automaticProvenance&&!bareSmart)||
    track?.layout_mode!=='split'||track?.metadata?.shot_composition_candidate===true||!(duration>0))return undefined;
 const samples=Array.isArray(track.raw_samples)?track.raw_samples:[];
 const pairs=new Map<string,number>();
 let conflictingSubjectEvidence=false;
 for(const sample of samples){
  const observed=Array.isArray(sample?.faces)?sample.faces:[];
  const faces=observed.filter((f:any)=>f.track_id&&[f.center_x,f.center_y,f.width,f.height].every(Number.isFinite)&&f.width*f.height>=.001);
  // Empty samples may be detector dropouts. A positively observed solo,
  // crowd or incompatible pair is not absence and cannot be outvoted by a
  // clip-wide majority. Keep the existing full-source review fallback.
  if(!observed.length)continue;
  if(faces.length!==2){conflictingSubjectEvidence=true;continue;}
  const [left,right]=[...faces].sort((a:any,b:any)=>a.center_x-b.center_x);
  if(left.track_id===right.track_id||left.center_x>.45||right.center_x<.55||right.center_x-left.center_x<.3){conflictingSubjectEvidence=true;continue;}
  const key=JSON.stringify([left.track_id,right.track_id]);pairs.set(key,(pairs.get(key)||0)+1);
 }
 const best=Math.max(0,...pairs.values());
 if(!conflictingSubjectEvidence&&pairs.size===1&&samples.length>=3&&best>=3&&best/samples.length>=.8)return undefined;
 return [{start:0,end:duration,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],
  contextStatus:'unresolved-review-required',uncertainty:'Full-source Fit: one repeated concurrent left/right subject pair does not cover this clip. Review before sharing.',
  presentationProtection:{preserveWindow:true,reason:'persistent-face-conflict'}}];
}
