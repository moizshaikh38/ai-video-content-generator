import {findRenderSubmission, renderSubmissionKey, type RenderSubmissionIntent} from './renderSubmissionRepository.js';
import crypto from 'node:crypto';
import type {Db, MongoClient, ClientSession} from 'mongodb';
import {getMongoClient, getMongoDb} from '../mongoClient.js';
import {AppError} from '../../types/index.js';
import {editorRenderSnapshot, type EditorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import {selectionSourceReceiptMatches} from '../../shared/selectionSourceReceipt.js';
import {assertPanelViewsAssigned} from '../../shared/panelLayouts.js';
import {expandSceneLayoutProject} from '../../shared/sceneLayoutOverrides.js';

export interface RenderAdmissionInput {
  submission?: RenderSubmissionIntent;
  clipId: string;
  userId: string;
  expectedRenderVersion: number;
  expectedEditorVersion: number;
  expectedEditorProject: EditorRenderSnapshot | null;
  settings?: {caption_enabled?: boolean; caption_style?: string; render_resolution?: string};
}
const changed = () => new AppError('Clip or editor changed before the render was queued. Save and retry.',409,'RENDER_INPUT_CHANGED');
const revision = (value: unknown) => value === undefined || value === null ? 1 : Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : NaN;

/** Atomic single-flight admission with optional durable submission receipts. Existing
 * controller entitlement/quota and live source-object checks remain required.
 * No fallback on standalone DBs, transaction failure or commit uncertainty.
 * The owning clip is the contention document shared with save/delete/completion.
 */
export async function admitRenderJob(client: MongoClient, db: Db, input: RenderAdmissionInput) {
  validateRenderAdmissionInput(input);
  const session = client.startSession();
  try {
    const receipt = await session.withTransaction(async () => {
      return admitRenderJobInTransaction(db,session,input);
    },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10_000});
    if (!receipt?.job?.id) throw new Error('Render admission did not return a committed job receipt.');
    return receipt;
  } catch (error: any) {
    // A concurrent same-key commit or unknown commit outcome can only recover
    // the same durable receipt. Never generate a new identity or fall back.
    if (input.submission) {
      const prior = await findRenderSubmission(db,input.userId,input.clipId,input.submission);
      if (prior) return prior;
    }
    throw error;
  } finally {await session.endSession();}
}

export function assertRenderAdmissionEnabled(): void {
  // Old worker builds can claim queued rows without V1 revision fencing. Never
  // enable this during a mixed-version rollout. See docs/render-admission-rollout.md.
  if (process.env.VIREO_RENDER_ADMISSION_V1 !== '1') {
    throw new AppError('Transactional render admission is not enabled for this deployment.',503,'RENDER_ADMISSION_NOT_ENABLED');
  }
}

export async function enqueueRenderJob(input: RenderAdmissionInput) {
  assertRenderAdmissionEnabled();
  return admitRenderJob(await getMongoClient(),await getMongoDb(),input);
}

function validateRenderAdmissionInput(input:RenderAdmissionInput){
  if (![input.clipId,input.userId].every(v=>typeof v==='string'&&v.trim()) ||
      !Number.isSafeInteger(input.expectedRenderVersion) || input.expectedRenderVersion < 1 || input.expectedRenderVersion >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(input.expectedEditorVersion) || input.expectedEditorVersion < 1) throw changed();
  if (input.submission && (input.submission.expectedRenderVersion!==input.expectedRenderVersion ||
      input.submission.expectedEditorVersion!==input.expectedEditorVersion || !/^[a-f0-9]{64}$/.test(input.submission.fingerprint))) throw changed();
}

/** Shared admission primitive. Caller must own a snapshot/majority transaction.
 * Allows a Producer edit and its render job to commit or roll back together. */
export async function admitRenderJobInTransaction(db:Db,session:ClientSession,input:RenderAdmissionInput){
  validateRenderAdmissionInput(input);
  if (input.submission) {
    const prior = await findRenderSubmission(db,input.userId,input.clipId,input.submission,session);
    if (prior) return prior;
  }
  const clip = await db.collection('clips').findOne({id:input.clipId,user_id:input.userId},{session});
  if (!clip) throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
  if (clip.editor_project_sync_pending || revision(clip.render_version)!==input.expectedRenderVersion || revision(clip.editor_version)!==input.expectedEditorVersion) throw changed();
  const editor = await db.collection('editor_projects').findOne({clip_id:input.clipId,user_id:input.userId},{session});
  const editorSnapshot = editorRenderSnapshot(editor);
  if (JSON.stringify(editorSnapshot)!==JSON.stringify(input.expectedEditorProject)) throw changed();
  if (editor) {
    assertPanelViewsAssigned(expandSceneLayoutProject(editor));
    const fence = await db.collection('editor_projects').updateOne({id:editor.id,clip_id:input.clipId,user_id:input.userId,version:editor.version},{$inc:{render_admission_serial:1}},{session});
    if (fence.matchedCount!==1) throw changed();
  }
  const project = await db.collection('projects').findOne({id:clip.project_id,user_id:input.userId},{session});
  const transcript = await db.collection('transcripts').findOne({project_id:clip.project_id,user_id:input.userId},{session});
  if (!project || !transcript || clip.source_storage_path!==project.source_url || !selectionSourceReceiptMatches(clip.selection_source_receipt,transcript,project.source_url)) {
    throw new AppError('Source or transcript changed before the render was queued. Review before retrying.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  }
  const active = await db.collection('render_jobs').findOne({clip_id:input.clipId,user_id:input.userId,status:{$in:['queued','processing','uploading']}},{session});
  if (active) throw new AppError('A render job is already queued or running for this clip.',409,'RENDER_ALREADY_ACTIVE');
  // Also reject a live legacy clip lease even if its job cannot be found.
  if (['rendering','uploading'].includes(clip.render_status)) throw new AppError('Clip has an active render state. Wait for recovery before retrying.',409,'RENDER_ALREADY_ACTIVE');
  const now = new Date();
  const renderVersion = input.expectedRenderVersion + 1;
  const settings: Record<string, unknown> = {};
  if (input.settings?.caption_enabled !== undefined) settings.caption_enabled=Boolean(input.settings.caption_enabled);
  if (input.settings?.caption_style !== undefined) settings.caption_style=input.settings.caption_style;
  if (input.settings?.render_resolution !== undefined) settings.render_resolution=input.settings.render_resolution;
  const updated = await db.collection('clips').updateOne({id:input.clipId,user_id:input.userId,editor_project_sync_pending:null,
    $expr:{$and:[{$eq:[{$ifNull:['$render_version',1]},input.expectedRenderVersion]},{$eq:[{$ifNull:['$editor_version',1]},input.expectedEditorVersion]}]}},
    {$set:{...settings,render_status:'queued',render_version:renderVersion,editor_version:input.expectedEditorVersion,render_error_code:null,render_error_message:null,
      rendered_editor_version:editorSnapshot?.version??null,rendered_editor_saved_at:editor?.updated_at??null,updated_at:now}},{session});
  if (updated.matchedCount!==1) throw changed();
  const job = {id:crypto.randomUUID(),clip_id:input.clipId,user_id:input.userId,status:'queued',stage:'queued',progress:0,attempts:0,max_attempts:3,
    worker_id:null,locked_at:null,next_retry_at:null,render_version:renderVersion,editor_version:input.expectedEditorVersion,
    admission_version:1,editor_project_snapshot:editorSnapshot,created_at:now,updated_at:now};
  await db.collection('render_jobs').insertOne(job,{session});
  if (input.submission) {
    await db.collection<any>('render_submissions').insertOne({
      _id:renderSubmissionKey(input.userId,input.submission.id),id:input.submission.id,user_id:input.userId,
      clip_id:input.clipId,version:1,fingerprint:input.submission.fingerprint,
      receipt:{job,renderVersion},created_at:now,updated_at:now,
    },{session});
  }
  return {job,renderVersion,replayed:false};

}
