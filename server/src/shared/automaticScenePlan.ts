import crypto from 'node:crypto';

/** A persisted existing normal baseline, not new scene or semantic evidence.
 * Cache consumers are restricted to explicitly analyzed 9:16 output; other
 * aspects retain their existing uncached path. No new narrowing is activated.
 * Unknown/review-required status and measured protection remain unchanged.
 * Planner revisions must bump this ID so old geometry cannot silently survive.
 */
export const AUTOMATIC_SCENE_PLANNER_VERSION = 'normal-auto-baseline-v2';
export interface AutomaticSceneSegment {
  start:number; end:number; kind:'group'|'solo'|'fit'; windowW:number; windowH:number;
  keyframes:Array<{time:number;centerX:number;centerY:number}>;
  [key:string]:unknown;
}
export interface AutomaticScenePlanSnapshot {
  version:1; plannerVersion:typeof AUTOMATIC_SCENE_PLANNER_VERSION;
  inputSha256:string; planSha256:string; segments:AutomaticSceneSegment[];
}
const digest=(value:unknown)=>crypto.createHash('sha256').update(stableJson(value)).digest('hex');
function stableJson(value:unknown):string {
  // Persisted inputs are JSON. Reject non-JSON values rather than hashing NaN
  // as null or allowing a class/toJSON method to select its own binding.
  const walk=(v:any):any=>{
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Non-finite plan input');return v;}
    if(Array.isArray(v))return v.map(walk);
    if(typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)throw Error('Non-JSON plan input');
    return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,walk(v[k])]));
  };
  return JSON.stringify(walk(value));
}
function normalInputs(track:any,config:any,duration:number):unknown|undefined {
  const m=track?.metadata;
  if(config?.layout_mode_source!=='auto'||(config.mode&&config.mode!=='smart')||track?.status!=='ready'||
     track.isStale||track.sourceObjectVerified!==true||track.analyzed_aspect_ratio!=='9:16'||(m?.source_scene_context&&track.sourceSceneContextVerified!==true)||m?.shot_composition_candidate===true||
     !/^[a-f0-9]{64}$/.test(m?.analyzed_source_sha256||'')||
     ![duration,track.source_width,track.source_height,m.analyzed_source_start,m.analyzed_source_end].every(Number.isFinite)||
     duration<=0||duration>7200||track.source_width<=0||track.source_height<=0||m.analyzed_source_start<0||
     Math.abs(m.analyzed_source_end-m.analyzed_source_start-duration)>.001||!Array.isArray(track.raw_samples)||!track.raw_samples.length)return;
  // Never persist/reuse an experimental plan as the normal product default.
  if(m.embedded_camera_panel_review_enabled===true||m.automatic_gaming_review_enabled===true||
     m.cut_local_split_recovery_review_enabled===true||m.participant_manual_review||m.participant_panels_review)return;
  const metadata={...m};delete metadata.automatic_scene_plan;
  // Bind the entire sampled evidence/metadata and output-relevant track state.
  // Database IDs/timestamps and current freshness flags are not planner inputs.
  return {duration,config,sourceWidth:track.source_width,sourceHeight:track.source_height,
    layoutMode:track.layout_mode??null,detectedFaceCount:track.detected_face_count??null,
    dominantTrackId:track.dominant_track_id??null,analysisVersion:track.analysis_version??null,
    trimStart:track.analyzed_trim_start??null,trimEnd:track.analyzed_trim_end??null,
    aspect:track.analyzed_aspect_ratio??null,samples:track.raw_samples,
    smoothedKeyframes:track.smoothed_keyframes??null,metadata};
}
function validSegments(value:unknown,duration:number):value is AutomaticSceneSegment[] {
  if(!Array.isArray(value)||!value.length||value.length>1000)return false;
  let previous=0,totalKeys=0;
  for(const s of value){
    if(!s||!['group','solo','fit'].includes(s.kind)||
       ![s.start,s.end,s.windowW,s.windowH].every(Number.isFinite)||Math.abs(s.start-previous)>.001||
       s.end<=s.start||s.end>duration+.001||s.windowW<=0||s.windowW>1||s.windowH<=0||s.windowH>1||
       !Array.isArray(s.keyframes)||!s.keyframes.length)return false;
    let prior=-Infinity;
    for(const k of s.keyframes){
      if(!k||![k.time,k.centerX,k.centerY].every(Number.isFinite)||k.time<s.start-.001||k.time>s.end+.001||
         k.time<prior||k.centerX<0||k.centerX>1||k.centerY<0||k.centerY>1)return false;
      prior=k.time;
    }
    if(s.contextStatus!==undefined&&!['crowd-preserved','unresolved-preserved','unresolved-review-required'].includes(s.contextStatus))return false;
    if(s.presentationProtection!==undefined&&(s.presentationProtection?.preserveWindow!==true||!['measured-context','measured-subject-conflict','persistent-face-conflict'].includes(s.presentationProtection.reason)))return false;
    if(s.split!==undefined){
      const split=s.split;
      if(!split||![split.speaker1X,split.speaker2X,split.dividerX].every((n:any)=>Number.isFinite(n)&&n>=0&&n<=1))return false;
      if(split.focusPanels!==undefined){
        const p=split.focusPanels,count=p?.layout==='three'?3:p?.layout==='four'?4:['split2','screenshare','gameplay','watch_party','streaming','game_screen_first'].includes(p?.layout)?2:0;
        if(!count||!Array.isArray(p.slots)||p.slots.length!==count||
           (p.topFraction!==undefined&&(!Number.isFinite(p.topFraction)||p.topFraction<.25||p.topFraction>.5)))return false;
        for(const slot of p.slots){
          if(!slot||![slot.focusX,slot.focusY].every((n:any)=>Number.isFinite(n)&&n>=0&&n<=1)||!Number.isFinite(slot.scale)||slot.scale<1||slot.scale>4)return false;
          if(slot.sourceRect!==undefined){const r=slot.sourceRect;if(!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>1.001||r.y+r.h>1.001)return false;}
        }
      }
    }
    totalKeys+=s.keyframes.length;if(totalKeys>10000)return false;previous=s.end;
  }
  return Math.abs(previous-duration)<=.001;
}
export function snapshotAutomaticScenePlan(track:any,config:any,duration:number,segments:unknown):AutomaticScenePlanSnapshot|undefined {
  try{
    const input=normalInputs(track,config,duration);if(!input||!validSegments(segments,duration))return;
    // Clone all fields, including split/panel geometry and uncertainty. There
    // is no normalization that could erase context protection or change crops.
    const copy=JSON.parse(stableJson(segments));
    return {version:1,plannerVersion:AUTOMATIC_SCENE_PLANNER_VERSION,inputSha256:digest(input),planSha256:digest(copy),segments:copy};
  }catch{return;}
}
export function readAutomaticScenePlan(track:any,config:any,duration:number):AutomaticSceneSegment[]|undefined {
  try{
    const stored=track?.metadata?.automatic_scene_plan as AutomaticScenePlanSnapshot;
    const input=normalInputs(track,config,duration);
    if(!input||!stored||stored.version!==1||stored.plannerVersion!==AUTOMATIC_SCENE_PLANNER_VERSION||
       !validSegments(stored.segments,duration)||stored.inputSha256!==digest(input)||stored.planSha256!==digest(stored.segments))return;
    return JSON.parse(stableJson(stored.segments));
  }catch{return;}
}
