import { getMongoClient, getMongoDb } from '../db/mongoClient.js';

/** Deletion admission markers.
 *
 * Deletion has three observable phases: admission (this marker), storage
 * object cleanup, and record removal. Writing the marker BEFORE the storage
 * prefix listing closes the interleaving where a poster/render upload lands
 * after the listing but its publication commits before record removal.
 * Publication paths (poster attempts, fenced render commits) require the
 * parent document to carry no marker, so their writes contend on the same
 * document the admission writes: whichever commit lands first wins, and a
 * publication that loses removes only its own immutable attempt bytes.
 *
 * - Admission is idempotent: retrying a deletion re-marks the same parent.
 * - A failed storage cleanup leaves the marker AND all records in place, so
 *   the parent stays retryable and is never reported deleted early.
 * - Record removal (deletionRepository) deletes the marked documents, so no
 *   marker survives a completed deletion; publication after record removal
 *   already fails on parent absence.
 * - Unknown admission transaction outcomes abort the deletion attempt before
 *   any storage listing; the next request simply re-admits.
 */
export const DELETION_MARKER_FIELD = 'deletion_started_at';

export async function admitClipDeletion(userId: string, clipId: string): Promise<boolean> {
  const db = await getMongoDb();
  const result = await db
    .collection('clips')
    .updateOne({ id: clipId, user_id: userId }, { $set: { [DELETION_MARKER_FIELD]: new Date() } });
  return result.matchedCount === 1;
}

/** A project marker alone cannot fence clip-bound poster/render publication,
 * so project admission marks the project and every clip under it in one
 * transaction. Clip publications update those same clip documents. */
export async function admitProjectDeletion(userId: string, projectId: string): Promise<boolean> {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    let admitted = false;
    await session.withTransaction(async () => {
      const project = await db
        .collection('projects')
        .updateOne({ id: projectId, user_id: userId }, { $set: { [DELETION_MARKER_FIELD]: new Date() } }, { session });
      admitted = project.matchedCount === 1;
      if (!admitted) return;
      await db
        .collection('clips')
        .updateMany({ user_id: userId, project_id: projectId }, { $set: { [DELETION_MARKER_FIELD]: new Date() } }, { session });
    });
    return admitted;
  } finally {
    await session.endSession();
  }
}
