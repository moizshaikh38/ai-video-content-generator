import {getMongoDb} from '../db/mongoClient.js';
import type {Db} from 'mongodb';
import {AppError, type ClipRecord} from '../types/index.js';
import {editorRenderSnapshot} from '../shared/editorRenderSnapshot.js';

const stale = () => new AppError('The saved render does not match the current editor inputs. Render again before previewing or downloading.', 409, 'RENDER_INPUT_CHANGED');
const unverified = () => new AppError('Saved render provenance is incomplete. Render again before previewing or downloading.', 409, 'RENDER_FRESHNESS_UNVERIFIED');
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Read-only signing guard. Check the completed job and saved editor, then read
 * the clip again to detect a save/admission interleaved with those reads. The
 * caller signs the captured immutable attempt key, never a mutable latest key.
 * This does not revoke URLs or prevent edits after the final read.
 */
export async function assertSavedRenderCurrent(db: Db, clip: ClipRecord, userId: string): Promise<void> {
  if (clip.user_id !== userId) throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
  if ((clip as any).editor_project_sync_pending) throw stale();
  const job = clip.latest_job;
  const renderVersion = clip.render_version ?? 1;
  const editorVersion = clip.editor_version ?? 1;
  if (!job || !validRevision(job.render_version) || !validRevision(job.editor_version) ||
      job.editor_project_snapshot === undefined) throw unverified();
  if (job.user_id !== userId || job.clip_id !== clip.id || job.status !== 'completed' ||
      job.render_version !== renderVersion || job.editor_version !== editorVersion) throw stale();
  const saved = job.editor_project_snapshot;
  if (saved !== null && (typeof saved.id !== 'string' || !validRevision(saved.version) ||
      typeof saved.digest !== 'string' || !/^[a-f0-9]{64}$/.test(saved.digest))) throw unverified();
  const editor = await db.collection('editor_projects').findOne({clip_id: clip.id, user_id: userId});
  const actual = editorRenderSnapshot(editor);
  if (saved === null ? actual !== null : !actual || actual.id !== saved.id || actual.version !== saved.version || actual.digest !== saved.digest) throw stale();
  const current = await db.collection('clips').findOne({id: clip.id, user_id: userId});
  if (!current) throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
  if (current.id !== clip.id || current.user_id !== userId || current.editor_project_sync_pending || current.render_status !== 'ready' ||
      (current.render_version ?? 1) !== renderVersion || (current.editor_version ?? 1) !== editorVersion ||
      current.output_storage_path !== clip.output_storage_path || current.source_storage_path !== clip.source_storage_path ||
      current.project_id !== clip.project_id ||
      canonical(current.selection_source_receipt) !== canonical((clip as any).selection_source_receipt)) throw stale();
}

/** Compatibility is default: enabling this guard can deny historical outputs
 * with incomplete provenance. Only an explicit release decision may enable it
 * after the compatibility plan in docs/render-freshness-rollout.md is approved.
 */
export async function enforceSavedRenderFreshness(clip: ClipRecord, userId: string): Promise<void> {
  if (process.env.VIREO_SAVED_RENDER_FRESHNESS_V1 !== '1') return;
  await assertSavedRenderCurrent(await getMongoDb(), clip, userId);
}
