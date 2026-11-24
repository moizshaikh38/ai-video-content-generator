import{getMongoDb}from'../db/mongoClient.js';import{AppError}from'../types/index.js';
/** Bounded preflight for already-admitted deletion. Not a transaction around a
 * provider call: deletion racing after this check still needs final fences. */
export async function assertSelectionProjectActive(userId:string,projectId:string){
 const project=await(await getMongoDb()).collection('projects').findOne({id:projectId,user_id:userId},{projection:{id:1,deletion_started_at:1},maxTimeMS:1000});
 if(!project)throw new AppError('Project not found.',404,'PROJECT_NOT_FOUND');
 if(project.deletion_started_at)throw new AppError('Project deletion has started. No new clip selection was started.',409,'PROJECT_DELETION_IN_PROGRESS');
}
