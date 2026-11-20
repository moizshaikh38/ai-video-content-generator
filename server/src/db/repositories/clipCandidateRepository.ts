import {selectionContextIdentity} from '../../shared/selectionContextIdentity.js';
import {selectionSourceReceiptMatches, type SelectionSourceReceipt} from '../../shared/selectionSourceReceipt.js';
import crypto from 'node:crypto';
import { AppError } from '../../types/index.js';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { validateRecord } from '../schemaValidation.js';

/** Replace suggestions atomically while preserving candidates the user selected. */
export async function replaceSuggestedCandidates(userId: string, projectId: string,
  candidates: Array<Record<string, unknown>>, selectionReceipt?: SelectionSourceReceipt, expectedContextIdentity?: string) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      if (expectedContextIdentity !== undefined) {
        if (selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes}) !== expectedContextIdentity) {
          throw new AppError('Clip settings or notes changed during analysis. Existing suggestions were kept. Run analysis again with the current settings.',409,'CLIP_SELECTION_CONTEXT_CHANGED');
        }
        // Reading a Mongo snapshot alone does not fence a concurrent project
        // edit. A real write makes that race conflict/retry; the retry checks
        // current intent before deleting any existing candidate rows.
        await db.collection('projects').updateOne({id:projectId,user_id:userId},{$set:{clip_selection_fence:crypto.randomUUID()}},{session});
      }
      if (selectionReceipt) {
        const transcript = await db.collection('transcripts').findOne({project_id:projectId,user_id:userId},{session});
        if (!transcript || !selectionSourceReceiptMatches(selectionReceipt,transcript,project.source_url)) {
          throw new AppError('Source or transcript changed before suggestions could be saved. No stale suggestions were promoted.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
        }
      }
      const collection = db.collection('clip_candidates');
      const selected = await collection.find({ project_id: projectId, user_id: userId, status: 'selected' }, { session }).toArray();
      const selectedKeys = new Set(selected.map((row) => `${row.start_segment_index}-${row.end_segment_index}`));
      const now = new Date();
      const rows = candidates.filter((candidate) => !selectedKeys.has(
        `${candidate.start_segment_index}-${candidate.end_segment_index}`)).map((candidate) => ({
        ...candidate, id: crypto.randomUUID(), project_id: projectId, user_id: userId,
        status: 'suggested', metadata: candidate.metadata || {}, created_at: now, updated_at: now,
      }));
      for (const row of rows) validateRecord('clip_candidates', row);
      await collection.deleteMany({ project_id: projectId, user_id: userId,
        status: { $in: ['suggested', 'dismissed'] } }, { session });
      if (rows.length) await collection.insertMany(rows, { session });
      return collection.find({ project_id: projectId, user_id: userId }, { session, projection: { _id: 0 } })
        .sort({ engagement_score: -1 }).toArray();
    });
  } finally {
    await session.endSession();
  }
}
