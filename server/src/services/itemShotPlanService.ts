import{expandedThreeManualReview}from'../shared/expandedThreeManualReview.js';import{persistentObjectRegions}from'../shared/objectContext.js';
import {canonicalPlanValue,type PreviewMeasuredPlanEnvelope} from '../shared/previewItemAutomaticPlan.js';
import crypto from 'node:crypto';
import {shotPlanOptions} from '../shared/shotPlanOptions.js';
import {resolveItemAutomaticPlan,MAX_ANALYSIS_DURATION_ROUNDING_SECONDS,validAutomaticPlanIdentity,validAutomaticShotPlan,type ItemAutomaticPlanResult,type AutomaticShotPlan} from '../shared/itemAutomaticPlan.js';
import type {ShotCompositionOptions} from './smartReframeService.js';

/** Render-only binding. The actual input digest comes from the caller's file
 * measurement, never from the saved analysis or the item being checked. */
export interface MeasuredItemPlanContext {
  track:any;
  sourceSha256?:string;
  sourceStoragePath?:string|null;
  sourceAssetId?:string;
  clipStartSec:number;
  aspectRatio:string;
  decodedSource?:{width:number;height:number}|null;
  cropConfig?:any;
}
/** Includes every actual compute option, including measured samples/cuts and
 * current per-scene configuration. Key order alone cannot change identity. */
export function measuredPlanConfigurationFingerprint(options:ShotCompositionOptions):string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPlanValue({resolver:'measured-item-plan-v1',options}))).digest('hex');
}
export function resolveMeasuredItemPlan(item:any,ctx:MeasuredItemPlanContext,compute:(options:ShotCompositionOptions)=>AutomaticShotPlan):ItemAutomaticPlanResult {
  if(item.crop||item.panels||item.framing_window||item.tracker?.enabled||item.crop_config?.layout_mode_source==='user')return {status:'bypassed',reason:'manual-framing-precedence'};
  const t=ctx.track,m=t?.metadata||{};
  if(!t||t.status!=='ready'||t.isStale||!ctx.sourceSha256||!/^[a-f0-9]{64}$/.test(ctx.sourceSha256)||m.analyzed_source_sha256!==ctx.sourceSha256)return {status:'unavailable',reason:'source-bytes-stale-or-unverified'};
  if(!ctx.sourceStoragePath||m.analyzed_source_path!==ctx.sourceStoragePath||(item.source_path&&item.source_path!==ctx.sourceStoragePath)||!ctx.sourceAssetId||t.clip_id!==ctx.sourceAssetId||(item.source_asset_id&&item.source_asset_id!==ctx.sourceAssetId))return {status:'unavailable',reason:'source-path-or-asset-mismatch'};
  if(t.analyzed_aspect_ratio!==ctx.aspectRatio||m.analyzed_source_start!==ctx.clipStartSec||!Number.isFinite(m.analyzed_source_end)||Math.abs(m.analyzed_source_end-m.analyzed_source_start-m.clip_duration)>MAX_ANALYSIS_DURATION_ROUNDING_SECONDS)return {status:'unavailable',reason:'analysis-range-or-aspect-mismatch'};
  if(!ctx.decodedSource||ctx.decodedSource.width!==t.source_width||ctx.decodedSource.height!==t.source_height)return {status:'unavailable',reason:'decoded-source-geometry-unverified'};
  const options=shotPlanOptions({track:t,candidate:item.crop_config?.automaticLayoutCandidate,layoutPolicy:item.crop_config?.layoutPolicy||ctx.cropConfig?.layoutPolicy,duration:m.clip_duration});
  const identity={schemaVersion:1 as const,itemId:item.id,sourceAssetId:ctx.sourceAssetId,sourceVersion:ctx.sourceSha256,analysisVersion:t.analysis_version,sourceStart:item.source_start,sourceEnd:item.source_end,analysisSourceStart:m.analyzed_source_start,analysisSourceEnd:m.analyzed_source_end,analysisDuration:m.clip_duration,sourceWidth:t.source_width,sourceHeight:t.source_height,outputAspect:ctx.aspectRatio,configurationFingerprint:measuredPlanConfigurationFingerprint(options)};
  return resolveItemAutomaticPlan({item,identity,analysisFresh:true,options},compute);
}

/** Preview does not re-download/encode. Current object receipt verification
 * binds the recorded decoded dimensions and analysis to unchanged bytes.
 * This is explicitly different provenance from export's fresh file probe. */
export function createPreviewMeasuredEnvelope(clip:any,track:any,options:ShotCompositionOptions,compute:(options:ShotCompositionOptions)=>AutomaticShotPlan,retainedWindowVerified=false):PreviewMeasuredPlanEnvelope|null {
 const m=track?.metadata||{};
 if(!clip||track?.status!=='ready'||track.sourceObjectVerified!==true||(track.isStale&&!retainedWindowVerified)||track.clip_id!==clip.id||m.analyzed_source_path!==clip.source_storage_path||!/^[a-f0-9]{64}$/.test(m.analyzed_source_sha256||''))return null;
 const identity={schemaVersion:1 as const,itemId:clip.id,sourceAssetId:clip.id,sourceVersion:m.analyzed_source_sha256,analysisVersion:track.analysis_version,sourceStart:m.analyzed_source_start,sourceEnd:m.analyzed_source_end,analysisSourceStart:m.analyzed_source_start,analysisSourceEnd:m.analyzed_source_end,analysisDuration:m.clip_duration,sourceWidth:track.source_width,sourceHeight:track.source_height,outputAspect:clip.aspect_ratio||'9:16',configurationFingerprint:measuredPlanConfigurationFingerprint(options)};
 if(track.analyzed_aspect_ratio!==identity.outputAspect||!validAutomaticPlanIdentity(identity)||options.duration!==identity.analysisDuration||options.sourceWidth!==identity.sourceWidth||options.sourceHeight!==identity.sourceHeight)return null;
 const shots=compute(options);
 if(measuredPlanConfigurationFingerprint(options)!==identity.configurationFingerprint||!validAutomaticShotPlan(shots,options.duration))return null;
 const manualParticipantReview=m.participant_manual_review==='expanded-three-v1'&&identity.outputAspect==='9:16'&&options.allowConversationSplit&&options.windowScope==='shot'&&(!options.layoutPolicy||options.layoutPolicy.allowed.includes('split'))?shots.flatMap(shot=>{const local=(options.rawSamples||[]).filter(s=>s.time>=shot.start&&s.time<shot.end);if(shot.end-shot.start<1.5||persistentObjectRegions(local).length||(options.protectedContentRegions||[]).some(r=>r.confidence>=.7&&r.start<shot.end&&r.end>shot.start))return[];const panels=expandedThreeManualReview(local,identity.sourceWidth,identity.sourceHeight);return panels?[{start:shot.start,end:shot.end,panels}]:[]}):undefined;
 return {manualParticipantReview,schemaVersion:1,sourceValidation:'object-receipt-verified',geometryEvidence:'recorded-decoded-geometry-bound-to-verified-source',identity,sourcePath:clip.source_storage_path,configurationKey:JSON.stringify(canonicalPlanValue({candidate:{...(options.pairFocusReview!==undefined?{pairFocusReview:options.pairFocusReview}:{}),...(options.bodyOnlyPortraitReview!==undefined?{bodyOnlyPortraitReview:options.bodyOnlyPortraitReview}:{})},layoutPolicy:options.layoutPolicy})),shots:structuredClone(shots)};
}
