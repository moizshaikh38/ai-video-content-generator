import type {Db,ClientSession} from 'mongodb';
import {AppError} from '../../types/index.js';
import {readAutopilotApproval} from './autopilotApprovalRepository.js';
import {provenOutput} from '../../shared/autopilotHookOutput.js';
import {creationDigest} from './candidateCreationRepository.js';
const changed=()=>new AppError('The approved hook package changed. Review and approve its current rendered video before publishing.',409,'AUTOPILOT_PUBLISH_CHANGED');
/** A marker only selects a server-owned approval. Never creates approval. */
export async function readAutopilotPublishProof(db:Db,input:{userId:string;projectId:string;clipId?:string|null;runId:unknown},session?:ClientSession){
 if(typeof input.runId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.runId)||!input.clipId)throw changed();
 const current=await readAutopilotApproval(db,input.userId,input.runId,undefined,session),run=current.run;
 if(!run||run.status!=='APPROVED'||run.is_approved!==true||run.clip_id!==input.clipId||run.project_id!==input.projectId||!run.publishing_handoff?.hook_output_receipt)throw changed();
 const proof=provenOutput(current),stored=run.publishing_handoff.hook_output_receipt;
 const {output_object,...approved}=stored;
 if(creationDigest(approved)!==creationDigest(proof)||run.publishing_handoff.video_storage_path!==proof.output_storage_path||run.publishing_handoff.hook_text!==proof.hook_text)throw changed();
 const receipt={version:1,run_id:run.id,approval_identity:creationDigest({approved_by:run.approved_by,approved_at:run.approved_at,proof}),proof};
 return {current,receipt};
}
/** Called inside the post/job admission transaction. Contends with approval,
 * candidate/source/editor saves and new renders, never refreshes the receipt. */
export async function fenceAutopilotPublishProof(db:Db,session:ClientSession,input:{userId:string;projectId:string;clipId?:string|null;runId:unknown;expected:any}){
 const latest=await readAutopilotPublishProof(db,input,session);
 if(creationDigest(latest)!==creationDigest(input.expected))throw changed();
 const c=latest.current;
 for(const[name,row]of[['autopilot_runs',c.run],['hook_candidates',c.candidate],['hook_lab_sessions',c.session],['clips',c.clip],['editor_projects',c.editor],['projects',c.project],['transcripts',c.transcript],['render_jobs',c.job],['content_packs',c.pack],['thumbnail_lab_sessions',c.thumbSession],['thumbnail_concepts',c.thumb],...c.items.map(row=>['content_pack_items',row])]as any[]){if(!row)continue;const r=await db.collection(name).updateOne({_id:row._id,user_id:input.userId},{$inc:{autopilot_publish_fence:1}},{session});if(r.matchedCount!==1)throw changed();}
 return latest.receipt;
}
export function assertStoredAutopilotPublishProof(expected:any,current:any){if(!expected||creationDigest(expected)!==creationDigest(current))throw changed();}
