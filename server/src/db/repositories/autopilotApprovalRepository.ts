import type {Db,MongoClient,ClientSession} from 'mongodb';
import {AppError} from '../../types/index.js';
import {creationDigest} from './candidateCreationRepository.js';
import {provenOutput} from '../../shared/autopilotHookOutput.js';
const conflict=()=>new AppError('The run or its deliverables changed before approval. Reload and review the current output.',409,'AUTOPILOT_APPROVAL_CONFLICT');
export async function readAutopilotApproval(db:Db,userId:string,runId:string,candidateId?:string,session?:ClientSession){
 const one=(name:string,filter:any)=>db.collection(name).findOne({...filter,user_id:userId},{session});
 const run=await one('autopilot_runs',{id:runId});if(!run)throw conflict();
 const clip=await one('clips',{id:run.clip_id}),candidate=await one('hook_candidates',{id:candidateId||run.selected_hook_candidate_id});
 const hookSession=await one('hook_lab_sessions',{id:run.hook_session_id}),editor=await one('editor_projects',{clip_id:run.clip_id});
 const project=await one('projects',{id:run.project_id}),transcript=await one('transcripts',{project_id:run.project_id});
 const job=clip?await one('render_jobs',{clip_id:run.clip_id,render_version:clip.render_version,editor_version:clip.editor_version,status:'completed',admission_version:1}):null;
 const active=await one('render_jobs',{clip_id:run.clip_id,status:{$in:['queued','processing','uploading']}});
 const pack=await one('content_packs',{id:run.content_pack_id});
 const items=await db.collection('content_pack_items').find({content_pack_id:run.content_pack_id,user_id:userId},{session}).sort({id:1}).toArray();
 const thumbSession=run.thumbnail_session_id?await one('thumbnail_lab_sessions',{id:run.thumbnail_session_id}):null;
 const thumb=run.selected_thumbnail_concept_id?await one('thumbnail_concepts',{id:run.selected_thumbnail_concept_id}):null;
 return {userId,run,candidate,session:hookSession,clip,editor,project,transcript,job,active,pack,items,thumbSession,thumb};
}
/** Recheck and contend with each deliverable writer before storing approval.
 * Source/output object HEAD validation remains a service preflight, not an
 * atomic external-object transaction. No render is queued by approval. */
export async function commitAutopilotApproval(client:MongoClient,db:Db,input:{userId:string;expected:any;candidateId?:string;handoff:any;steps:any[];outputObject:any}){
 const tx=client.startSession();try{return await tx.withTransaction(async()=>{
  const current=await readAutopilotApproval(db,input.userId,input.expected.run.id,input.candidateId,tx);
  if(creationDigest(current)!==creationDigest(input.expected)||!current.pack||!input.outputObject||!(input.outputObject.size>0))throw conflict();
  if(current.run!.selected_thumbnail_concept_id&&(!current.thumb||!current.thumbSession||current.thumb.thumbnail_session_id!==current.thumbSession.id||current.thumbSession.clip_id!==current.clip!.id||current.thumbSession.project_id!==current.project!.id))throw conflict();
  const proof=provenOutput(current),artifact=proof.output_artifact_receipt;
  if(input.outputObject.size!==artifact.size||input.outputObject.etag!==artifact.etag||(artifact.version_id&&input.outputObject.versionId!==artifact.version_id)||current.pack.clip_id!==current.clip!.id||(current.pack.project_id&&current.pack.project_id!==current.project!.id))throw conflict();
  for(const[name,row]of[['clips',current.clip],['hook_candidates',current.candidate],['hook_lab_sessions',current.session],['editor_projects',current.editor],['projects',current.project],['transcripts',current.transcript],['render_jobs',current.job],['content_packs',current.pack],['thumbnail_lab_sessions',current.thumbSession],['thumbnail_concepts',current.thumb],...current.items.map(row=>['content_pack_items',row])]as any[]){if(!row)continue;const r=await db.collection(name).updateOne({_id:row._id,user_id:input.userId},{$inc:{autopilot_approval_fence:1}},{session:tx});if(r.matchedCount!==1)throw conflict();}
  const now=new Date(),handoff={...input.handoff,clip_id:current.clip!.id,project_id:current.project!.id,hook_text:proof.hook_text,video_storage_path:proof.output_storage_path,video_render_status:'ready',autopilot_run_id:current.run!.id,approved_at:now.toISOString(),hook_output_receipt:{...proof,output_object:input.outputObject}};
  const saved=await db.collection('autopilot_runs').findOneAndUpdate({id:current.run!.id,user_id:input.userId},{$set:{status:'APPROVED',is_approved:true,approved_by:input.userId,approved_at:now,publishing_handoff:handoff,selected_hook_candidate_id:proof.candidate_id,steps:input.steps,updated_at:now}},{session:tx,returnDocument:'after'});if(!saved)throw conflict();return {run:saved,publishing_handoff:handoff};
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});}finally{await tx.endSession();}
}
