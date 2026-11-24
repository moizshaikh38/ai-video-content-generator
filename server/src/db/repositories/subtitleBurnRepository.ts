import {DELETION_MARKER_FIELD} from '../../services/deletionAdmissionService.js';
import type {MongoClient,Db} from 'mongodb';
import {subtitleBurnIdentity} from '../../shared/subtitleBurnIdentity.js';
/** A stale worker may finish encoding/uploading but cannot become the current
 * export. Its lease clears only after it has actually stopped. */
export async function publishSubtitleBurn(client:MongoClient,db:Db,input:{projectId:string;userId:string;runToken:string;identity:string;exportKey:string;watermarkRequired:boolean;sourceReceipt:import('../../shared/sourceObjectReceipt.js').SourceObjectReceipt}):Promise<boolean>{
 const session=client.startSession();let published=false;
 try{await session.withTransaction(async()=>{
  published=false;
  const filter={id:input.projectId,user_id:input.userId,subtitle_export_run_token:input.runToken,[DELETION_MARKER_FIELD]:{$exists:false}};
  const project=await db.collection('projects').findOne(filter,{session});
  if(!project||subtitleBurnIdentity(project)!==input.identity)return;
  const result=await db.collection('projects').updateOne(filter,{$set:{subtitle_export_status:'ready',subtitle_export_progress:100,subtitle_export_stage:'completed',subtitle_export_path:input.exportKey,subtitle_export_identity:input.identity,subtitle_export_source_receipt:input.sourceReceipt??null,subtitle_export_run_token:null,is_watermarked:input.watermarkRequired,subtitle_export_error:null,updated_at:new Date()}},{session});
  published=result.matchedCount===1;
 });return published;}finally{await session.endSession()}
}
