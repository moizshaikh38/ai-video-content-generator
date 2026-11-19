import type {Db, MongoClient} from 'mongodb';

export interface QueuedRenderSnapshot {
  id: string;
  clip_id: string;
  user_id: string;
  prelease_failures?: unknown;
  attempts?: unknown;
  next_retry_at?: unknown;
}

/** Fence retries and terminal outcomes to the exact unclaimed pre-lease snapshot.
 * A second sweeper observing the same failure count cannot spend that count twice.
 */
export function queuedRenderSnapshotFilter(snapshot: QueuedRenderSnapshot) {
  return {
    id: snapshot.id,
    clip_id: snapshot.clip_id,
    user_id: snapshot.user_id,
    status: 'queued',
    worker_id: null,
    locked_at: null,
    prelease_failures: {$eq: snapshot.prelease_failures ?? null},
    attempts: {$eq: snapshot.attempts ?? null},
    next_retry_at: {$eq: snapshot.next_retry_at ?? null},
  };
}

/** A terminal pre-lease outcome may update the displayed clip state only when
 * this is still its latest job and both revisions still match. No partial-write
 * fallback: transaction failure preserves the queue for later recovery.
 */
export async function failQueuedRenderJob(
  client: MongoClient,
  db: Db,
  snapshot: QueuedRenderSnapshot,
  failure: {code: string | number; message: string},
  now: Date,
): Promise<boolean> {
  if (![snapshot.id, snapshot.clip_id, snapshot.user_id].every(v => typeof v === 'string' && v.trim())) {
    throw new Error('Queued render owner identity is required.');
  }
  const session = client.startSession();
  try {
    const changed = await session.withTransaction(async () => {
      const filter = queuedRenderSnapshotFilter(snapshot);
      const job = await db.collection('render_jobs').findOne(filter, {session});
      if (!job) return false;
      const updated = await db.collection('render_jobs').updateOne(filter, {$set: {
        status: 'failed', stage: 'failed', next_retry_at: null,
        error_code: failure.code, error_message: failure.message, updated_at: now,
      }}, {session});
      if (updated.matchedCount !== 1) return false;
      const revisionBound = [job.render_version, job.editor_version].every(v => Number.isSafeInteger(v) && v > 0);
      if (revisionBound) {
        const latest = await db.collection('render_jobs').findOne(
          {clip_id: job.clip_id, user_id: job.user_id},
          {session, sort: {created_at: -1, _id: -1}},
        );
        if (latest?.id === job.id) {
          await db.collection('clips').updateOne({
            id: job.clip_id, user_id: job.user_id,
            render_version: job.render_version, editor_version: job.editor_version,
            editor_project_sync_pending: null, render_status: 'queued',
          }, {$set: {
            render_status: 'failed', render_error_code: failure.code,
            render_error_message: failure.message, updated_at: now,
          }}, {session});
        }
      }
      return true;
    }, {readPreference: 'primary', readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 10_000});
    return changed === true;
  } finally {
    await session.endSession();
  }
}
