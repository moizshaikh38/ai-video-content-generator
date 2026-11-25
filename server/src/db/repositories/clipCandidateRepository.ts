import {publishClipSelectionCompletion,type ClipSelectionOwner} from './clipSelectionCompletionRepository.js';
import {DELETION_MARKER_FIELD} from '../../services/deletionAdmissionService.js';
import {selectionContextIdentity} from '../../shared/selectionContextIdentity.js';
import {selectionSourceReceiptMatches, type SelectionSourceReceipt} from '../../shared/selectionSourceReceipt.js';
import crypto from 'node:crypto';
import { AppError } from '../../types/index.js';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { validateRecord } from '../schemaValidation.js';

/** Replace suggestions atomically while preserving candidates the user selected. */
export async function replaceSuggestedCandidates(userId: string, projectId: string,
  candidates: Array<Record<string, unknown>>, selectionReceipt?: SelectionSourceReceipt, expectedContextIdentity?: string,dispatchOwner?:ClipSelectionOwner) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId, [DELETION_MARKER_FIELD]:{$exists:false} }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      const selectionFence = crypto.randomUUID();
      // Contend with deletion admission even when no context receipt was supplied.
      // Snapshot reads alone would allow publication after cleanup had begun.
      const owned=await db.collection('projects').updateOne({id:projectId,user_id:userId,[DELETION_MARKER_FIELD]:{$exists:false}},{$set:{clip_selection_fence:selectionFence}},{session});
      if(owned.matchedCount!==1)throw new AppError('Project is unavailable for clip selection.',409,'PROJECT_DELETION_IN_PROGRESS');
      const resolvedContext = selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes,semantic_genre_receipt:project.semantic_genre_receipt});
      if (expectedContextIdentity !== undefined) {
        if (resolvedContext !== expectedContextIdentity) {
          throw new AppError('Clip settings or notes changed during analysis. Existing suggestions were kept. Run analysis again with the current settings.',409,'CLIP_SELECTION_CONTEXT_CHANGED');
        }

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
      const published=await collection.find({ project_id: projectId, user_id: userId }, { session, projection: { _id: 0 } })
        .sort({ engagement_score: -1 }).toArray();
      if(dispatchOwner){if(dispatchOwner.context!==expectedContextIdentity)throw new AppError('Selection context does not match saved owner.',409,'CLIP_SELECTION_OWNER_CHANGED');await publishClipSelectionCompletion(db,session,userId,projectId,dispatchOwner,published.map(row=>row.id),rows.map(row=>row.id));}
      const completionReceipt = {
        version: 1 as const,
        outcome: published.length === 0 ? ('completed_empty' as const) : ('completed' as const),
        saved_count: published.length,
        suggested_count: rows.length,
        fence: selectionFence,
        selection_job_id: dispatchOwner?.jobId ?? null,
        processing_attempt_id: typeof project.processing_attempt_id === 'string' ? project.processing_attempt_id : null,
        processing_run_token: typeof project.processing_completed_run_token === 'string' ? project.processing_completed_run_token : null,
        context: expectedContextIdentity ?? resolvedContext,
        source_receipt: selectionReceipt ?? null,
        completed_at: now,
      };
      const receiptWrite = await db.collection('projects').updateOne(
        { id: projectId, user_id: userId, [DELETION_MARKER_FIELD]: { $exists: false } },
        { $set: { selection_completion_receipt: completionReceipt } },
        { session }
      );
      if (receiptWrite.matchedCount !== 1) throw new AppError('Project is unavailable for clip selection.', 409, 'PROJECT_DELETION_IN_PROGRESS');
      return published;
    });
  } finally {
    await session.endSession();
  }
}
