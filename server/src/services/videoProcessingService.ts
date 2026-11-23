import {publishProcessingCompletion,readProcessingCompletion} from './transcription/processingCompletion.js';
import {assertProcessingOwnership,ownedTranscriptionProvider,processingOwnershipFilter} from './transcription/processingOwnership.js';
import {processingFailureReceipt,type ProcessingFailureContext} from '../shared/processingFailureReceipt.js';
import {transcriptReviewCode,type TranscriptReviewCode} from '../shared/transcriptReviewErrors.js';
import {BorrowedSourceReaders} from './queue/borrowedSourceReaders.js';
import {newTranscriptSelectionFields} from './transcription/selectionSegments.js';
import {workLifecycle} from './queue/workLifecycle.js';
import {observeTranscriptionInputs} from './transcription/transcriptionInputObserver.js';
import {assertTranscriptReusable} from './transcriptSourceBindingService.js';
import {audioInputSha256,transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
import {sourceObjectReceiptMatches,type SourceObjectReceipt} from '../shared/sourceObjectReceipt.js';
import {AppError} from '../types/index.js';
import {validateRecord} from '../db/schemaValidation.js';
import {assessTranscriptQuality,assertTranscriptUsable,normalizeSourceLanguage} from './transcription/transcriptQuality.js';
import { isMongoConfigured, getMongoDb, getMongoClient } from '../db/mongoClient.js';
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
  reviewCode?: TranscriptReviewCode;
  completionRunToken?:string;
  completedProject?:Record<string,any>;
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

  if(processingAttemptId){const done=await readProcessingCompletion(await getMongoDb(),userId,projectId,sourceUrl,processingAttemptId);if(done)return{status:'transcribed',transcript:done.transcript as any,completionRunToken:done.runToken,completedProject:done.project};}

  if (activeProcessingSet.has(projectId)) {
    throw new Error('Project processing is already in progress.');
  }

  activeProcessingSet.add(projectId);
  return await ownerContext.run(userId, async () => {
    let cleanupAudio: (() => void) | null = null;
    let downloadedVideoPath: string | null = null;
    let cleanupSafe=true;
    const sourceReaders=new BorrowedSourceReaders();
    const runToken=crypto.randomUUID();let admitted=false,committed=false;let completedProject:any;
    const failureContext:ProcessingFailureContext={attemptId:processingAttemptId,stage:'source_validation'};

    try {
    const db = await getMongoDb();
    const currentProject=await db.collection('projects').findOne({id:projectId,user_id:userId});
    if(!currentProject || currentProject.source_url!==sourceUrl)throw new AppError('Project source changed before transcription. Reload the project.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    if(!['uploaded','uploading','failed','processing','transcribing'].includes(currentProject.video_status)||(!processingAttemptId&&currentProject.processing_attempt_id)||currentProject.processing_run_token||(processingAttemptId&&currentProject.processing_attempt_id!==processingAttemptId))throw new AppError('Processing attempt is no longer current.',409,'PROCESSING_ATTEMPT_CHANGED');
    const admissionSession=(await getMongoClient()).startSession();
    try{await admissionSession.withTransaction(async()=>{
      if(processingAttemptId){
        const reservations=db.collection('credit_reservations');
        const r=await reservations.findOne({attempt_id:processingAttemptId,user_id:userId,operation_id:'core_video_processing','metadata.projectId':projectId,'metadata.sourceUrl':sourceUrl},{session:admissionSession});
        if(!r||r.processing_admission||r.processing_claim_closed||!(['reserved','active'].includes(r.status)||(r.status==='settled'&&r.amount===0&&r.settled_amount===0&&!r.processing_completion)))throw new AppError('Reservation is not available for this processing admission.',409,'PROCESSING_RESERVATION_MISMATCH');
        await reservations.updateOne({_id:r._id},{$set:{processing_admission:{userId,projectId,sourceUrl,runToken}}},{session:admissionSession});
      }
      const admission=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:sourceUrl,...(processingAttemptId?{processing_attempt_id:processingAttemptId}:{processing_attempt_id:null,updated_at:currentProject.updated_at??null}),processing_run_token:null,video_status:currentProject.video_status},{$set:{video_status:'processing',error_code:null,error_message:null,processing_failure:null,processing_run_token:runToken}},{session:admissionSession});
      if(admission.modifiedCount!==1)throw new AppError('Processing attempt or source changed before admission.',409,'PROCESSING_ATTEMPT_CHANGED');
    })}finally{await admissionSession.endSession()}
    admitted=true;
    const ownership={projectId,userId,sourceUrl,attemptId:processingAttemptId,runToken};
    const assertCurrent=()=>assertProcessingOwnership(db,ownership);
    const complete=async(transcript:any,payload:Record<string,any>,preferences:unknown,credits:number,metadata:Record<string,unknown>)=>{
      const publication=async(session:import('mongodb').ClientSession,replay=false)=>{completedProject=await publishProcessingCompletion(db,session,ownership,transcript,payload,preferences,replay);};
      if(processingAttemptId)await CreditWalletService.settleReservation(processingAttemptId,credits,metadata,publication,{userId,projectId,sourceUrl,runToken,transcriptId:transcript.id});
      else{const session=(await getMongoClient()).startSession();try{await session.withTransaction(()=>publication(session))}finally{await session.endSession()}}
      committed=true;
    };

    // 1b. Check if valid transcript already exists for this project and user (Cross-workflow reuse at 0 credits)
    const existingTranscript = await db.collection<TranscriptRecord>('transcripts').findOne({
      project_id: projectId,
      user_id: userId,
    });

    if (existingTranscript && (existingTranscript.segments?.length || existingTranscript.transcript_text)) {
      failureContext.stage='transcript_reuse';
      await assertTranscriptReusable(existingTranscript,sourceUrl);
      logger.info(`Reusing existing transcript for project ${projectId}`, { projectId, userId });
      const effectiveDuration = Number(
        existingTranscript.duration_seconds ||
        (existingTranscript.segments?.length
          ? existingTranscript.segments[existingTranscript.segments.length - 1].end
          : 0)
      );

      // Validate source duration against plan entitlement limit
      failureContext.stage='transcript_validation';failureContext.durationSeconds=effectiveDuration;
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (!entitlements.isUnlimited && effectiveDuration > entitlements.limits.maxUploadDurationSeconds) {
        const durationErr: any = new Error(
          `Video duration (${Math.round(effectiveDuration)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`
        );
        durationErr.code = 'DURATION_LIMIT_EXCEEDED';
        throw durationErr;
      }

      failureContext.stage='credit_settlement';
      await complete(existingTranscript,{duration_seconds:effectiveDuration},currentProject.clip_preferences,0,{projectId,provider:'reused',isReusedTranscript:true,duration_seconds:effectiveDuration});
      if(processingAttemptId)await UsageService.settleReservation(processingAttemptId,0,{reason:'Reused transcript'}).catch(()=>undefined);

      return {
        status: 'transcribed',
        completionRunToken:runToken,completedProject,
        transcript: existingTranscript as TranscriptRecord,
      };
    }

    // A reuse-only reservation is not permission for a fresh transcription.
    // Detect its missing transcript before downloading/decoding source media.
    // Keep the later check too, since reservation state can change mid-run.
    if(processingAttemptId){
      const reservation=await db.collection<CreditReservationRecord>('credit_reservations').findOne({attempt_id:processingAttemptId,user_id:userId});
      if(reservation?.metadata?.isReusedTranscript)throw new AppError('The transcript selected for reuse is no longer available. No new transcription was started.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    }

    // 2. Stream private R2 object to a local scratch file reusing the shared source cache.
    const storagePath = sourceUrl;
    const originalFileName = storagePath.split('/').pop() || 'video.mp4';
    const videoPath = path.join(os.tmpdir(), `vireo-source-${crypto.randomUUID()}${path.extname(originalFileName) || '.mp4'}`);
    downloadedVideoPath = videoPath;
    const snapshot:{receipt?:SourceObjectReceipt}={};
    failureContext.stage='source_download';
    const sourceResolution = await ClipRenderService.ensureSourceVideo(storagePath, videoPath,{snapshotOut:snapshot});
    logger.info(`Source video resolved for project ${projectId} via ${sourceResolution}: ${videoPath}`);

    failureContext.sourceSha256=snapshot.receipt?.sha256;failureContext.sourceBytes=snapshot.receipt?.size;
    // 2b. HD poster frame for the dashboard while we have the file locally (best-effort, ~100ms).
    const { data: posterRow } = await dataRepository
      .from('projects')
      .select('source_type, duration_seconds, clip_preferences')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (posterRow?.source_type === 'upload') {
      // Parallel best-effort upload; source cleanup joins only the owned reader.
      workLifecycle.run('source-project-poster',()=>ProjectPosterService.generateFromLocalFile(userId, projectId, videoPath, posterRow.duration_seconds,sourceReaders))
        .catch((err: any) => logger.warn(`Poster generation failed for project ${projectId}: ${err?.message || err}`));
    }

    // 3. Extract audio via FFmpeg without buffering the video in Node memory.
    // The known duration picks the bitrate up front (one encode), and because long audio is
    // transcribed in parallel windows the full file is not held to the 25 MB single-request cap.
    failureContext.stage='audio_extraction';
    const extractedAudio = await extractAudioFromVideo(videoPath, originalFileName, {
      durationHintSec: posterRow?.duration_seconds,
      maxAudioBytes: 200 * 1024 * 1024,
    });
    cleanupAudio = extractedAudio.cleanup;

    // A zero-match ownership write stops before any provider dispatch.
    const transcribing=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:sourceUrl,processing_run_token:runToken,...(processingAttemptId?{processing_attempt_id:processingAttemptId}:{processing_attempt_id:null})},{$set:{video_status:'transcribing'}});
    if(transcribing.matchedCount!==1)throw new AppError('Processing source or attempt changed before transcription. No new audio request was started.',409,'PROCESSING_ATTEMPT_CHANGED');

    // 5. Transcribe audio with the configured provider, failing over to the
    // alternate provider on transient runtime failures (rate limit, 5xx, timeout).
    if(!snapshot.receipt)throw new AppError('Source has no verified download receipt. No transcription was started; review the source before retrying.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    if(processingAttemptId){
      const reservation=await db.collection<CreditReservationRecord>('credit_reservations').findOne({attempt_id:processingAttemptId,user_id:userId});
      if(reservation?.metadata?.isReusedTranscript)throw new AppError('The transcript selected for reuse is no longer available. No new transcription was started.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    }
    failureContext.stage='transcription_routing';
    const tierSelection = config.tieredTranscriptionEnabled
      ? await freezeTierSelection(db,userId,processingAttemptId,async()=>(await EntitlementService.resolveUserEntitlements(userId)).planId) : undefined;
    // Framing review never changes transcription provider or authorizes a paid STT model.
    const delegate = tierSelection ? createTierTranscriptionProvider(tierSelection) : getTranscriptionProviderWithFailover();
    failureContext.provider=delegate.name;failureContext.model=tierSelection?.model;failureContext.tierPolicy=tierSelection?.policy;
    const inputs=observeTranscriptionInputs(delegate);failureContext.inputRequests=inputs.requests;
    const requests=inputs.requests,provider=ownedTranscriptionProvider(inputs.provider,assertCurrent);
    const preparedAudioSha256=audioInputSha256(extractedAudio.audioBuffer);
    logger.info(`Using transcription provider: ${provider.name}`, { projectId, provider: provider.name });
    failureContext.stage='transcription';
    if(!await db.collection('projects').findOne({id:projectId,user_id:userId,source_url:sourceUrl,processing_run_token:runToken,...(processingAttemptId?{processing_attempt_id:processingAttemptId}:{processing_attempt_id:null})}))throw new AppError('Processing attempt changed before provider dispatch.',409,'PROCESSING_ATTEMPT_CHANGED');
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

    failureContext.durationSeconds=effectiveDuration;failureContext.stage='transcript_validation';
    // 5b. Validate source duration against plan entitlement limit
    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    if (!entitlements.isUnlimited && effectiveDuration > entitlements.limits.maxUploadDurationSeconds) {
      const durationErr: any = new Error(
        `Video duration (${Math.round(effectiveDuration)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`
      );
      durationErr.code = 'DURATION_LIMIT_EXCEEDED';
      throw durationErr;
    }

    await assertCurrent();
    failureContext.stage='credit_extension';
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
          const creditErr: any = new Error(
            `Insufficient credits for measured video duration: this video requires ${requiredCredits} credits, but wallet has insufficient available balance.`
          );
          creditErr.code = 'INSUFFICIENT_CREDITS';
          throw creditErr;
        }
      }
    }

    failureContext.stage='source_recheck';
    // Do not promote output if the project pointer or source version moved
    // during extraction/provider work. No replacement provider call is made.
    const latestProject=await db.collection('projects').findOne({id:projectId,user_id:userId});
    if(latestProject?.processing_run_token!==runToken||latestProject?.source_url!==sourceUrl || (snapshot.receipt && !sourceObjectReceiptMatches(snapshot.receipt,sourceUrl,await headObject('source',sourceUrl))))throw new AppError('Source changed during transcription. Review before requesting another transcription.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');

    // Explicit local-review enrichment. Normal production processing has no
    // added model calls; a bounded review never accepts externally supplied boxes.
    if(process.env.VIREO_AUTOMATIC_GAMING_REVIEW==='1'){
      failureContext.stage='gaming_enrichment';
      const {generateAutomaticGamingReviewEvidence}=await import('./automaticGamingEvidenceReviewService.js');
      await assertCurrent();
      const enrichment=await generateAutomaticGamingReviewEvidence(videoPath,path.join(os.tmpdir(),'vireo-gaming-evidence-'+crypto.randomUUID()),config.openrouterApiKey||'');
      if(enrichment.evidence.sourceSha256!==snapshot.receipt?.sha256)throw new AppError('Gaming evidence source changed',409,'SOURCE_CHANGED');
      if(!sourceObjectReceiptMatches(snapshot.receipt,sourceUrl,await headObject('source',sourceUrl)))throw new AppError('Source changed during gaming enrichment',409,'SOURCE_CHANGED');
      const evidenceSaved=await db.collection('projects').updateOne(processingOwnershipFilter(ownership),{$set:{automatic_gaming_evidence:enrichment.evidence}});
      if(evidenceSaved.matchedCount!==1)throw new AppError('Project source changed during gaming enrichment',409,'SOURCE_CHANGED');
    }
    failureContext.stage='transcript_validation';
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
      // Only newly generated transcripts reach here. Loaded/reused rows return
      // above unchanged, so existing candidate segment-index keys stay stable.
      ...newTranscriptSelectionFields(transcription.segments, transcription.words),
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
      segmentCount: transcriptPayload.segments?.length || 0,
      providerSegmentCount: transcription.segments?.length || 0,
      wordCount: transcription.words?.length || 0,
    });

    failureContext.stage='transcript_persistence';
    validateRecord('transcripts',transcriptPayload);
    const transcriptSession=(await getMongoClient()).startSession();let savedTranscript:any;
    try{await transcriptSession.withTransaction(async()=>{
      const fence=await db.collection('projects').updateOne(processingOwnershipFilter(ownership),{$inc:{processing_write_serial:1}},{session:transcriptSession});
      if(fence.matchedCount!==1)throw new AppError('Processing attempt changed before transcript save.',409,'PROCESSING_ATTEMPT_CHANGED');
      const now=new Date();await db.collection('transcripts').updateOne({project_id:projectId,user_id:userId},{$set:{...transcriptPayload,updated_at:new Date(transcriptPayload.updated_at)},$setOnInsert:{id:crypto.randomUUID(),created_at:now}},{upsert:true,session:transcriptSession});
      savedTranscript=await db.collection('transcripts').findOne({project_id:projectId,user_id:userId},{session:transcriptSession});
    })}finally{await transcriptSession.endSession()}

    failureContext.stage='transcript_validation';
    // Preserve flagged output for inspection, but never promote it into automatic clips.
    failureContext.stage='transcript_validation';
    assertTranscriptUsable(transcriptPayload);

    failureContext.stage='genre_analysis';
    // 7. Classify video genre locally and enrich project metadata
    const durationMin = Math.max(0.1, effectiveDuration / 60);
    const wordCount = transcription.words?.length || transcription.text.split(/\s+/).filter(Boolean).length;
    const wpm = Math.round(wordCount / durationMin);
    const questionCount = (transcription.text.match(/\?/g) || []).length;
    const questionDensityPerMin = Number((questionCount / durationMin).toFixed(2));

    let genreSuggestion = GenreIntelligenceService.classifyVideoGenreLocally({
      transcriptText: transcription.text,
      wpm,
      durationSeconds: effectiveDuration,
      questionDensityPerMin,
    });

    // Optional zero-price semantic review. Off until explicitly enabled by the
    // deployment owner. No retry or paid fallback; failure keeps local evidence.
    let semanticGenreReceipt: import('../shared/semanticGenreEvidence.js').SemanticGenreReceipt | undefined;
    let semanticGenreStatus: 'disabled'|'unavailable'|'suggested'|'review-required' = 'disabled';
    if (process.env.VIREO_AUTO_GENRE_REVIEW === 'free' && currentProject.clip_preferences?.genreSelectionMode !== 'manual' && effectiveDuration >= 3 && effectiveDuration <= 7200) {
      semanticGenreStatus = 'unavailable';
      const reviewDir = path.join(os.tmpdir(), 'vireo-genre-review-' + crypto.randomUUID());
      try {
        await assertCurrent();
        const { reviewSourceGenreFree } = await import('./sourceGenreReviewService.js');
        const { applySemanticGenreReceipt } = await import('../shared/semanticGenreEvidence.js');
        const receipt = await reviewSourceGenreFree({source:videoPath,transcriptText:transcription.text,transcriptSegments:transcription.segments,out:reviewDir,apiKey:config.openrouterApiKey,model:process.env.VIREO_AUTO_GENRE_MODEL || 'nvidia/nemotron-3.5-super-vl:free'});
        if (receipt.sourceSha256 !== snapshot.receipt?.sha256 || !sourceObjectReceiptMatches(snapshot.receipt,sourceUrl,await headObject('source',sourceUrl))) throw new AppError('Source changed during genre review',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
        const freshGenreProject = await db.collection('projects').findOne({id:projectId,user_id:userId});
        if (freshGenreProject?.source_url !== sourceUrl) throw new AppError('Project source changed during genre review',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
        semanticGenreReceipt = receipt;
        genreSuggestion = applySemanticGenreReceipt(genreSuggestion,receipt,receipt.sourceSha256,effectiveDuration,transcription.text);
        semanticGenreStatus = genreSuggestion.semanticEvidence?.status === 'suggested' ? 'suggested' : 'review-required';
      } catch (error:any) {
        if (['PROCESSING_ATTEMPT_CHANGED','TRANSCRIPT_SOURCE_REVIEW_REQUIRED'].includes(error?.code)) throw error;
        logger.warn('Optional semantic genre review unavailable; keeping local evidence.', {code:'GENRE_REVIEW_UNAVAILABLE'});
      } finally { await fs.rm(reviewDir,{recursive:true,force:true}); }
    }

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
          genre_evidence: genreSuggestion.evidence,
          genre_semantic_evidence: genreSuggestion.semanticEvidence,
          genre_review_status: semanticGenreStatus,
        };
      }
    }

    if (semanticGenreReceipt) updatePayload.semantic_genre_receipt = semanticGenreReceipt;

    failureContext.stage='credit_settlement';
    const actualCredits=CreditPricingService.calculateCoreProcessingCost(effectiveDuration).credits;
    await complete(savedTranscript,updatePayload,project?.clip_preferences,actualCredits,{projectId,provider:provider.name,language:transcription.language,segment_count:transcription.segments?.length||0,duration_seconds:effectiveDuration});
    if(processingAttemptId){
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

    // Optional timeline/game-event enrichment is deferred here until its own
    // job admission and publication can bind this immutable source/run identity.

    return {
      status: 'transcribed',
      transcript: savedTranscript as TranscriptRecord,
      completionRunToken:runToken,completedProject,
    };
  } catch (err: unknown) {
    if(processingAttemptId)try{const done=await readProcessingCompletion(await getMongoDb(),userId,projectId,sourceUrl,processingAttemptId);if(done){committed=true;return{status:'transcribed',transcript:done.transcript as any,completionRunToken:done.runToken,completedProject:done.project};}}catch{}
    if((err as any)?.code==='PROCESS_STOP_UNVERIFIED')cleanupSafe=false;
    const message = err instanceof Error ? err.message : String(err);
    const reviewCode=transcriptReviewCode((err as any)?.code);
    const failure=processingFailureReceipt(failureContext,err);
    logger.error(`Video processing failed for project ${projectId}`, {
      projectId,
      userId,
      error: message,
    });

    // A refund is not proof child processes stopped. Close borrowed readers
    // before deciding whether this run is safe to release/retry.
    cleanupSafe=cleanupSafe&&await sourceReaders.closeAndWait();

    // An unadmitted duplicate must not release the rightful active run's reservation.
    // An obsolete different attempt may release only its own reservation.
    try { if (processingAttemptId&&!committed&&cleanupSafe) {
      const current=await (await getMongoDb()).collection('projects').findOne({id:projectId,user_id:userId});
      const ownsCurrent=admitted&&current?.processing_attempt_id===processingAttemptId&&current?.processing_run_token===runToken;
      const isObsolete=current?.processing_attempt_id!==processingAttemptId;
      if(admitted&&(ownsCurrent||isObsolete)){
        await CreditWalletService.releaseReservation(processingAttemptId, message || 'Processing failed').catch(() => undefined);
        await UsageService.releaseReservation(processingAttemptId, message || 'Processing failed').catch(() => undefined);
      }
    }

    } catch {
      // Ownership could not be verified. Fail closed on release and preserve the
      // original processing failure, rather than masking it with a lookup error.
      logger.warn('Failure cleanup ownership unavailable; reservation left for reconciliation',{projectId});
    }

    // Mark project status as 'failed' in database
    try {
      if(admitted&&!committed)await (await getMongoDb()).collection('projects').updateOne({id:projectId,user_id:userId,source_url:sourceUrl,processing_run_token:runToken,processing_attempt_id:processingAttemptId??null,video_status:{$in:['processing','transcribing']}},{$set:{video_status:'failed',error_message:message||'Video processing failed.',error_code:reviewCode??null,processing_failure:failure,...(reviewCode?{transcript_quality_status:'needs_review'}:{})}});

    } catch (updateErr) {
      logger.error('Failed to set video_status to failed', {
        projectId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    return {
      status: 'failed',
      error: message || 'Video processing failed.',
      ...(reviewCode?{reviewCode}:{}),
    };
  } finally {
    // Does not await uploads/VLM/DB work or replace an already-settled transcript.
    const readersStopped=await sourceReaders.closeAndWait();
    cleanupSafe=cleanupSafe&&readersStopped;
    if (cleanupSafe&&cleanupAudio) {
      try {
        cleanupAudio();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (cleanupSafe&&downloadedVideoPath) await fs.rm(downloadedVideoPath, { force: true }).catch(() => undefined);
    if(cleanupSafe&&admitted)try{await (await getMongoDb()).collection('projects').updateOne({id:projectId,user_id:userId,processing_run_token:runToken},{$unset:{processing_run_token:''}})}catch{}
    if(cleanupSafe)activeProcessingSet.delete(projectId);
    else logger.error('Source processing guard/files quarantined until child exit is proved',{projectId,source:downloadedVideoPath});
  }
  });
}
