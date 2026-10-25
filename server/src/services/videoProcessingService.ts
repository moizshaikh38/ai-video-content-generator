import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { downloadObjectToFile } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { extractAudioFromVideo } from './audioExtractionService.js';
import { getTranscriptionProviderWithFailover } from './transcription/failoverTranscriptionProvider.js';
import { transcribeAudioFast } from './transcription/chunkedTranscription.js';
import { TranscriptRecord } from '../types/index.js';
import { UsageService } from './usageService.js';
import { ClipRenderService } from './clipRenderService.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';
import { config } from '../config/index.js';
import { assignWordIds } from '../utils/wordIdentityUtils.js';
import { ProjectPosterService } from './projectPosterService.js';

// In-memory set to guard against duplicate concurrent processing runs for the same project
const activeProcessingSet = new Set<string>();

export interface ProcessProjectResult {
  status: 'transcribed' | 'failed';
  transcript?: TranscriptRecord;
  error?: string;
}

/**
 * Checks if a project is currently being processed in memory
 */
export function isProjectProcessingActive(projectId: string): boolean {
  return activeProcessingSet.has(projectId);
}

/**
 * Executes the complete video processing and transcription pipeline:
 * 1. Concurrency guard (locks projectId)
 * 2. Updates project video_status -> 'processing'
 * 3. Streams video from private Cloudflare R2 storage
 * 4. Extracts audio track using FFmpeg into temporary MP3 (with process timeout)
 * 5. Updates project video_status -> 'transcribing'
 * 6. Sends extracted audio to provider-agnostic Speech-to-Text API (Groq / OpenRouter)
 * 7. Upserts transcript into MongoDB
 * 8. Updates project video_status -> 'transcribed'
 * 9. Settles usage reservation on success, or releases on failure
 * 10. Cleans up temporary audio files reliably
 */
export async function processProjectVideo(
  projectId: string,
  userId: string,
  sourceUrl: string,
  processingAttemptId?: string
): Promise<ProcessProjectResult> {
  if (!isMongoConfigured) {
    throw new Error('MongoDB is not configured on the server.');
  }

  if (activeProcessingSet.has(projectId)) {
    throw new Error('Project processing is already in progress.');
  }

  activeProcessingSet.add(projectId);
  return await ownerContext.run(userId, async () => {
    let cleanupAudio: (() => void) | null = null;
    let downloadedVideoPath: string | null = null;

    try {
    // 1. Update status to 'processing'
    logger.info(`Starting video processing for project ${projectId}`, { projectId, userId });
    await dataRepository
      .from('projects')
      .update({ video_status: 'processing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 2. Stream private R2 object to a local scratch file reusing the shared source cache.
    const storagePath = sourceUrl;
    const originalFileName = storagePath.split('/').pop() || 'video.mp4';
    const videoPath = path.join(os.tmpdir(), `vireo-source-${crypto.randomUUID()}${path.extname(originalFileName) || '.mp4'}`);
    downloadedVideoPath = videoPath;
    const sourceResolution = await ClipRenderService.ensureSourceVideo(storagePath, videoPath);
    logger.info(`Source video resolved for project ${projectId} via ${sourceResolution}: ${videoPath}`);

    // 2b. HD poster frame for the dashboard while we have the file locally (best-effort, ~100ms).
    const { data: posterRow } = await dataRepository
      .from('projects')
      .select('source_type, duration_seconds')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (posterRow?.source_type === 'upload') {
      // Fire-and-forget: the poster is a dashboard nicety and must not delay
      // audio extraction/transcription (which are the latency-critical stages).
      ProjectPosterService.generateFromLocalFile(userId, projectId, videoPath, posterRow.duration_seconds)
        .catch((err: any) => logger.warn(`Poster generation failed for project ${projectId}: ${err?.message || err}`));
    }

    // 3. Extract audio via FFmpeg without buffering the video in Node memory.
    // The known duration picks the bitrate up front (one encode), and because long audio is
    // transcribed in parallel windows the full file is not held to the 25 MB single-request cap.
    const extractedAudio = await extractAudioFromVideo(videoPath, originalFileName, {
      durationHintSec: posterRow?.duration_seconds,
      maxAudioBytes: 200 * 1024 * 1024,
    });
    cleanupAudio = extractedAudio.cleanup;

    // 4. Update status to 'transcribing'
    await dataRepository
      .from('projects')
      .update({ video_status: 'transcribing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 5. Transcribe audio with the configured provider, failing over to the
    // alternate provider on transient runtime failures (rate limit, 5xx, timeout).
    const provider = getTranscriptionProviderWithFailover();
    logger.info(`Using transcription provider: ${provider.name}`, { projectId, provider: provider.name });
    const transcription = await transcribeAudioFast(
      provider,
      extractedAudio,
      posterRow?.duration_seconds,
      `${projectId}.mp3`
    );

    // Compute effective duration from audio probe or last transcript segment timestamp
    const effectiveDuration = Number(
      (
        transcription.durationSeconds ||
        (transcription.segments?.length
          ? transcription.segments[transcription.segments.length - 1].end
          : 0)
      ).toFixed(2)
    );

    // 6. Store transcript in MongoDB (upsert to avoid duplicates)
    const transcriptPayload: any = {
      project_id: projectId,
      user_id: userId,
      transcript_text: transcription.text,
      text: transcription.text,
      language: transcription.language,
      duration_seconds: effectiveDuration,
      segments: transcription.segments,
      // Diagnostic: how far the source container's audio stream starts from its video stream.
      // Recorded (not applied) so caption-drift reports can be correlated with the source;
      // see AvStartTimes in audioExtractionService for why no correction is subtracted.
      av_start_offset_sec: extractedAudio.avStartTimes.avStartOffsetSec,
      updated_at: new Date().toISOString(),
    };

    if (Array.isArray(transcription.words) && transcription.words.length > 0) {
      transcriptPayload.words = assignWordIds(transcription.words, projectId);
    }

    logger.info(`Storing transcript for project ${projectId} into 'transcripts' table...`, {
      projectId,
      charCount: transcription.text.length,
      segmentCount: transcription.segments?.length || 0,
      wordCount: transcription.words?.length || 0,
    });

    let { data: savedTranscript, error: saveError } = await dataRepository
      .from('transcripts')
      .upsert(transcriptPayload, { onConflict: 'project_id' })
      .select()
      .single();

    if (saveError) {
      logger.error('Failed to save transcript to MongoDB', {
        projectId,
        error: saveError.message,
      });
      throw new Error(`Failed to save transcript: ${saveError.message}`);
    }

    // 7. Classify video genre locally and enrich project metadata
    const durationMin = Math.max(0.1, effectiveDuration / 60);
    const wordCount = transcription.words?.length || transcription.text.split(/\s+/).filter(Boolean).length;
    const wpm = Math.round(wordCount / durationMin);
    const questionCount = (transcription.text.match(/\?/g) || []).length;
    const questionDensityPerMin = Number((questionCount / durationMin).toFixed(2));

    const genreSuggestion = GenreIntelligenceService.classifyVideoGenreLocally({
      transcriptText: transcription.text,
      wpm,
      durationSeconds: effectiveDuration,
      questionDensityPerMin,
    });

    const { data: project } = await dataRepository
      .from('projects')
      .select('clip_preferences')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    const updatePayload: Record<string, any> = {
      video_status: 'transcribed',
      updated_at: new Date().toISOString(),
    };

    if (effectiveDuration > 0) {
      updatePayload.duration_seconds = effectiveDuration;
    }

    if (project?.clip_preferences) {
      const mode = project.clip_preferences.genreSelectionMode || 'auto';
      if (mode === 'auto' || mode === 'suggested') {
        updatePayload.clip_preferences = {
          ...project.clip_preferences,
          suggested_genre: genreSuggestion.genre,
          genre_confidence: genreSuggestion.confidence,
        };
      }
    }

    await dataRepository
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .eq('user_id', userId);

    // 8. Settle usage reservation atomically using measured audio duration.
    // Billing hardening: before settling, grow the reservation to the measured
    // duration with a fresh ceiling check — a provisional low estimate can
    // never let usage run past the approved quota. A refused extension fails
    // the job (and releases the reservation) rather than over-consuming.
    if (processingAttemptId) {
      const extension = await UsageService.extendReservationToMeasuredDuration(processingAttemptId, effectiveDuration);
      if (!extension.ok && extension.code === 'QUOTA_EXCEEDED') {
        await UsageService.releaseReservation(processingAttemptId, 'Measured duration exceeded remaining quota mid-processing');
        try {
          await dataRepository
            .from('projects')
            .update({
              video_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId)
            .eq('user_id', userId);
        } catch {}
        const quotaErr: any = new Error(
          `Monthly processing quota exceeded mid-run: this video measures ${Math.ceil(effectiveDuration / 60)} minute(s) but ${extension.remainingMinutes.toFixed(1)} remain.`
        );
        quotaErr.code = 'QUOTA_EXCEEDED';
        throw quotaErr;
      }
      await UsageService.settleReservation(
        processingAttemptId,
        effectiveDuration,
        {
          provider: provider.name,
          language: transcription.language,
          segment_count: transcription.segments?.length || 0,
        }
      );
    }

    logger.info(`Project ${projectId} successfully transcribed via ${provider.name}!`, { projectId, provider: provider.name });

    // Genre roadmap Phase 2 (audit F1): optionally build the multimodal timeline
    // (scene cuts, silence, faces, OCR) so clip selection receives real visual and
    // audio signals instead of constants. Fire-and-forget: transcription success
    // must never fail because enrichment did; analyze-clips also works
    // transcript-only when this has not completed yet.
    // Gaming advantage: for gaming-genre projects with the flag on, run VLM
    // game-event detection on the local source (HUD reads + reaction spikes).
    // Fire-and-forget — absence of events never affects clipping.
    try {
      const { data: prefsRow } = await dataRepository
        .from('projects')
        .select('clip_preferences')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
      const genre = prefsRow?.clip_preferences?.genre;
      if (config.gameEventsAuto && (genre === 'gaming' || genre === 'sports')) {
        const { GameEventService } = await import('./gameEventService.js');
        const duration = effectiveDuration > 0 ? effectiveDuration : 60;
        GameEventService.analyzeLocalVideo(projectId, userId, videoPath, 0, Math.min(duration, 600))
          .catch(() => undefined);
      }
    } catch {
      // Optional enrichment.
    }

    if (config.multimodalAutoAnalysis) {
      try {
        const { VideoAnalysisWorker } = await import('./multimodal/videoAnalysisWorker.js');
        const job = await VideoAnalysisWorker.enqueueJob(projectId, userId);
        logger.info(`[MultimodalAuto] Enqueued timeline analysis job ${job?.id ?? '(unknown)'} for project ${projectId}`);
        setImmediate(async () => {
          try {
            await VideoAnalysisWorker.processNext();
          } catch (e: any) {
            logger.warn(`[MultimodalAuto] Background analysis run notice for project ${projectId}: ${e.message}`);
          }
        });
      } catch (mmErr: any) {
        logger.warn(`[MultimodalAuto] Could not enqueue multimodal analysis for project ${projectId}: ${mmErr.message}`);
      }
    }

    return {
      status: 'transcribed',
      transcript: savedTranscript as TranscriptRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Video processing failed for project ${projectId}`, {
      projectId,
      userId,
      error: message,
    });

    // Safely release the usage quota reservation so failed jobs never consume quota
    if (processingAttemptId) {
      await UsageService.releaseReservation(processingAttemptId, message || 'Processing failed');
    }

    // Mark project status as 'failed' in database
    try {
      await dataRepository
        .from('projects')
        .update({
          video_status: 'failed',
          error_message: message || 'Video processing failed.',
        })
        .eq('id', projectId)
        .eq('user_id', userId);
    } catch (updateErr) {
      logger.error('Failed to set video_status to failed', {
        projectId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    return {
      status: 'failed',
      error: message || 'Video processing failed.',
    };
  } finally {
    if (cleanupAudio) {
      try {
        cleanupAudio();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (downloadedVideoPath) await fs.rm(downloadedVideoPath, { force: true }).catch(() => undefined);
    activeProcessingSet.delete(projectId);
  }
  });
}
