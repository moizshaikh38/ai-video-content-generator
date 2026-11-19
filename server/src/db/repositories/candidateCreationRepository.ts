import {editorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import crypto from 'node:crypto';
import type {Db, ClientSession} from 'mongodb';
import {getMongoClient, getMongoDb} from '../mongoClient.js';
import {AppError, isValidUUID} from '../../types/index.js';

export interface CandidateCreationIntent {
  id:string; projectId:string; candidateId:string; fingerprint:string;
  preparation?:string;
}
export const creationConflict=()=>new AppError('The saved creation request has different inputs. Resolve it before starting another clip.',409,'CREATION_INTENT_CONFLICT');
export function creationDigest(value:unknown):string {
  const stable=(v:any):any=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function candidatePreparationDigest(template:unknown,policy:unknown,initialEditor?:any):string {
  return creationDigest({template,policy,...(initialEditor?{initialEditor:editorRenderSnapshot(initialEditor),plannedClipId:initialEditor.clip_id}:{})});
}
export const candidateCreationKey=(owner:string,id:string)=>creationDigest(['candidate-creation-v1',owner,id]);
export function parseCandidateCreation(body:any,projectId:string):CandidateCreationIntent|undefined {
  const flags=['prepare_only','recover_only','cancel_only'].filter(k=>body?.[k]!==undefined);
  if(body?.creation_id===undefined){if(flags.length||body?.preparation!==undefined)throw creationConflict();return undefined;}
  if(!isValidUUID(body.creation_id)||!isValidUUID(body.candidateId)||flags.length>1||flags.some(k=>body[k]!==true)||
    (body.preparation!==undefined&&(typeof body.preparation!=='string'||!/^[a-f0-9]{64}$/.test(body.preparation)))||
    (body.caption_enabled!==undefined&&typeof body.caption_enabled!=='boolean')||
    (body.caption_style!==undefined&&(typeof body.caption_style!=='string'||!body.caption_style.trim()))||
    !['9:16','1:1','16:9'].includes(body.aspectRatio??'9:16')||!['smart','center','fit'].includes(body.cropMode??'smart')||
    Object.keys(body).some(k=>!['creation_id','candidateId','aspectRatio','cropMode','caption_enabled','caption_style','caption_config','preparation',...flags].includes(k)))throw creationConflict();
  if(body.caption_config!==undefined&&(body.caption_config===null||typeof body.caption_config!=='object'||Array.isArray(body.caption_config)))throw creationConflict();
  // Bound untrusted nested configuration before canonicalization/persistence.
  const config=JSON.stringify(body.caption_config??null);if(config.length>32768)throw creationConflict();
  return{id:body.creation_id.toLowerCase(),projectId,candidateId:body.candidateId,
    fingerprint:creationDigest({operation:'candidate-creation-v1',projectId,candidateId:body.candidateId,aspectRatio:body.aspectRatio??'9:16',cropMode:body.cropMode??'smart',caption_enabled:body.caption_enabled??null,caption_style:body.caption_style??null,caption_config:body.caption_config??null}),preparation:body.preparation};
}
export async function findCandidateCreation(db:Db,owner:string,intent:CandidateCreationIntent,session?:ClientSession,allowDeleted=false):Promise<any|null>{
  const record=await db.collection<any>('candidate_creations').findOne({_id:candidateCreationKey(owner,intent.id),user_id:owner},{session});
  if(!record)return null;
  if(record.version!==1||record.project_id!==intent.projectId||record.candidate_id!==intent.candidateId||record.fingerprint!==intent.fingerprint)throw creationConflict();
  if(intent.preparation!==undefined&&record.preparation!==undefined&&intent.preparation!==record.preparation)throw creationConflict();
  if(record.state==='cancelled')return{status:'ok',cancelled:true,creationId:intent.id};
  if(['prepared','admitted'].includes(record.state)&&candidatePreparationDigest(record.snapshot,record.policy,record.baseline_version===1?record.initial_editor:undefined)!==record.preparation)throw new AppError('The saved creation preparation could not be verified.',503,'CREATION_RECEIPT_UNVERIFIED');
  if(record.baseline_version===1&&(!record.initial_editor||record.initial_editor.clip_id!==record.planned_clip_id||!isValidUUID(record.planned_clip_id)||record.initial_editor.user_id!==owner||record.initial_editor.project_id!==intent.projectId||record.initial_editor.version!==1))throw new AppError('The prepared editor baseline could not be verified.',503,'CREATION_RECEIPT_UNVERIFIED');
  if(record.state==='prepared'&&/^[a-f0-9]{64}$/.test(record.preparation))return{status:'ok',prepared:true,creationId:intent.id,preparation:record.preparation};
  const r=record.receipt;
  if(record.state!=='admitted'||!r?.clip||!r.renderJob||!isValidUUID(r.clip.id)||!isValidUUID(r.renderJob.id)||r.clip.user_id!==owner||r.clip.project_id!==intent.projectId||r.clip.candidate_id!==intent.candidateId||r.renderJob.clip_id!==r.clip.id||r.renderJob.user_id!==owner||r.clip.render_version!==1||r.clip.editor_version!==1||r.renderJob.render_version!==1||r.renderJob.editor_version!==1)throw new AppError('The saved creation receipt could not be verified. No new clip was created.',503,'CREATION_RECEIPT_UNVERIFIED');
  if(record.baseline_version===1&&(r.clip.id!==record.planned_clip_id||creationDigest(r.renderJob.editor_project_snapshot)!==creationDigest(editorRenderSnapshot(record.initial_editor))))throw new AppError('The initial job does not match its prepared editor baseline.',503,'CREATION_RECEIPT_UNVERIFIED');
  const receiptTemplate=Object.fromEntries(Object.keys(record.snapshot).map(key=>[key,r.clip[key]]));
  if(creationDigest(receiptTemplate)!==creationDigest(record.snapshot))throw new AppError('The created clip receipt does not match its prepared inputs.',503,'CREATION_RECEIPT_UNVERIFIED');
  const exists=await db.collection('clips').findOne({id:r.clip.id,user_id:owner,project_id:intent.projectId},{session,projection:{id:1}});
  if(!exists&&allowDeleted)return{status:'ok',deleted:true,creationId:intent.id,preparation:record.preparation,clipId:r.clip.id,jobId:r.renderJob.id};
  if(!exists)throw new AppError('The clip from this saved creation was deleted. It will not be recreated.',404,'CLIP_NOT_FOUND');
  return{status:'ok',creationId:intent.id,preparation:record.preparation,clip:r.clip,renderJob:r.renderJob,replayed:true};
}
export async function lookupCandidateCreation(owner:string,intent:CandidateCreationIntent){return findCandidateCreation(await getMongoDb(),owner,intent);}
/** Same immutable owner/key document serializes preparation, admission and close.
 * Never deletes a clip/job, consumes credits or expires an identity. */
export async function closeCandidateCreation(owner:string,intent:CandidateCreationIntent){
  const client=await getMongoClient(),db=await getMongoDb(),session=client.startSession();
  const close={status:'ok',cancelled:true,creationId:intent.id};
  try{return await session.withTransaction(async()=>{
    const prior=await findCandidateCreation(db,owner,intent,session,true);
    if(prior?.clip||prior?.cancelled||prior?.deleted)return prior;
    const filter={_id:candidateCreationKey(owner,intent.id),user_id:owner};
    if(prior){const result=await db.collection<any>('candidate_creations').updateOne({...filter,state:'prepared'},{$set:{state:'cancelled',updated_at:new Date()}},{session});if(result.matchedCount!==1)throw creationConflict();}
    else await db.collection<any>('candidate_creations').insertOne({...filter,id:intent.id,version:1,project_id:intent.projectId,candidate_id:intent.candidateId,fingerprint:intent.fingerprint,state:'cancelled',created_at:new Date()},{session});
    return close;
  },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});}
  catch(error){const prior=await findCandidateCreation(db,owner,intent,undefined,true);if(prior?.clip||prior?.cancelled||prior?.deleted)return prior;throw error;}
  finally{await session.endSession();}
}
