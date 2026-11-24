import type{Db}from'mongodb';
/** Owned project pointer restricts this advisory read to indexed job _ids.
 * Missing/unavailable pointed jobs are unknown, never definite completion.
 * No pointer means no dispatch lookup, including with the rollout flag off. */
export async function withCoreProcessingStatus<T extends Record<string,any>>(db:Db,userId:string,projects:T[]):Promise<T[]>{
 const pointed=projects.filter(p=>p.user_id===userId&&typeof p.core_processing_dispatch?.key==='string'&&p.core_processing_dispatch.sourceUrl===p.source_url);
 if(!pointed.length)return projects;
 let jobs:any[]=[];try{jobs=await db.collection('core_processing_jobs').find({_id:{$in:pointed.map(p=>p.core_processing_dispatch.key)} as any,user_id:userId},{projection:{id:1,project_id:1,source_url:1,attempt_id:1,previous_attempt_id:1,status:1,result_code:1}}).maxTimeMS(1000).toArray();}catch{/* Only pointed projects are marked unknown below. */}
 const byKey=new Map(jobs.map(job=>[String(job._id),job]));
 return projects.map(project=>{
  if(!pointed.includes(project))return project;
  const pointer=project.core_processing_dispatch,job=byKey.get(pointer.key);
  const unknown=()=>({...project,video_status:'processing',processing_dispatch:{attemptId:pointer.attemptId,status:'unavailable'},error_code:'PROCESSING_DISPATCH_STATUS_UNAVAILABLE',error_message:'Saved processing request status is unavailable. No new processing was started. Reload to check again.'});
  if(!job||job.project_id!==project.id||job.source_url!==project.source_url||job.attempt_id!==pointer.attemptId)return unknown();
  // A newer actual attempt supersedes this pointer. A queued successor to an
  // earlier completed transcript does not: it must remain visibly queued.
  if(project.processing_attempt_id&&project.processing_attempt_id!==job.attempt_id&&project.processing_attempt_id!==job.previous_attempt_id)return project;
  if(job.status==='completed')return ['transcribed','completed','complete'].includes(project.video_status)?project:unknown();
  const dispatch={id:job.id,attemptId:job.attempt_id,status:job.status};
  if(job.status==='queued')return{...project,video_status:'queued',processing_dispatch:dispatch};
  if(job.status==='processing')return{...project,video_status:project.video_status==='transcribing'?'transcribing':'processing',processing_dispatch:dispatch};
  if(['failed','cancelled'].includes(job.status))return{...project,video_status:'failed',error_code:project.error_code||job.result_code||'PROCESSING_REQUEST_FAILED',error_message:project.error_message||'Queued processing did not finish. Review the request before retrying.',processing_dispatch:dispatch};
  if(job.status==='review_required')return{...project,video_status:'failed',error_code:'PROCESSING_STOP_REVIEW_REQUIRED',error_message:'Queued processing needs worker review before another request can start. No automatic retry was made.',processing_dispatch:dispatch};
  return unknown();
 });
}
