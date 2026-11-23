import type {Db,ClientSession} from 'mongodb';
import {AppError} from '../../types/index.js';
import type {TranscriptionProvider} from './transcriptionProvider.js';
export interface ProcessingOwnership {projectId:string;userId:string;sourceUrl:string;attemptId?:string;runToken:string}
export const processingOwnershipFilter=(o:ProcessingOwnership)=>({id:o.projectId,user_id:o.userId,source_url:o.sourceUrl,processing_attempt_id:o.attemptId??null,processing_run_token:o.runToken});
export async function assertProcessingOwnership(db:Db,o:ProcessingOwnership,session?:ClientSession){
 if(!await db.collection('projects').findOne(processingOwnershipFilter(o),{session}))throw new AppError('Processing source or attempt changed. No further work was started.',409,'PROCESSING_ATTEMPT_CHANGED');
}
/** Each new provider-abstraction request checks ownership. This does not cancel
 * a dispatched transport, or fence provider-internal failover attempts. */
export function ownedTranscriptionProvider(delegate:TranscriptionProvider,assertCurrent:()=>Promise<void>):TranscriptionProvider{
 return{name:delegate.name,allowWholeFileFallback:delegate.allowWholeFileFallback,async transcribeAudio(...args){try{await assertCurrent()}catch(error){throw Object.assign(error as object,{noAutomaticRetry:true})}return delegate.transcribeAudio(...args)}};
}
