import {creationDigest} from '../db/repositories/candidateCreationRepository.js';
import {hookAppliedInput} from './hookAppliedInput.js';
import {transcriptContentIdentity} from './transcriptSourceBinding.js';
import {editorRenderSnapshot} from './editorRenderSnapshot.js';
export function automaticSelectedInput({run,candidate,session,clip,project,transcript,producerJob}:any){
 const fail=()=>{throw Object.assign(Error('Automatic selected hook input needs review. No candidate was substituted.'),{code:'AUTOPILOT_SELECTED_INPUT_REVIEW_REQUIRED'})};
 if(!run||run.user_id!==clip?.user_id||run.clip_id!==clip?.id||run.project_id!==project?.id||candidate?.user_id!==run.user_id||candidate.hook_lab_session_id!==session?.id||session.clip_id!==clip.id||session.project_id!==project.id||candidate.id!==run.selected_hook_candidate_id||session.id!==run.hook_session_id)fail();
 if(candidate.delivery_mode!=='TEXT_OVERLAY'||candidate.trim_plan||candidate.reorder_plan||!candidate.text_overlay_plan||candidate.manual_edit||candidate.locked)fail();
 const current=hookAppliedInput(clip,project,transcript),g=candidate.generation_input_receipt;
 if(g?.version!==1||g.clock!=='effective-clip-relative'||typeof g.generation_id!=='string'||g.source_key!==current.source_key||g.source_sha256!==clip.selection_source_receipt.source_receipt.sha256||g.transcript_content_sha256!==transcriptContentIdentity(transcript)||g.effective_source_start!==current.effective_source_start||g.effective_source_end!==current.effective_source_end||g.scoped_input_digest!==current.scoped_input_digest||g.semantic_truth_verified!==false)fail();
 if(!producerJob||producerJob.id!==run.steps.find((s:any)=>s.step==='PRODUCER')?.artifacts?.render_job_id||producerJob.clip_id!==clip.id||producerJob.user_id!==run.user_id||producerJob.status!=='completed'||producerJob.admission_version!==1||producerJob.render_version!==clip.render_version||producerJob.editor_version!==clip.editor_version)fail();
 return {version:1,run_id:run.id,candidate_id:candidate.id,session_id:session.id,producer_job_id:producerJob.id,current_input:current,candidate_identity:creationDigest(candidate),semantic_truth_verified:false};
}
export function nextRenderContinuation(state:any,job:any,clip:any,editor:any){
 if(state.version!==1||job?.id!==state.job_id||job.clip_id!==state.clip_id||job.user_id!==state.user_id||job.render_version!==state.render_version||job.editor_version!==state.editor_version||creationDigest(job.editor_project_snapshot)!==creationDigest(state.editor))throw Error('foreign job receipt');
 if(['queued','processing','uploading'].includes(job.status))return 'WAIT';
 if(job.status!=='completed')return 'REVIEW';
 if(clip.render_status!=='ready'||clip.render_version!==job.render_version||clip.editor_version!==job.editor_version||creationDigest(editorRenderSnapshot(editor))!==creationDigest(state.editor)||creationDigest(clip.output_artifact_receipt)!==creationDigest(job.output_artifact_receipt)||clip.output_artifact_receipt?.job_id!==job.id)return 'REVIEW';
 return 'READY_FOR_PROOF';
}
