import {candidateCompositionOptions} from './automaticLayoutCandidate.js';
import {validAutomaticPlanIdentity,validAutomaticShotPlan,type AutomaticPlanIdentity,type AutomaticShotPlan,type ItemAutomaticPlanResult} from './itemAutomaticPlan.js';
export function canonicalPlanValue(value:any):any {
 if(Array.isArray(value))return value.map(canonicalPlanValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonicalPlanValue(value[k])]));
 return value;
}
export function itemPlanConfigurationKey(candidate:unknown,layoutPolicy:unknown):string {
 return JSON.stringify(canonicalPlanValue({candidate:candidateCompositionOptions(candidate),layoutPolicy:layoutPolicy??undefined}));
}
export interface PreviewMeasuredPlanEnvelope {
 schemaVersion:1;
 sourceValidation:'object-receipt-verified';
 geometryEvidence:'recorded-decoded-geometry-bound-to-verified-source';
 identity:AutomaticPlanIdentity;
 sourcePath:string;
 configurationKey:string;
 shots:AutomaticShotPlan;
}
/** A server-computed full-analysis plan can describe a contained effective
 * item only when all per-item compute inputs match. Do not attach identity to
 * a free-standing array: keep its envelope and original parent identity. */
export function resolvePreviewItemPlan(item:any,envelope:PreviewMeasuredPlanEnvelope|null|undefined,current:{sourceAssetId:string;sourcePath:string;outputAspect:string;layoutPolicy?:unknown;sourceVersion?:string}):ItemAutomaticPlanResult {
 if(item?.crop||item?.panels||item?.framing_window||item?.tracker?.enabled||item?.crop_config?.layout_mode_source==='user')return {status:'bypassed',reason:'manual-framing-precedence'};
 if(!item||!envelope||envelope.schemaVersion!==1||envelope.sourceValidation!=='object-receipt-verified'||envelope.geometryEvidence!=='recorded-decoded-geometry-bound-to-verified-source'||!validAutomaticPlanIdentity(envelope.identity))return {status:'unavailable',reason:'preview-source-plan-unverified'};
 const parent=envelope.identity;
 if(!/^[a-f0-9]{64}$/.test(parent.sourceVersion)||!/^[a-f0-9]{64}$/.test(parent.configurationFingerprint)||(current.sourceVersion&&current.sourceVersion!==parent.sourceVersion))return {status:'unavailable',reason:'preview-source-version-mismatch'};
 if(parent.sourceAssetId!==current.sourceAssetId||envelope.sourcePath!==current.sourcePath||(item.source_asset_id&&item.source_asset_id!==current.sourceAssetId)||(item.source_path&&item.source_path!==current.sourcePath))return {status:'unavailable',reason:'preview-item-source-mismatch'};
 if(parent.outputAspect!==current.outputAspect)return {status:'unavailable',reason:'preview-output-aspect-mismatch'};
 if(envelope.configurationKey!==itemPlanConfigurationKey(item.crop_config?.automaticLayoutCandidate,item.crop_config?.layoutPolicy||current.layoutPolicy))return {status:'unavailable',reason:'preview-scene-configuration-changed'};
 const identity={...parent,itemId:item.id,sourceStart:item.source_start,sourceEnd:item.source_end};
 if(!validAutomaticPlanIdentity(identity)||!validAutomaticShotPlan(envelope.shots,parent.analysisDuration??(parent.analysisSourceEnd-parent.analysisSourceStart)))return {status:'unavailable',reason:'preview-scene-range-or-geometry-invalid'};
 return {status:'ready',identity,shots:structuredClone(envelope.shots)};
}
