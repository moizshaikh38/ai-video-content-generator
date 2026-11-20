/** Legacy clip-wide Split must not join unrelated subject tracks from different
 * shots. This is a geometry/evidence guard, not speaker identity recognition. */
export function automaticSplitReviewPlan(track:any,cropConfig:any,duration:number):any[]|undefined {
 if(!['auto','genre_recommendation'].includes(cropConfig?.layout_mode_source)||
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
