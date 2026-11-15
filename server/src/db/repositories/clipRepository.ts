import crypto from 'node:crypto';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { AppError, ClipAspectRatio, ClipCropMode } from '../../types/index.js';

/** Verify relationships and create clip plus initial render job in one transaction. */
export async function createClipWithJob(projectId: string, candidateId: string, userId: string,
  aspectRatio: ClipAspectRatio, cropMode: ClipCropMode,
  options?: { caption_enabled?: boolean; caption_style?: string; caption_config?: any }) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      if (!project.source_url || project.video_status === 'uploading') {
        throw new AppError('Project source video is not uploaded.', 409, 'SOURCE_VIDEO_NOT_FOUND');
      }
      const candidate = await db.collection('clip_candidates').findOne({
        id: candidateId, project_id: projectId, user_id: userId,
      }, { session });
      if (!candidate) throw new AppError('Clip candidate not found.', 404, 'CANDIDATE_NOT_FOUND');
      const start = Number(candidate.start_seconds);
      const end = Number(candidate.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw new AppError('Candidate timestamps are invalid.', 400, 'INVALID_TIMESTAMPS');
      }
      const now = new Date();
      const candidateMeta = (candidate as any)?.metadata || {};
      const layoutMode = candidateMeta.layout_mode || 'track';
      // Candidates analyzed before provenance tracking carry no marker; treat
      // them as 'legacy_unknown' so their layout keeps historical precedence.
      const layoutModeSource = candidateMeta.layout_mode_source || 'legacy_unknown';
      const captionPos = candidateMeta.caption_position || (layoutMode === 'split' ? 'center' : 'bottom');
      const coldOpen = (candidate as any)?.cold_open || candidateMeta.cold_open || null;
      const clip = {
        id: crypto.randomUUID(), project_id: projectId, candidate_id: candidateId, user_id: userId,
        start_seconds: start, end_seconds: end, duration_seconds: end - start,
        aspect_ratio: aspectRatio, crop_mode: cropMode, render_status: 'queued',
        crop_config: {
          mode: cropMode,
          layout_mode: layoutMode,
          layout_mode_source: layoutModeSource,
        },
        caption_position: captionPos,
        caption_enabled: options?.caption_enabled !== undefined ? Boolean(options.caption_enabled) : true,
        // Default presentation: the karaoke preset (large uppercase,
        // word-by-word highlight). The previous default 'hormozi' resolved to
        // no gallery preset and fell through to small static legacy captions
        // (user-reported 15 Nov 2026: captions not clean/appealing vs Opus).
        caption_style: options?.caption_style || 'karaoke',
        caption_config: options?.caption_config || { presetId: 'karaoke' },
        // Carried for the automatic render headline (Opus-parity): burned at
        // render time unless an explicit overlay config opts out.
        title: (candidate as any)?.title || null,
        cold_open: coldOpen,
        source_storage_path: project.source_url, source_object_key: project.source_url,
        output_object_key: null, render_version: 1, editor_version: 1,
        created_at: now, updated_at: now,
      };
      const renderJob = {
        id: crypto.randomUUID(), clip_id: clip.id, user_id: userId,
        status: 'queued', progress: 0, stage: 'queued', attempts: 1,
        created_at: now, updated_at: now,
      };
      await db.collection('clips').insertOne(clip, { session });
      await db.collection('render_jobs').insertOne(renderJob, { session });
      if (candidate.status === 'suggested') await db.collection('clip_candidates').updateOne({
        id: candidateId, project_id: projectId, user_id: userId, status: 'suggested',
      }, { $set: { status: 'selected', updated_at: now } }, { session });
      return {
        clip: { ...clip, created_at: now.toISOString(), updated_at: now.toISOString() },
        renderJob: { ...renderJob, created_at: now.toISOString(), updated_at: now.toISOString() },
      };
    });
  } finally {
    await session.endSession();
  }
}
