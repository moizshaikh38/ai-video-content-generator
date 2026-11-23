import {sourceObjectReceiptMatches} from '../shared/sourceObjectReceipt.js';
import {normalGamingScenePlan} from '../shared/normalGamingScenePlan.js';
import {snapshotAutomaticScenePlan} from '../shared/automaticScenePlan.js';
import {itemPlanConfigurationKey} from '../shared/previewItemAutomaticPlan.js';
import {normalGamingConfigurationKey,type NormalGamingManualEnvelope} from '../shared/normalGamingManualChoice.js';
import {validAutomaticPlanIdentity,validAutomaticShotPlan} from '../shared/itemAutomaticPlan.js';
/** Read-only reuse of the current normal producer result. No model invocation,
 * forced Auto config, experimental planner or retained-window stale exemption. */
export function normalGamingManualEnvelope(clip:any,track:any):NormalGamingManualEnvelope|null {
 const m=track?.metadata,config=clip?.crop_config,receipt=clip?.selection_source_receipt?.source_receipt;
 if(track?.status!=='ready'||track.isStale!==false||track.sourceObjectVerified!==true||track.clip_id!==clip?.id||!receipt||receipt.sha256!==m?.analyzed_source_sha256||receipt.key!==clip.source_storage_path||m.analyzed_source_path!==clip.source_storage_path)return null;
 if(!sourceObjectReceiptMatches(receipt,clip.source_storage_path,{size:m.analyzed_source_receipt?.size,etag:m.analyzed_source_receipt?.etag},m.analyzed_source_sha256))return null;
 const trimStart=clip.trim_start_offset??0,trimEnd=clip.trim_end_offset??0;
 if(![clip.start_seconds,clip.end_seconds,trimStart,trimEnd].every(v=>typeof v==='number'&&Number.isFinite(v))||trimStart<0||trimEnd<0)return null;
 const start=clip.start_seconds+trimStart,end=clip.end_seconds-trimEnd,duration=m.clip_duration;
 if(Math.abs(start-m.analyzed_source_start)>.001||Math.abs(end-m.analyzed_source_end)>.001||!Number.isFinite(duration)||Math.abs(end-start-duration)>.000500001)return null;
 const shots=normalGamingScenePlan(track,config,duration,clip.aspect_ratio);
 if(!shots||shots.length!==1||shots[0].start!==0||shots[0].end!==duration||shots[0].split.focusPanels.layout!=='gameplay'||!validAutomaticShotPlan(shots,duration))return null;
 const snapshot=snapshotAutomaticScenePlan(track,config,duration,shots);if(!snapshot)return null;
 const identity={schemaVersion:1 as const,itemId:clip.id,sourceAssetId:clip.id,sourceVersion:m.analyzed_source_sha256,analysisVersion:track.analysis_version,sourceStart:start,sourceEnd:end,analysisSourceStart:m.analyzed_source_start,analysisSourceEnd:m.analyzed_source_end,analysisDuration:duration,sourceWidth:track.source_width,sourceHeight:track.source_height,outputAspect:clip.aspect_ratio,configurationFingerprint:snapshot.inputSha256};
 if(!validAutomaticPlanIdentity(identity))return null;
 return {version:1,basis:'current-normal-auto-plan',configurationKey:normalGamingConfigurationKey(config),contextStatus:shots[0].contextStatus,uncertainty:shots[0].uncertainty,plan:{schemaVersion:1,sourceValidation:'object-receipt-verified',geometryEvidence:'recorded-decoded-geometry-bound-to-verified-source',identity,sourcePath:clip.source_storage_path,configurationKey:itemPlanConfigurationKey(config.automaticLayoutCandidate,config.layoutPolicy),shots:structuredClone(shots)}};
}
