import {hookAppliedInput,hookCandidateContentIdentity} from './hookAppliedInput.js';
import {AppError} from '../types/index.js';
import {editorRenderSnapshot} from './editorRenderSnapshot.js';
import {creationDigest} from '../db/repositories/candidateCreationRepository.js';
import {selectionSourceReceiptMatches} from './selectionSourceReceipt.js';
import {hookTranscriptScope} from './hookGenerationScope.js';
import {assertHookEditorIdentity} from '../db/repositories/hookEditorRevisionRepository.js';
const conflict=()=>new AppError('The chosen hook does not have a current completed saved-editor render. Apply and render the matching hook before approval.',409,'AUTOPILOT_HOOK_OUTPUT_REQUIRED');
/** Explicit approval of a current manually applied TEXT_OVERLAY
 * output, never generation truth or an implementation of automatic mode edits. */
export function provenOutput(input:any){
 const {userId,run,candidate,session,clip,editor,job,project,transcript,active}=input;
 if(!run||run.user_id!==userId||!['COMPLETED','APPROVED'].includes(run.status)||!run.content_pack_id||active||!candidate||!session||!clip||!editor||!job||!project||!transcript)throw conflict();
 const liveLock=run.execution_lock&&(!run.execution_lock_expires_at||new Date(run.execution_lock_expires_at).getTime()>Date.now());if(liveLock)throw conflict();
 assertHookEditorIdentity(userId,candidate,session,clip,editor);
 if(run.clip_id!==clip.id||run.project_id!==clip.project_id||run.hook_session_id!==session.id||project.id!==clip.project_id||transcript.project_id!==clip.project_id||project.user_id!==userId||transcript.user_id!==userId||project.source_url!==clip.source_storage_path||!selectionSourceReceiptMatches(clip.selection_source_receipt,transcript,project.source_url))throw conflict();
 const source=hookTranscriptScope(clip,transcript),snapshot=editorRenderSnapshot(editor),apply=candidate.editor_apply_receipt;
 if(candidate.delivery_mode!=='TEXT_OVERLAY'||candidate.trim_plan||candidate.reorder_plan||!candidate.applied||apply?.version!==1||apply.state!=='applied'||apply.editor_id!==editor.id||creationDigest(apply.after)!==creationDigest(snapshot)||apply.after_title!==editor.title)throw conflict();
 if(apply.candidate_content_identity!==hookCandidateContentIdentity(candidate)||creationDigest(apply.applied_input_receipt)!==creationDigest(hookAppliedInput(clip,project,transcript)))throw conflict();
 if(clip.editor_project_sync_pending||clip.render_status!=='ready'||typeof clip.output_storage_path!=='string'||!clip.output_storage_path||clip.output_object_key!==clip.output_storage_path||clip.rendered_editor_version!==snapshot!.version||clip.rendered_editor_digest!==snapshot!.digest)throw conflict();
 if(job.user_id!==userId||job.clip_id!==clip.id||job.status!=='completed'||job.admission_version!==1||job.render_version!==clip.render_version||job.editor_version!==clip.editor_version||creationDigest(job.editor_project_snapshot)!==creationDigest(snapshot))throw conflict();
 const artifact=clip.output_artifact_receipt;
 if(artifact?.version!==1||artifact.key!==clip.output_storage_path||!Number.isSafeInteger(artifact.size)||artifact.size<=0||typeof artifact.etag!=='string'||!artifact.etag||artifact.etag.startsWith('W/')||!/^([a-f0-9]{64})$/.test(artifact.sha256)||artifact.job_id!==job.id||artifact.render_version!==job.render_version||artifact.editor_version!==job.editor_version||creationDigest(artifact.editor_project)!==creationDigest(snapshot)||creationDigest(job.output_artifact_receipt)!==creationDigest(artifact))throw conflict();
 return {version:1,output_artifact_receipt:artifact,candidate_id:candidate.id,session_id:session.id,clip_id:clip.id,project_id:project.id,source_key:clip.source_storage_path,selection_receipt_digest:creationDigest(clip.selection_source_receipt),effective_source_start:source.start,effective_source_end:source.end,scoped_input_digest:source.digest,editor:snapshot,render_job_id:job.id,render_version:job.render_version,editor_version:job.editor_version,output_storage_path:clip.output_storage_path,hook_text:candidate.text,semantic_truth_verified:false};
}
