import crypto from 'node:crypto';
import type {Db, ClientSession} from 'mongodb';
import {getMongoDb} from '../mongoClient.js';
import {AppError, isValidUUID} from '../../types/index.js';

export interface RenderSubmissionIntent {
  id: string;
  fingerprint: string;
  expectedRenderVersion: number;
  expectedEditorVersion: number;
}
const conflict = () => new AppError('This submission key belongs to different render inputs. Resolve the saved request before starting another render.', 409, 'RENDER_SUBMISSION_CONFLICT');
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) < Number.MAX_SAFE_INTEGER;
export function parseRenderSubmission(body: any, clipId: string, editorProjectId?: string): RenderSubmissionIntent | undefined {
  if (body?.cancel_only !== undefined && (body.cancel_only !== true || body.submission_id===undefined || body.recover_only!==undefined)) throw new AppError('Closing a request requires its saved submission key.',400,'INVALID_RENDER_SUBMISSION');
  if (body?.recover_only !== undefined && (body.recover_only !== true || body.submission_id===undefined)) throw new AppError('Recovery requires a saved submission key.',400,'INVALID_RENDER_SUBMISSION');
  if (body?.submission_id === undefined) {
    if (body?.expected_render_version !== undefined || body?.expected_editor_version !== undefined) throw new AppError('A submission key is required with render preconditions.',400,'INVALID_RENDER_SUBMISSION');
    return undefined;
  }
  if (typeof body.submission_id !== 'string' || !isValidUUID(body.submission_id) ||
      !validRevision(body.expected_render_version) || !validRevision(body.expected_editor_version) ||
      (body.caption_enabled !== undefined && typeof body.caption_enabled !== 'boolean') ||
      (body.caption_style !== undefined && (typeof body.caption_style !== 'string' || !body.caption_style.trim())) ||
      (body.render_resolution !== undefined && !['720p','1080p','1440p','2160p'].includes(body.render_resolution)) ||
      body.resolution !== undefined) {
    throw new AppError('A valid submission key and exact saved render/editor revisions are required.',400,'INVALID_RENDER_SUBMISSION');
  }
  const payload = {operation:editorProjectId?'editor-project-render-v1':'clip-render-v1',...(editorProjectId?{editorProjectId}:{}),clipId,renderVersion:body.expected_render_version,editorVersion:body.expected_editor_version,
    caption_enabled:body.caption_enabled ?? null,caption_style:body.caption_style ?? null,render_resolution:body.render_resolution ?? null};
  return {id:body.submission_id.toLowerCase(),expectedRenderVersion:body.expected_render_version,expectedEditorVersion:body.expected_editor_version,
    fingerprint:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
export function renderSubmissionKey(userId: string, submissionId: string): string {
  return crypto.createHash('sha256').update(JSON.stringify(['render-submission-v1',userId,submissionId])).digest('hex');
}

/** Immutable receipt lookup. No TTL, automatic resend, new job or worker launch.
 * A deleted clip never becomes a new admission through its historical receipt.
 */
export async function findRenderSubmission(db: Db, userId: string, clipId: string, intent: RenderSubmissionIntent, session?: ClientSession): Promise<{job:any;renderVersion:number;replayed:true} | null> {
  const record = await db.collection<any>('render_submissions').findOne({_id:renderSubmissionKey(userId,intent.id),user_id:userId},{session});
  if (!record) return null;
  if (record.clip_id !== clipId || record.fingerprint !== intent.fingerprint) throw conflict();
  const clip = await db.collection('clips').findOne({id:clipId,user_id:userId},{session,projection:{id:1}});
  if (!clip) throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
  if(record.version===1&&record.state==='cancelled')throw new AppError('This saved request was closed before admission. No render was started for this key.',409,'RENDER_SUBMISSION_CANCELLED');
  const job=record.receipt?.job,renderVersion=record.receipt?.renderVersion;
  if (record.version!==1 || !job || typeof job.id!=='string' || !isValidUUID(job.id) || job.clip_id!==clipId || job.user_id!==userId ||
      !validRevision(renderVersion) || renderVersion!==intent.expectedRenderVersion+1 || job.render_version!==renderVersion || job.editor_version!==intent.expectedEditorVersion) {
    throw new AppError('The saved render submission receipt could not be verified. No new render was started.',503,'RENDER_SUBMISSION_UNVERIFIED');
  }
  return {job,renderVersion,replayed:true};
}
export async function lookupRenderSubmission(userId: string, clipId: string, intent?: RenderSubmissionIntent) {
  if (!intent) return null;
  return findRenderSubmission(await getMongoDb(),userId,clipId,intent);
}
