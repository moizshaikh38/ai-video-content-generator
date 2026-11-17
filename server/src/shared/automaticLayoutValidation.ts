import {normalizeAutomaticLayoutPolicy} from './automaticLayoutPolicy.js';
/** Validate, never normalize or rewrite, the automatic-layout portion of a
 * crop config. Manual framing fields retain their existing validators. */
export function validateAutomaticLayoutCropConfig(value:unknown):void {
 if(value===undefined||value===null)return;
 const fail=(message:string,code:string)=>{throw Object.assign(Error(message),{statusCode:400,code})};
 if(typeof value!=='object'||Array.isArray(value))return fail('Invalid crop config','INVALID_CROP_CONFIG');
 const v=value as Record<string,unknown>;
 if(v.automaticLayoutCandidate!==undefined&&v.automaticLayoutCandidate!=='review-v1')fail('Invalid Auto Layout candidate','INVALID_AUTO_LAYOUT_CANDIDATE');
 if(v.layoutPolicy!==undefined)normalizeAutomaticLayoutPolicy(v.layoutPolicy);
}
