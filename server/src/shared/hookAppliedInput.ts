import {creationDigest} from '../db/repositories/candidateCreationRepository.js';
import {hookTranscriptScope} from './hookGenerationScope.js';
import {selectionSourceReceiptMatches} from './selectionSourceReceipt.js';
import {AppError} from '../types/index.js';
export const hookCandidateContentIdentity=(c:any)=>creationDigest(Object.fromEntries(['id','user_id','hook_lab_session_id','text','delivery_mode','text_overlay_plan','trim_plan','reorder_plan','source_evidence','manual_edit'].map(k=>[k,c?.[k]])));
/** Current manually applied input, not historical generation or semantic truth. */
export function hookAppliedInput(clip:any,project:any,transcript:any){
 if(!clip||!project||!transcript||clip.user_id!==project.user_id||clip.user_id!==transcript.user_id||clip.project_id!==project.id||transcript.project_id!==project.id||clip.source_storage_path!==project.source_url||!selectionSourceReceiptMatches(clip.selection_source_receipt,transcript,project.source_url))throw new AppError('The hook source changed. Review and apply again.',409,'HOOK_APPLIED_INPUT_CHANGED');
 const scope=hookTranscriptScope(clip,transcript);
 return {version:1,clip_id:clip.id,project_id:clip.project_id,user_id:clip.user_id,source_key:clip.source_storage_path,selection_receipt_digest:creationDigest(clip.selection_source_receipt),effective_source_start:scope.start,effective_source_end:scope.end,scoped_input_digest:scope.digest,semantic_truth_verified:false};
}
