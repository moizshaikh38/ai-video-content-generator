import {workLifecycle} from './queue/workLifecycle.js';
import {observeTranscriptionInputs} from './transcription/transcriptionInputObserver.js';
import {assertTranscriptReusable} from './transcriptSourceBindingService.js';
import {audioInputSha256,transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
import {sourceObjectReceiptMatches,type SourceObjectReceipt} from '../shared/sourceObjectReceipt.js';
import {AppError} from '../types/index.js';
import {assessTranscriptQuality,assertTranscriptUsable,normalizeSourceLanguage} from './transcription/transcriptQuality.js';
import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { headObject } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { extractAudioFromVideo } from './audioExtractionService.js';
import {createTierTranscriptionProvider,freezeTierSelection} from './transcription/tierTranscriptionPolicy.js';
import { getTranscriptionProviderWithFailover } from './transcription/failoverTranscriptionProvider.js';
import { transcribeAudioFast } from './transcription/chunkedTranscription.js';
import { TranscriptRecord, CreditReservationRecord } from '../types/index.js';
import { UsageService } from './usageService.js';
import { ClipRenderService } from './clipRenderService.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';
import { EntitlementService } from './entitlementService.js';
import { CreditWalletService } from './creditWalletService.js';
import { CreditPricingService } from './billing/creditPricingService.js';
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
export async function processProjectVideo(projectId:string,userId:string,sourceUrl:string,processingAttemptId?:string):Promise<ProcessProjectResult>{
 return workLifecycle.run('video-processing',()=>executeProjectVideo(projectId,userId,sourceUrl,processingAttemptId));
}
async function executeProjectVideo(
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
      .update({ video_status: 'processing', error_code: null, error_message: null })
      .eq('id', projectId)
      .eq('user_id', userId);

    const db = await getMongoDb();
    const currentProject=await db.collection('projects').findOne({id:projectId,user_id:userId});
    if(!currentProject || currentProject.source_url!==sourceUrl)throw new AppError('Project source changed before transcription. Reload the project.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');

    // 1b. Check if valid transcript already exists for this project and user (Cross-workflow reuse at 0 credits)
    const existingTranscript = await db.collection<TranscriptRecord>('transcripts').findOne({
      project_id: projectId,
      user_id: userId,
    });

    if (existingTranscript && (existingTranscript.segments?.length || existingTranscript.transcript_text)) {
      await assertTranscriptReusable(existingTranscript,sourceUrl);
      logger.info(`Reusing existing transcript for project ${projectId}`, { projectId, userId });
      const effectiveDuration = Number(
        existingTranscript.duration_seconds ||
        (existingTranscript.segments?.length
          ? existingTranscript.segments[existingTranscript.segments.length - 1].end
          : 0)
      );

      // Validate source duration against plan entitlement limit
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (!entitlements.isUnlimited && effectiveDuration > entitlements.limits.maxUploadDurationSeconds) {
        if (processingAttemptId) {
          await CreditWalletService.releaseReservation(processingAttemptId, 'Video duration exceeds plan limit').catch(() => undefined);
          await UsageService.releaseReservation(processingAttemptId, 'Video duration exceeds plan limit').catch(() => undefined);
        }
        const durationErr: any = new Error(
          `Video duration (${Math.round(effectiveDuration)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`
        );
        durationErr.code = 'DURATION_LIMIT_EXCEEDED';
        throw durationErr;
      }

      // Settle reservation at 0 credits
      if (processingAttemptId) {
        await CreditWalletService.settleReservation(
          processingAttemptId,
          0,
          {
            projectId,
            provider: 'reused',
            language: existingTranscript.language,
            segment_count: existingTranscript.segments?.length || 0,
            duration_seconds: effectiveDuration,
            isReusedTranscript: true,
          }
        );
        try {
          await UsageService.settleReservation(processingAttemptId, 0, { reason: 'Reused transcript' }).catch(() => undefined);
        } catch {}
      }

      await dataRepository
        .from('projects')
        .update({
          video_status: 'transcribed',
          duration_seconds: effectiveDuration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('user_id', userId);

      return {
        status: 'transcribed',
        transcript: existingTranscript as TranscriptRecord,
      };
    }

    // 2. Stream private R2 object to a local scratch file reusing the shared source cache.
    const storagePath = sourceUrl;
    const originalFileName = storagePath.split('/').pop() || 'video.mp4';
    const videoPath = path.join(os.tmpdir(), `vireo-source-${crypto.randomUUID()}${path.extname(originalFileName) || '.mp4'}`);
    downloadedVideoPath = videoPath;
    const snapshot:{receipt?:SourceObjectReceipt}={};
    const sourceResolution = await ClipRenderService.ensureSourceVideo(storagePath, videoPath,{snapshotOut:snapshot});
    logger.info(`Source video resolved for project ${projectId} via ${sourceResolution}: ${videoPath}`);

    // 2b. HD poster frame for the dashboard while we have the file locally (best-effort, ~100ms).
    const { data: posterRow } = await dataRepository
      .from('projects')
      .select('source_type, duration_seconds, clip_preferences')
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
    if(!snapshot.receipt)throw new AppError('Source has no verified download receipt. No transcription was started; review the source before retrying.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    if(processingAttemptId){
      const reservation=await db.collection<CreditReservationRecord>('credit_reservations').findOne({attempt_id:processingAttemptId,user_id:userId});
      if(reservation?.metadata?.isReusedTranscript)throw new AppError('The transcript selected for reuse is no longer available. No new transcription was started.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    }
    const tierSelection = config.tieredTranscriptionEnabled
      ? await freezeTierSelection(db,userId,processingAttemptId,async()=>(await EntitlementService.resolveUserEntitlements(userId)).planId) : undefined;
    const delegate = tierSelection ? createTierTranscriptionProvider(tierSelection) : process.env.VIREO_AUTOMATIC_GAMING_REVIEW==='1'
      ? new (await import('./transcription/openRouterTranscriptionProvider.js')).OpenRouterTranscriptionProvider('elevenlabs/scribe-v2')
      : getTranscriptionProviderWithFailover();
    const inputs=observeTranscriptionInputs(delegate);
    const {provider,requests}=inputs;
    const preparedAudioSha256=audioInputSha256(extractedAudio.audioBuffer);
    logger.info(`Using transcription provider: ${provider.name}`, { projectId, provider: provider.name });
    const transcription = await transcribeAudioFast(
      provider,
      extractedAudio,
      posterRow?.duration_seconds,
      `${projectId}.mp3`,
      {language:normalizeSourceLanguage(posterRow?.clip_preferences?.sourceLanguage)}
    );

    await inputs.settle();

    // Compute effective duration from audio probe or last transcript segment timestamp
    const effectiveDuration = Number(
      (
        transcription.durationSeconds ||
        (transcription.segments?.length
          ? transcription.segments[transcription.segments.length - 1].end
          : 0)
      ).toFixed(2)
    );

    // 5b. Validate source duration against plan entitlement limit
    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    if (!entitlements.isUnlimited && effectiveDuration > entitlements.limits.maxUploadDurationSeconds) {
      if (processingAttemptId) {
        await CreditWalletService.releaseReservation(processingAttemptId, 'Video duration exceeds plan limit').catch(() => undefined);
        await UsageService.releaseReservation(processingAttemptId, 'Video duration exceeds plan limit').catch(() => undefined);
      }
      try {
        await dataRepository
          .from('projects')
          .update({
            video_status: 'failed',
            error_message: `Video duration (${Math.round(effectiveDuration)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);
      } catch {}
      const durationErr: any = new Error(
        `Video duration (${Math.round(effectiveDuration)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`
      );
      durationErr.code = 'DURATION_LIMIT_EXCEEDED';
      throw durationErr;
    }

    // 5c. Mid-run credit extension check:
    // If measured duration requires more credits than provisionally reserved,
    // extend reservation atomically. If balance is insufficient, abort cleanly and release reservation.
    if (processingAttemptId) {
      const db = await getMongoDb();
      const resRecord = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: processingAttemptId });
      const isReused = Boolean(resRecord?.metadata?.isReusedTranscript);
      const requiredCredits = isReused
        ? 0
        : CreditPricingService.calculateCoreProcessingCost(effectiveDuration).credits;

      if (resRecord && resRecord.status === 'reserved' && requiredCredits > resRecord.amount) {
        const additionalCredits = requiredCredits - resRecord.amount;
        const ext = await CreditWalletService.extendReservation(
          processingAttemptId,
          additionalCredits,
          undefined,
          'Measured duration mid-run extension'
        );

        if (!ext.allowed) {
          await CreditWalletService.releaseReservation(processingAttemptId, 'Insufficient credits for measured duration mid-run').catch(() => undefined);
          await UsageService.releaseReservation(processingAttemptId, 'Insufficient credits for measured duration mid-run').catch(() => undefined);
          try {
            await dataRepository
              .from('projects')
              .update({
                video_status: 'failed',
                error_message: `Insufficient credits to process ${Math.ceil(effectiveDuration)}s video. Required ${requiredCredits} credits.`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', projectId)
              .eq('user_id', userId);
          } catch {}
          const creditErr: any = new Error(
            `Insufficient credits for measured video duration: this video requires ${requiredCredits} credits, but wallet has insufficient available balance.`
          );
          creditErr.code = 'INSUFFICIENT_CREDITS';
          throw creditErr;
        }
      }
    }

    // Do not promote output if the project pointer or source version moved
    // during extraction/provider work. No replacement provider call is made.
    const latestProject=await db.collection('projects').findOne({id:projectId,user_id:userId});
    if(latestProject?.source_url!==sourceUrl || (snapshot.receipt && !sourceObjectReceiptMatches(snapshot.receipt,sourceUrl,await headObject('source',sourceUrl))))throw new AppError('Source changed during transcription. Review before requesting another transcription.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');

    // Explicit local-review enrichment. Normal production processing has no
    // added model calls; a bounded review never accepts externally supplied boxes.
    if(process.env.VIREO_AUTOMATIC_GAMING_REVIEW==='1'){
      const {generateAutomaticGamingReviewEvidence}=await import('./automaticGamingEvidenceReviewService.js');
      const enrichment=await generateAutomaticGamingReviewEvidence(videoPath,path.join(os.tmpdir(),'vireo-gaming-evidence-'+crypto.randomUUID()),config.openrouterApiKey||'');
      if(enrichment.evidence.sourceSha256!==snapshot.receipt?.sha256)throw new AppError('Gaming evidence source changed',409,'SOURCE_CHANGED');
      if(!sourceObjectReceiptMatches(snapshot.receipt,sourceUrl,await headObject('source',sourceUrl)))throw new AppError('Source changed during gaming enrichment',409,'SOURCE_CHANGED');
      const evidenceSaved=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:sourceUrl},{$set:{automatic_gaming_evidence:enrichment.evidence}});
      if(evidenceSaved.matchedCount!==1)throw new AppError('Project source changed during gaming enrichment',409,'SOURCE_CHANGED');
    }
    // 6. Store transcript in MongoDB (upsert to avoid duplicates)
    const transcriptPayload: any = {
      project_id: projectId,
      user_id: userId,
      quality_assessment: assessTranscriptQuality(transcription),
      transcription_provenance: transcription.provenance,
      transcription_usage: transcription.usage,
      transcription_timing_issues: transcription.timingIssues,
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

    if(snapshot.receipt)transcriptPayload.source_binding={version:1,source_receipt:snapshot.receipt,prepared_audio_sha256:preparedAudioSha256,requests,transcript_content_sha256:transcriptContentIdentity(transcriptPayload)};

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

    // Preserve flagged output for inspection, but never promote it into automatic clips.
    assertTranscriptUsable(transcriptPayload);

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

    // 8. Settle credit reservation and legacy usage reservation atomically using measured audio duration.
    if (processingAttemptId) {
      const db = await getMongoDb();
      const resRecord = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: processingAttemptId });
      const isReused = Boolean(resRecord?.metadata?.isReusedTranscript);
      const actualCredits = isReused
        ? 0
        : CreditPricingService.calculateCoreProcessingCost(effectiveDuration).credits;

      await CreditWalletService.settleReservation(
        processingAttemptId,
        actualCredits,
        {
          projectId,
          provider: provider.name,
          language: transcription.language,
          segment_count: transcription.segments?.length || 0,
          duration_seconds: effectiveDuration,
        }
      );

      // Shadow legacy usage settle for minute tracking audits
      try {
        await UsageService.extendReservationToMeasuredDuration(processingAttemptId, effectiveDuration).catch((err) => {
          logger.warn(`Legacy usage quota exceeded mid-run: ${err?.message || err}`);
        });
        await UsageService.settleReservation(
          processingAttemptId,
          effectiveDuration,
          {
            provider: provider.name,
            language: transcription.language,
            segment_count: transcription.segments?.length || 0,
          }
        );
      } catch {}
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

    // Safely release the credit and usage quota reservation so failed jobs never consume credits/quota
    if (processingAttemptId) {
      await CreditWalletService.releaseReservation(processingAttemptId, message || 'Processing failed').catch(() => undefined);
      await UsageService.releaseReservation(processingAttemptId, message || 'Processing failed').catch(() => undefined);
    }

    // Mark project status as 'failed' in database
    try {
      await dataRepository
        .from('projects')
        .update({
          video_status: 'failed',
          error_message: message || 'Video processing failed.',
          error_code: ['TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPT_SOURCE_REVIEW_REQUIRED'].includes((err as any)?.code) ? (err as any).code : null,
          ...(['TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPT_SOURCE_REVIEW_REQUIRED'].includes((err as any)?.code) ? {transcript_quality_status:'needs_review'} : {}),
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
