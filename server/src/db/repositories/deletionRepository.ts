import { getMongoClient, getMongoDb } from '../mongoClient.js';

/** Remove related records after private object cleanup succeeds. */
export async function deleteProjectRecords(userId: string, projectId: string): Promise<void> {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) return;
      const clips = await db.collection('clips').find({ user_id: userId, project_id: projectId }, { session })
        .project({ id: 1 }).toArray();
      const clipIds = clips.map((clip) => clip.id);
      for (const name of ['transcripts', 'content_outputs', 'clip_candidates', 'clips', 'reframe_tracks', 'project_upload_attempts', 'editor_projects', 'producer_plans']) {
        await db.collection(name).deleteMany({ user_id: userId, project_id: projectId }, { session });
      }
      if (clipIds.length) {
        // Clip-bound records may predate project_id materialization. Keep owner
        // scope and remove these in the same transaction as their parent.
        for(const name of ['render_jobs','editor_projects','producer_plans'])
          await db.collection(name).deleteMany({user_id:userId,clip_id:{$in:clipIds}},{session});
      }
      // Delete project payload, not uncertain worker capacity. Processing/review
      // rows retain their status and worker fence until explicit reconciliation.
      // An allowlist removes source URLs, notes, preferences, transcript receipts,
      // candidate IDs and provider/context details, including future payload keys.
      await db.collection('core_selection_outbox').deleteMany({ user_id: userId, project_id: projectId }, { session });
      for (const name of ['core_processing_jobs', 'clip_selection_jobs']) {
        await db.collection(name).updateMany({ user_id: userId, project_id: projectId }, [{ $replaceWith: {
          _id: '$_id', id: '$id', version: '$version', user_id: '$user_id', project_id: '$project_id',
          attempt_id: '$attempt_id', worker_id: '$worker_id', created_at: '$created_at', claimed_at: '$claimed_at',
          finished_at: '$finished_at', status: { $cond: [{ $eq: ['$status', 'queued'] }, 'failed', '$status'] },
          result_code: 'PROJECT_DELETED', project_deleted_at: '$$NOW', updated_at: '$$NOW',
        } }], { session });
      }
      await db.collection('projects').deleteOne({ id: projectId, user_id: userId }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function deleteClipRecords(userId: string, clipId: string): Promise<void> {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const clip = await db.collection('clips').findOne({ id: clipId, user_id: userId }, { session });
      if (!clip) return;
      await db.collection('render_jobs').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('reframe_tracks').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('editor_projects').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('producer_plans').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('clips').deleteOne({ id: clipId, user_id: userId }, { session });
    });
  } finally {
    await session.endSession();
  }
}
