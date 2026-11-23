import {canonicalPlanValue,type PreviewMeasuredPlanEnvelope} from './previewItemAutomaticPlan.js';
import {measuredPanelChoicesForManualPick,type MeasuredPanelChoice} from './measuredPanelChoice.js';
export interface NormalGamingManualEnvelope {
 version:1;basis:'current-normal-auto-plan';configurationKey:string;
 plan:PreviewMeasuredPlanEnvelope;
 contextStatus:'unresolved-review-required';uncertainty:string;
}
export const normalGamingConfigurationKey=(config:unknown):string=>JSON.stringify(canonicalPlanValue(config));
/** This option describes the current Auto item, not a counterfactual manual probe.
 * Reject local configuration changes and explicit scene/manual ownership. */
export function normalGamingManualChoices(item:any,envelope:NormalGamingManualEnvelope|null|undefined,current:Parameters<typeof measuredPanelChoicesForManualPick>[2]):MeasuredPanelChoice[]|undefined {
 if(!current.sourceVersion||current.sourceVersion!==envelope?.plan?.identity?.sourceVersion||!item||!envelope||envelope.version!==1||envelope.basis!=='current-normal-auto-plan'||envelope.contextStatus!=='unresolved-review-required'||typeof envelope.uncertainty!=='string'||!envelope.uncertainty||item.crop_config?.mode!=='smart'||item.crop_config.layout_mode_source!=='auto'||item.crop||item.panels||item.framing_window||item.tracker?.enabled||item.manual_source_crop||item.manual_placement)return;
 try{if(normalGamingConfigurationKey(item.crop_config)!==envelope.configurationKey)return;}catch{return;}
 const choices=measuredPanelChoicesForManualPick(item,envelope.plan,current)?.filter(c=>c.panels.layout==='gameplay'&&c.start<=item.source_start+1e-6&&c.end>=item.source_end-1e-6);
 return choices?.length===1?choices.map(c=>({...c,normalGaming:true as const,currentConfigKey:envelope.configurationKey,sourcePath:current.sourcePath,sourceAssetId:current.sourceAssetId,sourceVersion:current.sourceVersion,outputAspect:current.outputAspect})):undefined;
}
