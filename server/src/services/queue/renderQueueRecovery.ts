import type {MongoClient, Db} from 'mongodb';
import {renderRetryBudget, renderBudgetExhaustedExpr} from '../../shared/renderRetryBudget.js';

/** Small recoverable batches, exact heartbeat/token snapshot, transactional
 * recheck. Never clear a fresh/replaced lease or revive an exhausted job.
 * Legacy jobs lacking either revision cannot change the clip's displayed state.
 */
export async function recoverRenderQueue(client: MongoClient, db: Db, now: Date, limit = 25): Promise<number> {
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const batchLimit = Number.isSafeInteger(limit) ? Math.min(25, Math.max(1, limit)) : 25;
  const jobs = await db.collection('render_jobs').find({
    // Invalid owner records need separate review, not a guessed owner or a batch
    // full of skipped records that hides recoverable jobs behind them.
    id: {$type: 'string', $regex: /\S/},
    clip_id: {$type: 'string', $regex: /\S/},
    user_id: {$type: 'string', $regex: /\S/},
    $or: [
      {status: {$in: ['processing', 'uploading']}, locked_at: {$lt: cutoff}},
      {status: 'queued', worker_id: null, locked_at: null, $expr: renderBudgetExhaustedExpr},
    ],
  }).sort({created_at: 1}).limit(batchLimit).toArray();
  let recovered = 0;
  for (const snapshot of jobs) {
    if (![snapshot.id, snapshot.clip_id, snapshot.user_id].every(v => typeof v === 'string' && v.trim())) continue;
    const session = client.startSession();
    try {
      let changed = false;
      await session.withTransaction(async () => {
        changed = false;
        const filter = {
          id: snapshot.id, clip_id: snapshot.clip_id, user_id: snapshot.user_id,
          status: snapshot.status, worker_id: snapshot.worker_id ?? null, locked_at: snapshot.locked_at ?? null,
        };
        const job = await db.collection('render_jobs').findOne(filter, {session});
        if (!job) return;
        const budget = renderRetryBudget(job);
        const heldLease = job.status === 'processing' || job.status === 'uploading';
        if (heldLease && !(job.locked_at instanceof Date && job.locked_at < cutoff)) return;
        if (!heldLease && (job.status !== 'queued' || budget.available)) return;
        const retry = heldLease && budget.available;
        const status = retry ? 'queued' : 'failed';
        const errorCode = retry ? 'RENDER_LEASE_EXPIRED' : 'MAX_ATTEMPTS_EXCEEDED';
        const errorMessage = retry
          ? 'The previous worker lease expired. Rendering is queued again.'
          : 'Rendering stopped after its retry budget was exhausted.';
        const update = await db.collection('render_jobs').updateOne(filter, {$set: {
          status, stage: status, worker_id: null, locked_at: null, next_retry_at: null, updated_at: now,
          error_code: errorCode, error_message: errorMessage,
        }}, {session});
        if (update.matchedCount !== 1) return;
        const revisionBound = [job.render_version, job.editor_version].every(v => Number.isSafeInteger(v) && v > 0);
        if (revisionBound) {
          const latest = await db.collection('render_jobs').findOne(
            {clip_id: job.clip_id, user_id: job.user_id}, {session, sort: {created_at: -1, _id: -1}},
          );
          if (latest?.id === job.id) {
            await db.collection('clips').updateOne({
              id: job.clip_id, user_id: job.user_id,
              render_version: job.render_version, editor_version: job.editor_version,
              editor_project_sync_pending: null,
              render_status: {$in: ['queued', 'rendering', 'uploading']},
            }, {$set: {
              render_status: status, render_error_code: errorCode, render_error_message: errorMessage, updated_at: now,
            }}, {session});
          }
        }
        changed = true;
      }, {readPreference: 'primary', readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 10_000});
      if (changed) recovered++;
    } finally {
      await session.endSession();
    }
  }
  return recovered;
}
