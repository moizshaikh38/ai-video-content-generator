import crypto from 'node:crypto';
import {shotPlanOptions} from '../shared/shotPlanOptions.js';
import {resolveItemAutomaticPlan,type ItemAutomaticPlanResult,type AutomaticShotPlan} from '../shared/itemAutomaticPlan.js';
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
function canonical(value:any):any {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
  return value;
}
/** Includes every actual compute option, including measured samples/cuts and
 * current per-scene configuration. Key order alone cannot change identity. */
export function measuredPlanConfigurationFingerprint(options:ShotCompositionOptions):string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical({resolver:'measured-item-plan-v1',options}))).digest('hex');
}
export function resolveMeasuredItemPlan(item:any,ctx:MeasuredItemPlanContext,compute:(options:ShotCompositionOptions)=>AutomaticShotPlan):ItemAutomaticPlanResult {
  if(item.crop||item.panels||item.framing_window||item.tracker?.enabled||item.crop_config?.layout_mode_source==='user')return {status:'bypassed',reason:'manual-framing-precedence'};
  const t=ctx.track,m=t?.metadata||{};
  if(!t||t.status!=='ready'||t.isStale||!ctx.sourceSha256||!/^[a-f0-9]{64}$/.test(ctx.sourceSha256)||m.analyzed_source_sha256!==ctx.sourceSha256)return {status:'unavailable',reason:'source-bytes-stale-or-unverified'};
  if(!ctx.sourceStoragePath||m.analyzed_source_path!==ctx.sourceStoragePath||(item.source_path&&item.source_path!==ctx.sourceStoragePath)||!ctx.sourceAssetId||t.clip_id!==ctx.sourceAssetId||(item.source_asset_id&&item.source_asset_id!==ctx.sourceAssetId))return {status:'unavailable',reason:'source-path-or-asset-mismatch'};
  if(t.analyzed_aspect_ratio!==ctx.aspectRatio||m.analyzed_source_start!==ctx.clipStartSec||!Number.isFinite(m.analyzed_source_end)||Math.abs(m.analyzed_source_end-m.analyzed_source_start-m.clip_duration)>1e-6)return {status:'unavailable',reason:'analysis-range-or-aspect-mismatch'};
  if(!ctx.decodedSource||ctx.decodedSource.width!==t.source_width||ctx.decodedSource.height!==t.source_height)return {status:'unavailable',reason:'decoded-source-geometry-unverified'};
  const options=shotPlanOptions({track:t,candidate:item.crop_config?.automaticLayoutCandidate,layoutPolicy:item.crop_config?.layoutPolicy||ctx.cropConfig?.layoutPolicy,duration:m.clip_duration});
  const identity={schemaVersion:1 as const,itemId:item.id,sourceAssetId:ctx.sourceAssetId,sourceVersion:ctx.sourceSha256,analysisVersion:t.analysis_version,sourceStart:item.source_start,sourceEnd:item.source_end,analysisSourceStart:m.analyzed_source_start,analysisSourceEnd:m.analyzed_source_end,sourceWidth:t.source_width,sourceHeight:t.source_height,outputAspect:ctx.aspectRatio,configurationFingerprint:measuredPlanConfigurationFingerprint(options)};
  return resolveItemAutomaticPlan({item,identity,analysisFresh:true,options},compute);
}
