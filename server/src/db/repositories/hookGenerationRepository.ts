import {hookTranscriptScope} from '../../shared/hookGenerationScope.js';
import type{MongoClient,Db}from'mongodb';import{AppError}from'../../types/index.js';import{creationDigest}from'./candidateCreationRepository.js';import{transcriptContentIdentity}from'../../shared/transcriptSourceBinding.js';
export const hookClipInputIdentity=(clip:any)=>creationDigest(Object.fromEntries(['id','user_id','project_id','source_storage_path','selection_source_receipt','start_seconds','end_seconds','trim_start_offset','trim_end_offset'].map(k=>[k,clip?.[k]])));
const sessionIdentity=(s:any)=>{const{_id,...row}=s;return creationDigest(row);};
const conflict=()=>new AppError('The hook source, trim or session changed. Reload before generating again.',409,'HOOK_GENERATION_CONFLICT');
/** Inserts one NEW generation batch and refreshes current analysis atomically.
 * Existing candidate editorial fields and receipts remain untouched; metadata
 * write-fences serialize concurrent manual and lock changes. */
export async function commitHookGeneration(client:MongoClient,db:Db,input:{userId:string;session:any;clip:any;transcript:any;analysis:any;receipt:any;candidates:any[];create?:boolean;existingCandidates?:any[];openingWindow?:any}){
 if(input.session.user_id!==input.userId||input.clip.user_id!==input.userId||input.transcript.user_id!==input.userId||input.session.clip_id!==input.clip.id||input.session.project_id!==input.clip.project_id||input.transcript.project_id!==input.clip.project_id)throw conflict();
 const scope=hookTranscriptScope(input.clip,input.transcript),receipt=input.receipt;
 if(receipt?.version!==1||receipt.clock!=='effective-clip-relative'||receipt.source_key!==input.clip.source_storage_path||receipt.source_sha256!==input.clip.selection_source_receipt?.source_receipt?.sha256||receipt.transcript_content_sha256!==transcriptContentIdentity(input.transcript)||receipt.effective_source_start!==scope.start||receipt.effective_source_end!==scope.end||receipt.scoped_input_digest!==scope.digest||receipt.semantic_truth_verified!==false)throw conflict();
 for(const candidate of input.candidates){if(candidate.user_id!==input.userId||candidate.hook_lab_session_id!==input.session.id||creationDigest(candidate.generation_input_receipt)!==creationDigest(receipt))throw conflict();for(const evidence of candidate.source_evidence||[]){if(typeof evidence.start_seconds!=='number'||typeof evidence.end_seconds!=='number'||evidence.start_seconds<0||evidence.end_seconds>scope.end-scope.start||evidence.end_seconds<=evidence.start_seconds||!scope.segments.some(s=>s.text===evidence.text&&Math.abs(s.start-scope.start-evidence.start_seconds)<.001&&Math.abs(s.end-scope.start-evidence.end_seconds)<.001))throw conflict();}}
 const tx=client.startSession();try{return await tx.withTransaction(async()=>{
  const session=await db.collection('hook_lab_sessions').findOne(input.create?{clip_id:input.clip.id,user_id:input.userId}:{id:input.session.id,user_id:input.userId},{session:tx});
  const clip=await db.collection('clips').findOne({id:input.clip.id,user_id:input.userId},{session:tx});
  const project=await db.collection('projects').findOne({id:input.clip.project_id,user_id:input.userId},{session:tx});
  const transcript=await db.collection('transcripts').findOne({id:input.transcript.id,user_id:input.userId,project_id:input.clip.project_id},{session:tx});
  if((input.create?Boolean(session):!session)||!clip||!project||!transcript||(!input.create&&(session!.clip_id!==clip.id||session!.project_id!==clip.project_id||sessionIdentity(session)!==sessionIdentity(input.session)))||hookClipInputIdentity(clip)!==hookClipInputIdentity(input.clip)||project.source_url!==clip.source_storage_path||transcriptContentIdentity(transcript)!==transcriptContentIdentity(input.transcript)||creationDigest(transcript.source_binding)!==creationDigest(input.transcript.source_binding))throw conflict();
  if(input.existingCandidates){const existing=await db.collection('hook_candidates').find({hook_lab_session_id:input.session.id,user_id:input.userId},{session:tx}).toArray();const digest=(rows:any[])=>creationDigest(rows.map(row=>{const{_id,...r}=row;return r;}).sort((a,b)=>a.id.localeCompare(b.id)));if(digest(existing)!==digest(input.existingCandidates))throw conflict();for(const row of existing){const r=await db.collection('hook_candidates').updateOne({id:row.id,user_id:input.userId},{$inc:{hook_generation_fence:1}},{session:tx});if(r.matchedCount!==1)throw conflict();}}
  // Write-fence clip and source project/transcript to serialize races that do
  // not alter the session, without changing editorial or source content.
  for(const[name,row]of[['clips',clip],['projects',project],['transcripts',transcript]]as const){const r=await db.collection(name).updateOne({id:row.id,user_id:input.userId},{$inc:{hook_generation_fence:1}},{session:tx});if(r.matchedCount!==1)throw conflict();}
  if(input.candidates.length)await db.collection('hook_candidates').insertMany(input.candidates,{session:tx});
  if(input.create){const row={...input.session,generation_input_receipt:input.receipt};await db.collection('hook_lab_sessions').insertOne(row,{session:tx});return row;}
  const saved=await db.collection('hook_lab_sessions').findOneAndUpdate({id:session!.id,user_id:input.userId},{$set:{analysis:input.analysis,...(input.openingWindow?{opening_window:input.openingWindow}:{}),generation_input_receipt:input.receipt,status:'READY',updated_at:new Date()},$inc:{version:1}},{session:tx,returnDocument:'after'});if(!saved)throw conflict();
  return input.candidates;
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});}finally{await tx.endSession();}
}
