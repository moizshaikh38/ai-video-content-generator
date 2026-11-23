import type {ClientSession,Db} from 'mongodb';
import {getMongoClient} from '../../db/mongoClient.js';
import {buildCanonicalIdempotencyKey} from '../../db/repositories/creditRepository.js';
import {AppError} from '../../types/index.js';
import {processingOwnershipFilter,type ProcessingOwnership} from './processingOwnership.js';
import {transcriptContentIdentity} from '../../shared/transcriptSourceBinding.js';
import {CaptionService} from '../captionService.js';
/** Runs only inside the wallet settlement transaction (or a no-wallet local transaction). */
export async function publishProcessingCompletion(db:Db,session:ClientSession,owner:ProcessingOwnership,transcript:any,payload:Record<string,any>,expectedPreferences:unknown,replay=false){
 const projects=db.collection('projects');
 if(replay){
  const done=await projects.findOne({id:owner.projectId,user_id:owner.userId,source_url:owner.sourceUrl,processing_attempt_id:owner.attemptId??null,processing_completed_run_token:owner.runToken,processing_completed_transcript_id:transcript.id,video_status:'transcribed'},{session});
  if(!done)throw new AppError('Completed processing identity changed.',409,'PROCESSING_ATTEMPT_CHANGED');
  return done;
 }
 const filter={...processingOwnershipFilter(owner),video_status:{$in:['processing','transcribing']}};
 const project=await projects.findOne(filter,{session});
 if(!project)throw new AppError('Processing owner changed before completion.',409,'PROCESSING_ATTEMPT_CHANGED');
 const saved=await db.collection('transcripts').findOne({id:transcript.id,project_id:owner.projectId,user_id:owner.userId},{session});
 if(!saved||transcriptContentIdentity(saved as any)!==transcriptContentIdentity(transcript))throw new AppError('Transcript changed before completion.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
 const completion:Record<string,any>={...payload,video_status:'transcribed',updated_at:new Date(),processing_completed_run_token:owner.runToken,processing_completed_transcript_id:saved.id};
 if(project.project_type==='subtitles'){
  const identity={sourceUrl:owner.sourceUrl,sourceSha256:saved.source_binding?.source_receipt?.sha256,transcriptContentSha256:transcriptContentIdentity(saved as any)};
  const cueBinding=project.subtitle_cues_binding;
  const matching=cueBinding&&Object.keys(identity).every(key=>cueBinding[key]===(identity as any)[key]);
  // Unknown/old cues are retained for recovery but cannot silently label new speech.
  // Same-source manual edits survive even if a later transcript differs.
  const manualSameSource=cueBinding?.kind==='manual'&&cueBinding.sourceUrl===identity.sourceUrl&&cueBinding.sourceSha256===identity.sourceSha256&&identity.sourceSha256;
  if(!matching&&!manualSameSource&&Array.isArray(project.subtitle_cues)&&project.subtitle_cues.length){
    completion.subtitle_cues_recovery={cues:project.subtitle_cues,binding:cueBinding??null,replacedAt:new Date()};
  }
  if(!Array.isArray(project.subtitle_cues)||project.subtitle_cues.length===0||(!matching&&!manualSameSource)){
    completion.subtitle_cues=CaptionService.extractClipCues(saved as any,0,Number(saved.duration_seconds||project.duration_seconds||86400),0,0,{maxWordsPerCue:5,maxCharsPerLine:36,uppercase:false}).cues;
    completion.subtitle_cues_binding={...identity,kind:'generated'};
  }
  if(!project.subtitle_style)completion.subtitle_style={preset:'hormozi',fontFamily:'Montserrat',fontSize:54,fontWeight:'bold',textColor:'#FFFFFF',highlightColor:'#FACC15',boxEnabled:false,position:'bottom',alignment:'center'};
 }
 // Preference edits win over enrichment calculated against the earlier snapshot.
 const preferred=await projects.updateOne({...filter,clip_preferences:expectedPreferences??null},{$set:completion},{session});
 if(preferred.matchedCount)return projects.findOne({id:owner.projectId,user_id:owner.userId},{session});
 const {clip_preferences:ignored,...preserved}=completion;
 if((await projects.updateOne(filter,{$set:preserved},{session})).matchedCount!==1)throw new AppError('Processing owner changed before completion.',409,'PROCESSING_ATTEMPT_CHANGED');
 return projects.findOne({id:owner.projectId,user_id:owner.userId},{session});
}
/** Reconcile an acknowledged or unknown commit without dispatching or changing credits. */
export async function readProcessingCompletion(db:Db,userId:string,projectId:string,sourceUrl:string,attemptId:string){
 const session=(await getMongoClient()).startSession();let result:any=null;
 try{await session.withTransaction(async()=>{
  const r=await db.collection('credit_reservations').findOne({attempt_id:attemptId,user_id:userId,operation_id:'core_video_processing','metadata.projectId':projectId,'metadata.sourceUrl':sourceUrl,status:'settled'},{session});
  const c=r?.processing_completion,receipt=r?.processing_completion_receipt;
  if(!r||!c||!receipt||c.userId!==userId||c.projectId!==projectId||c.sourceUrl!==sourceUrl)return;
  const idempotent=await db.collection<any>('idempotency_keys').findOne({_id:buildCanonicalIdempotencyKey(userId,'core_video_processing',attemptId),user_id:userId,status:'committed'},{session});
  if(!idempotent||receipt.transcript?.id!==c.transcriptId||receipt.project?.processing_completed_run_token!==c.runToken||receipt.project?.source_url!==sourceUrl||receipt.transcriptContentSha256!==transcriptContentIdentity(receipt.transcript)||JSON.stringify(receipt.sourceReceipt)!==JSON.stringify(receipt.transcript.source_binding?.source_receipt??null))return;
  const current=await db.collection('projects').findOne({id:projectId,user_id:userId,source_url:sourceUrl,processing_attempt_id:attemptId,processing_completed_run_token:c.runToken,processing_completed_transcript_id:c.transcriptId,video_status:'transcribed'},{session});
  result={project:current??receipt.project,completedProject:receipt.project,transcript:receipt.transcript,runToken:c.runToken,settledAmount:r.settled_amount??r.amount,completionIsCurrent:Boolean(current)};
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});return result;}finally{await session.endSession()}
}
