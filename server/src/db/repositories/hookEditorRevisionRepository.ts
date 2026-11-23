import {hookAppliedInput,hookCandidateContentIdentity} from '../../shared/hookAppliedInput.js';
import type {Db,MongoClient} from 'mongodb';
import {AppError} from '../../types/index.js';
import {validateRecord} from '../schemaValidation.js';
import {creationDigest} from './candidateCreationRepository.js';
import {editorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
export const hookCandidateEditIdentity=(c:any)=>creationDigest(Object.fromEntries(['id','user_id','hook_lab_session_id','text','delivery_mode','text_overlay_plan','trim_plan','reorder_plan','source_evidence','locked','manual_edit','applied','editor_apply_receipt'].map(k=>[k,c?.[k]])));
const conflict=()=>new AppError('The hook, source clip or editor changed. Reload the matching clip before applying or undoing this hook.',409,'HOOK_EDITOR_IDENTITY_REQUIRED');
/** Destination isolation only. This does not prove historical candidate source
 * bytes or change the existing delivery-mode/editor transformation semantics. */
export function assertHookEditorIdentity(userId:string,candidate:any,session:any,clip:any,editor:any,snapshot?:any):void{
 if(!candidate||!session||!clip||!editor||candidate.user_id!==userId||session.user_id!==userId||clip.user_id!==userId||editor.user_id!==userId||
 candidate.hook_lab_session_id!==session.id||session.clip_id!==clip.id||editor.clip_id!==clip.id||session.project_id!==clip.project_id||editor.project_id!==clip.project_id)throw conflict();
 if(snapshot&&(snapshot.id!==editor.id||snapshot.user_id!==userId||snapshot.clip_id!==clip.id||snapshot.project_id!==clip.project_id))throw conflict();
}
export async function commitHookEditorRevision(client:MongoClient,db:Db,input:{userId:string;candidate:any;expectedEditor:any;updates:any;snapshot?:any;revert?:boolean;appliedInput?:any}){
 const updates={...input.updates};validateRecord('editor_projects',updates);
 const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const candidate=await db.collection('hook_candidates').findOne({id:input.candidate.id,user_id:input.userId},{session});
  const hookSession=await db.collection('hook_lab_sessions').findOne({id:input.candidate.hook_lab_session_id,user_id:input.userId},{session});
  const editor=await db.collection('editor_projects').findOne({id:input.expectedEditor.id,user_id:input.userId},{session});
  const clip=editor?await db.collection('clips').findOne({id:editor.clip_id,user_id:input.userId},{session}):null;
  assertHookEditorIdentity(input.userId,candidate,hookSession,clip,editor,input.snapshot);
  if(hookCandidateEditIdentity(candidate)!==hookCandidateEditIdentity(input.candidate)||JSON.stringify(editorRenderSnapshot(editor))!==JSON.stringify(editorRenderSnapshot(input.expectedEditor))||updates.version!==editor!.version+1)throw conflict();
  const project=await db.collection('projects').findOne({id:clip!.project_id,user_id:input.userId},{session});
  const transcript=await db.collection('transcripts').findOne({project_id:clip!.project_id,user_id:input.userId},{session});
  let appliedInput:any;
  if(!input.revert){appliedInput=hookAppliedInput(clip,project,transcript);if(creationDigest(appliedInput)!==creationDigest(input.appliedInput))throw conflict();for(const[name,row]of[['projects',project],['transcripts',transcript]]as const){const fenced=await db.collection(name).updateOne({id:row!.id,user_id:input.userId},{$inc:{hook_apply_fence:1}},{session});if(fenced.matchedCount!==1)throw conflict();}}
  const prior=candidate!.editor_apply_receipt;
  if(input.revert){
   if(prior?.version!==1||prior.state!=='applied'||prior.editor_id!==editor!.id||creationDigest(prior.before)!==creationDigest(input.snapshot)||JSON.stringify(prior.after)!==JSON.stringify(editorRenderSnapshot(editor))||prior.after_title!==editor!.title)throw conflict();
  }else if(candidate!.applied||prior?.state==='applied')throw new AppError('This hook is already applied. Undo it before applying it again.',409,'HOOK_ALREADY_APPLIED');
  const {_id,...payload}=updates;
  const saved=await db.collection('editor_projects').findOneAndUpdate({id:editor!.id,user_id:input.userId,version:editor!.version},{$set:payload},{session,returnDocument:'after'});if(!saved)throw conflict();
  const c=await db.collection('clips').updateOne({id:clip!.id,user_id:input.userId,project_id:clip!.project_id},[{$set:{editor_version:{$add:[{$ifNull:['$editor_version',1]},1]},editor_project_sync_pending:{$cond:[{$ne:[{$ifNull:['$editor_project_sync_pending',null]},null]},{id:saved.id,version:saved.version},null]}}}],{session});
  if(c.matchedCount!==1)throw conflict();
  const now=new Date();
  const {_id:oldId,...before}=input.expectedEditor;
  const receipt=input.revert?{...prior,state:'reverted',reverted_at:now}:{version:1,state:'applied',editor_id:saved.id,before,after:editorRenderSnapshot(saved),after_title:saved.title,candidate_content_identity:hookCandidateContentIdentity(candidate),applied_input_receipt:appliedInput};
  const cand=await db.collection('hook_candidates').updateOne({id:candidate!.id,user_id:input.userId,hook_lab_session_id:hookSession!.id},{$set:{editor_apply_receipt:receipt,applied:!input.revert,status:input.revert?'EDITED':'APPLIED',updated_at:now}},{session});
  const sess=await db.collection('hook_lab_sessions').updateOne({id:hookSession!.id,user_id:input.userId,clip_id:clip!.id,project_id:clip!.project_id},{$set:{status:input.revert?'READY':'APPLIED',updated_at:now}},{session});
  if(cand.matchedCount!==1||sess.matchedCount!==1)throw conflict();
  return saved;
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});}finally{await session.endSession();}
}
