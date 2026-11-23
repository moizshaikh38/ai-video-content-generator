import {AppError} from '../types/index.js';
/** Preserve the existing locked winner. Otherwise rank actual returned scores,
 * never generation order, delivery-mode support or a fabricated quality score. */
export function chooseAutopilotHook<T extends {id:string;locked?:boolean;overall_hook_fit:number}>(candidates:T[]):{chosen:T;locked:boolean}{
 if(!candidates.length)throw new AppError('No eligible hook candidates were generated.',409,'HOOK_GENERATION_FAILED');
 const locked=candidates.find(c=>c.locked);if(locked)return {chosen:locked,locked:true};
 if(candidates.some(c=>!Number.isFinite(c.overall_hook_fit)||c.overall_hook_fit<0||c.overall_hook_fit>100))throw new AppError('Hook scores need review before automatic selection.',409,'HOOK_SCORE_REVIEW_REQUIRED');
 const ranked=candidates.map((candidate,index)=>({candidate,index})).sort((a,b)=>b.candidate.overall_hook_fit-a.candidate.overall_hook_fit||a.index-b.index);
 return {chosen:ranked[0].candidate,locked:false};
}
