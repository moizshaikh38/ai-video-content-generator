import{sourceObjectReceiptMatches}from'./sourceObjectReceipt.js';import type{SelectionSourceReceipt}from'./selectionSourceReceipt.js';
export const GAME_VISION_EVIDENCE_STATUS='disabled-no-qualified-image-producer-v1' as const;
/** Metadata supplied by a row is not proof that images reached a model. No
 * producer is qualified yet. Keep every row intact and admit no game evidence.
 * Caller has already verified live transcript/source at selection preflight. */
export function admitGameEventEvidence(row:any,context:{projectId:string;userId:string;selection:SelectionSourceReceipt;durationSeconds:number}):null{
 const{projectId,userId,selection:s,durationSeconds:d}=context;
 if(!row||row.project_id!==projectId||row.user_id!==userId||!Number.isFinite(d)||d<=0||!s||s.version!==1||!sourceObjectReceiptMatches(s.source_receipt,s.source_key,s.source_receipt))return null;
 return null;
}
