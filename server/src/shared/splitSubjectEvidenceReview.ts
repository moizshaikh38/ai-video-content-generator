import {reframeTrackFreshness} from './reframeTrackFreshness.js';

export type SplitEvidenceConflict='single-observed-subject'|'more-than-two-observed-subjects'|'invalid-subject-geometry'|'incompatible-pair-geometry'|'different-pair';
export interface SplitEvidenceReview {
 status:'unavailable'|'sampled-pair-consistent'|'sampled-conflict'|'insufficient-samples';
 sampleCount:number;pairSamples:number;dropoutSamples:number;conflictCount:number;
 conflicts:Array<{sampleIndex:number;time?:number;reason:SplitEvidenceConflict}>;
 /** Always sparse. Even a consistent pair is not interval or identity proof. */
 coverage:'sampled-only';manualLayoutChanged:false;
 reason:string;
}
/** Non-mutating manual-Split review. Caller supplies the hash independently
 * verified for the current source. No layout, caption, title or panel edits.
 * Sample times are clip-relative detector observations, not safe shot bounds. */
export function reviewSplitSubjectEvidence(clip:Parameters<typeof reframeTrackFreshness>[0],track:any,verifiedSourceSha256:string):SplitEvidenceReview {
 const result:SplitEvidenceReview={status:'unavailable',sampleCount:0,pairSamples:0,dropoutSamples:0,conflictCount:0,conflicts:[],coverage:'sampled-only',manualLayoutChanged:false,reason:'Current source-bound subject evidence is unavailable.'};
 if(!/^[a-f0-9]{64}$/.test(verifiedSourceSha256)||!track||track.status!=='ready'||track.isStale||track.sourceObjectVerified===false||reframeTrackFreshness(clip,track,verifiedSourceSha256).isStale)return result;
 const samples=track.raw_samples,duration=clip.end_seconds-(clip.trim_end_offset??0)-clip.start_seconds-(clip.trim_start_offset??0);
 if(!Array.isArray(samples)||!samples.length||samples.length>10000||!samples.every((s:any,i:number)=>Number.isFinite(s?.time)&&s.time>=0&&s.time<duration&&Array.isArray(s.faces)&&(i===0||s.time>samples[i-1].time)))return result;
 result.sampleCount=samples.length;let firstPair:string|undefined;
 const conflict=(sampleIndex:number,time:number,reason:SplitEvidenceConflict)=>{result.conflictCount++;if(result.conflicts.length<20)result.conflicts.push({sampleIndex,time,reason});};
 for(const [index,sample]of samples.entries()){
  const observed=sample.faces;
  if(!observed.length){result.dropoutSamples++;continue;}
  const faces=observed.filter((f:any)=>typeof f?.track_id==='string'&&f.track_id.length>0&&[f.center_x,f.center_y,f.width,f.height].every(Number.isFinite)&&f.width>0&&f.height>0&&f.width<=1&&f.height<=1&&f.center_x>=0&&f.center_x<=1&&f.center_y>=0&&f.center_y<=1&&f.width*f.height>=.001);
  if(faces.length!==observed.length){conflict(index,sample.time,'invalid-subject-geometry');continue;}
  if(faces.length===1){conflict(index,sample.time,'single-observed-subject');continue;}
  if(faces.length>2){conflict(index,sample.time,'more-than-two-observed-subjects');continue;}
  const [left,right]=[...faces].sort((a:any,b:any)=>a.center_x-b.center_x);
  if(left.track_id===right.track_id||left.center_x>.45||right.center_x<.55||right.center_x-left.center_x<.3){conflict(index,sample.time,'incompatible-pair-geometry');continue;}
  result.pairSamples++;
  const key=JSON.stringify([left.track_id,right.track_id]);
  if(firstPair!==undefined&&firstPair!==key)conflict(index,sample.time,'different-pair');
  firstPair??=key;
 }
 if(result.conflictCount)return {...result,status:'sampled-conflict',reason:'Sampled subject observations conflict with one clip-wide left/right pair. Manual Split is preserved; playback review is needed.'};
 if(result.sampleCount>=3&&result.pairSamples>=3&&result.pairSamples/result.sampleCount>=.8)return {...result,status:'sampled-pair-consistent',reason:'One left/right detector pair repeats in the samples. This does not verify unsampled frames, speaker identity, hands, source text or panel clearance.'};
 return {...result,status:'insufficient-samples',reason:'A repeated left/right pair is not established in the samples. Manual Split is preserved; missing detections do not prove an empty or safe panel.'};
}
