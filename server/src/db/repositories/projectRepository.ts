import { getMongoDb,getMongoClient } from '../mongoClient.js';

/** Compare-and-set the processing state so two API instances cannot launch the same project. */
export async function claimProjectProcessing(userId: string, projectId: string,
  expectedStatus: string, expectedUpdatedAt: Date, ownership:{attemptId:string;sourceUrl:string;previousAttemptId?:string|null;previousRunToken?:string|null}): Promise<boolean> {
  if(!ownership?.attemptId||!ownership.sourceUrl)return false;
  const active = expectedStatus === 'processing' || expectedStatus === 'transcribing';
  // No timeout reclaim: metadata age is not proof a running worker stopped.
  // Recovery must explicitly stop/reconcile the old worker before returning idle.
  if(active||ownership.previousRunToken)return false;
  const db = await getMongoDb();
  // An idle transition is serialized by exact status, source and prior identity.
  const session=(await getMongoClient()).startSession();let claimed=false;
  try{await session.withTransaction(async()=>{
    const reservation=await db.collection('credit_reservations').findOne({attempt_id:ownership.attemptId,user_id:userId,operation_id:'core_video_processing','metadata.projectId':projectId,'metadata.sourceUrl':ownership.sourceUrl},{session});
    if(!reservation||reservation.processing_admission||reservation.processing_claim_closed||!(['active','reserved'].includes(reservation.status)||(reservation.status==='settled'&&reservation.amount===0&&!reservation.processing_completion)))return;
    // Contend on the reservation with admission/refund, not a snapshot-only check.
    await db.collection('credit_reservations').updateOne({_id:reservation._id},{$inc:{processing_claim_serial:1}},{session});
    const result=await db.collection('projects').updateOne({id:projectId,user_id:userId,video_status:expectedStatus,source_url:ownership.sourceUrl,processing_attempt_id:ownership.previousAttemptId??null,processing_run_token:null},{$set:{video_status:'processing',updated_at:new Date(),processing_attempt_id:ownership.attemptId,processing_run_token:null}},{session});
    claimed=result.modifiedCount===1;
  });return claimed;}finally{await session.endSession()}
}

/** Resolve a fresh caller's failed/unknown claim without touching admitted work. */
export async function releaseUnadmittedProcessing(userId:string,projectId:string,sourceUrl:string,attemptId:string){
 const {CreditRepository}=await import('./creditRepository.js');const db=await getMongoDb();let changed=false;
 const fence=async(session:import('mongodb').ClientSession)=>{
  const r=await db.collection('credit_reservations').findOne({attempt_id:attemptId,user_id:userId,operation_id:'core_video_processing','metadata.projectId':projectId,'metadata.sourceUrl':sourceUrl},{session});
  if(!r||r.processing_admission)throw new Error('Admitted or unverifiable reservation cannot be released by caller cleanup.');
  const p=await db.collection('projects').findOne({id:projectId,user_id:userId},{session});
  if(!p)return;
  if(p.processing_attempt_id===attemptId&&p.source_url===sourceUrl&&['processing','transcribing'].includes(p.video_status)){ 
   if(p.processing_run_token)throw new Error('Processing worker already owns this claim.');
   changed=true;await db.collection('projects').updateOne({_id:p._id,source_url:sourceUrl,processing_attempt_id:attemptId,processing_run_token:null,video_status:p.video_status},{$set:{video_status:'failed',error_message:'Processing did not start. Retry with a new attempt.',updated_at:new Date()}},{session});
  }else await db.collection('projects').updateOne({_id:p._id},{$inc:{processing_write_serial:1}},{session});
 };
 const reservation=await db.collection('credit_reservations').findOne({attempt_id:attemptId,user_id:userId});
 if(reservation?.status==='settled'&&reservation.amount===0&&!reservation.processing_completion){
  const session=(await getMongoClient()).startSession();try{await session.withTransaction(async()=>{await fence(session);await db.collection('credit_reservations').updateOne({_id:reservation._id,processing_admission:{$exists:false}},{$set:{processing_claim_closed:true}},{session});})}finally{await session.endSession()}
 }else await CreditRepository.releaseReservation(attemptId,'Processing claim could not complete',undefined,fence);
 const current=await db.collection('projects').findOne({id:projectId,user_id:userId});
 return{changed,project:current};
}
