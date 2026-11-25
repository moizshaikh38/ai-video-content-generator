import{finalSpeechAdmissionEnabled}from'../shared/finalSpeechAdmission.js';
import type { SelectionOutcomeStatus } from '../types/index.js';
import crypto from'node:crypto';import type{Db}from'mongodb';import{selectionContextIdentity}from'../shared/selectionContextIdentity.js';import{selectionSourceReceiptMatches}from'../shared/selectionSourceReceipt.js';import{automaticOneExportEnabled,coreSelectionContinuationEnabled,coreProcessingDispatchEnabled,clipSelectionDispatchEnabled}from'./runtimePolicy.js';

export function stripSelectionInternalFields<T extends Record<string, any>>(project: T): Omit<T, 'selection_completion_receipt'> {
  if (!project || typeof project !== 'object' || !('selection_completion_receipt' in project)) {
    return project;
  }
  const { selection_completion_receipt: _omitted, ...safe } = project;
  return safe;
}

/**
 * Derive a safe, sanitized selection_outcome_status for single-project detail
 * without exposing server-side selection_completion_receipt or raw source receipts.
 */
export async function withSelectionOutcomeStatus<T extends Record<string, any>>(
  db: Db,
  userId: string,
  project: T
): Promise<Omit<T, 'selection_completion_receipt'> & { poster_key?: string | null; selection_outcome_status: SelectionOutcomeStatus }> {
  const safeProject = stripSelectionInternalFields(project);
  const reply = (selection_outcome_status: SelectionOutcomeStatus) => ({
    ...safeProject,
    selection_outcome_status,
  });
  if (!project || project.user_id !== userId) {
    return reply({ state: 'unknown' });
  }

  const continuation = project.core_selection_status;
  if (continuation) {
    if (continuation.state === 'queued' || continuation.state === 'processing') {
      return reply({ state: 'selection_pending' });
    }
    if (continuation.state === 'pending') {
      return reply({ state: 'selection_pending', code: 'OUTBOX_PENDING' });
    }
    if (continuation.state === 'failed') {
      return reply({ state: 'failed', code: 'CLIP_SELECTION_FAILED', message: project.error_message ?? null });
    }
    if (continuation.state === 'review_required') {
      return reply({ state: 'review_required', code: 'CLIP_SELECTION_REVIEW_REQUIRED' });
    }
    if (continuation.state === 'unavailable') {
      return reply({ state: 'unavailable' });
    }
  }

  const currentContext = selectionContextIdentity({
    clip_preferences: project.clip_preferences,
    notes: project.notes,
    semantic_genre_receipt: project.semantic_genre_receipt,
  });

  let transcript: any = null;
  let transcriptLoaded = false;
  const loadTranscript = async () => {
    if (!transcriptLoaded) {
      transcriptLoaded = true;
      transcript = await db.collection('transcripts').findOne(
        { project_id: project.id, user_id: userId },
        { maxTimeMS: 500 }
      );
    }
    return transcript;
  };

  // Standalone durable clip_selection_jobs (when continuation is absent):
  // Bind strictly to current owner, project, source_url, context, and transcript
  // receipt. Never pick among multiple jobs by timestamp alone; ambiguous
  // ownership returns unknown, and a stale queued job cannot override a valid
  // completion receipt for a different job.
  let boundJobs: any[] = [];
  if (project.source_url) {
    try {
      const jobsCursor = db.collection('clip_selection_jobs').find(
        { user_id: userId, project_id: project.id },
        { maxTimeMS: 500 }
      );
      const allJobs = typeof jobsCursor?.toArray === 'function'
        ? await jobsCursor.toArray()
        : [];
      for (const job of allJobs) {
        if (
          job &&
          job.source_url === project.source_url &&
          job.context === currentContext &&
          job.source_receipt
        ) {
          const tr = await loadTranscript();
          if (tr && selectionSourceReceiptMatches(job.source_receipt, tr, project.source_url)) {
            boundJobs.push(job);
          }
        }
      }
    } catch {
      return reply({ state: 'unavailable' });
    }
  }

  const receipt = project.selection_completion_receipt;
  const receiptFenceValid = Boolean(
    receipt &&
    receipt.version === 1 &&
    typeof receipt.fence === 'string' &&
    receipt.fence === project.clip_selection_fence
  );

  // If a valid completion receipt identifies a bound completed job, a stale
  // same-context queued job must not override that newer completion.
  if (receiptFenceValid && receipt.selection_job_id) {
    const completedByReceipt = boundJobs.find(
      (j) => j.id === receipt.selection_job_id && j.status === 'completed'
    );
    if (completedByReceipt) {
      boundJobs = [completedByReceipt];
    }
  }

  if (boundJobs.length === 1) {
    const soleJob = boundJobs[0];
    if (soleJob.status === 'queued' || soleJob.status === 'processing') {
      return reply({ state: 'selection_pending' });
    }
    if (!receiptFenceValid || receipt.selection_job_id !== soleJob.id) {
      if (soleJob.status === 'failed') {
        return reply({
          state: 'failed',
          code: typeof soleJob.result_code === 'string' ? soleJob.result_code : 'CLIP_SELECTION_FAILED',
        });
      }
      if (soleJob.status === 'review_required') {
        return reply({
          state: 'review_required',
          code: typeof soleJob.result_code === 'string' ? soleJob.result_code : 'CLIP_SELECTION_REVIEW_REQUIRED',
        });
      }
    }
  } else if (boundJobs.length > 1) {
    // Multiple bound jobs without an unambiguous immutable current-job pointer:
    // never guess by timestamp alone.
    return reply({ state: 'unknown' });
  }

  const videoStatus = project.video_status;
  if (['queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(String(videoStatus))) {
    return reply({ state: 'source_processing' });
  }
  if (videoStatus === 'failed') {
    return reply({
      state: 'failed',
      code: project.error_code ?? null,
      message: project.error_message ?? null,
    });
  }

  if (!receiptFenceValid) {
    return reply({ state: 'unknown' });
  }
  if (!receipt.source_receipt || !project.source_url) {
    return reply({ state: 'unknown' });
  }
  if (typeof receipt.context !== 'string' || !receipt.context) {
    return reply({ state: 'unknown' });
  }
  if (receipt.context !== currentContext) {
    return reply({ state: 'review_required', code: 'CLIP_SELECTION_CONTEXT_CHANGED' });
  }
  if (
    (project.processing_attempt_id ?? null) !== (receipt.processing_attempt_id ?? null) ||
    (project.processing_completed_run_token ?? null) !== (receipt.processing_run_token ?? null)
  ) {
    return reply({ state: 'unknown' });
  }
  if (!receipt.processing_attempt_id && !receipt.processing_run_token && !receipt.selection_job_id) {
    return reply({ state: 'unknown' });
  }

  try {
    const tr = await loadTranscript();
    if (!tr || !selectionSourceReceiptMatches(receipt.source_receipt, tr, project.source_url)) {
      return reply({ state: 'review_required', code: 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED' });
    }
  } catch {
    return reply({ state: 'unavailable' });
  }

  if (receipt.outcome === 'completed_empty' && receipt.saved_count === 0) {
    return reply({ state: 'completed_empty', savedCount: 0 });
  }
  if (receipt.outcome === 'completed' && typeof receipt.saved_count === 'number' && receipt.saved_count > 0) {
    return reply({ state: 'completed', savedCount: receipt.saved_count });
  }
  return reply({ state: 'unknown' });
}
/** Owned immutable pointer lookup. Status errors never turn a saved request
 * into permission for a second selection. No provider, writes or wallet work. */
export async function withCoreSelectionStatus<T extends Record<string,any>>(db:Db,userId:string,projects:T[]):Promise<T[]>{
 const capability=coreSelectionContinuationEnabled()&&coreProcessingDispatchEnabled()&&clipSelectionDispatchEnabled();
 return Promise.all(projects.map(async project=>{
  if(project.user_id!==userId)return project;
  const base={...project,automatic_export_capable:capability&&automaticOneExportEnabled()&&finalSpeechAdmissionEnabled()&&process.env.VIREO_RENDER_ADMISSION_V1==='1'&&project.project_type!=='subtitles',core_selection_capable:capability&&project.project_type!=='subtitles'},intent=project.core_selection_continuation;
  if(!intent||intent.sourceUrl!==project.source_url||!intent.attemptId)return base;
  if(project.processing_attempt_id&&project.processing_attempt_id!==intent.attemptId&&project.core_processing_dispatch?.attemptId!==intent.attemptId)return base;
  const status=(state:string,jobId?:string)=>({...base,core_selection_status:{attemptId:intent.attemptId,state,...(jobId?{selectionJobId:jobId}:{})}});
  try{
   const key=crypto.createHash('sha256').update(JSON.stringify([userId,project.id,intent.attemptId])).digest('hex');
   const outbox=await db.collection('core_selection_outbox').findOne({_id:key as any,user_id:userId,project_id:project.id},{maxTimeMS:500});
   if(!outbox)return status(['queued','processing','transcribing','uploaded'].includes(project.video_status)?'pending':'unavailable');
   if(outbox.status==='review_required')return status('review_required');
   if(outbox.status==='pending')return status('pending');
   if(outbox.status!=='delivered'||typeof outbox.selection_job_key!=='string')return status('unavailable');
   const job=await db.collection('clip_selection_jobs').findOne({_id:outbox.selection_job_key as any,user_id:userId,project_id:project.id},{maxTimeMS:500});
   if(!job||job.id!==outbox.selection_job_id||job.source_url!==project.source_url)return status('unavailable');
   const automatic=job.automatic_export?await db.collection('automatic_export_outbox').findOne({selection_job_id:job.id,user_id:userId,project_id:project.id},{maxTimeMS:500}):null;
   if(automatic?.status==='queued'&&automatic.clip_id){const savedClip=await db.collection('clips').findOne({id:automatic.clip_id,user_id:userId,project_id:project.id},{maxTimeMS:500});return {...status('completed',job.id),automatic_export_status:{state:'queued',clipId:automatic.clip_id,renderStatus:savedClip?.render_status??'unavailable'}};}
   if(selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes,semantic_genre_receipt:project.semantic_genre_receipt})!==job.context)return status('review_required',job.id);
   const transcript=await db.collection('transcripts').findOne({project_id:project.id,user_id:userId},{maxTimeMS:500});
   if(!transcript||!selectionSourceReceiptMatches(job.source_receipt,transcript,project.source_url))return status('review_required',job.id);
   const result=status(['queued','processing','completed','failed','review_required'].includes(job.status)?job.status:'unavailable',job.id);
   if(!job.automatic_export)return result;
   const clip=automatic?.clip_id?await db.collection('clips').findOne({id:automatic.clip_id,user_id:userId,project_id:project.id},{maxTimeMS:500}):null;
   return {...result,automatic_export_status:{state:automatic?.status??'pending',...(automatic?.clip_id?{clipId:automatic.clip_id,renderStatus:clip?.render_status??'unavailable'}:{})}};
  }catch{return status('unavailable');}
 }));
}
