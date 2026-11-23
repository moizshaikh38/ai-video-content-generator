import {transcriptReviewCode} from '../shared/transcriptReviewErrors.js';
import {insertProjectWithinQuota, projectQuotaPolicy} from '../db/repositories/projectQuotaRepository.js';
import {subtitleProjectDefaults} from '../shared/subtitleProjectDefaults.js';
import {workLifecycle} from './queue/workLifecycle.js';
import {assertTranscriptReusable} from './transcriptSourceBindingService.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { CaptionService } from './captionService.js';
import { CaptionLocalizationService } from './translation/captionLocalizationService.js';
import { ClipRenderService } from './clipRenderService.js';
import { processProjectVideo } from './videoProcessingService.js';
import { signObjectGet, uploadFile } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { getMongoDb,getMongoClient } from '../db/mongoClient.js';
import { CreditWalletService } from './creditWalletService.js';
import { CreditPricingService } from './billing/creditPricingService.js';
import { EntitlementService } from './entitlementService.js';
import { WatermarkService } from './watermarkService.js';
import {
  AppError,
  TimedCaptionCue,
  SubtitleStyleConfig,
  SubtitleProjectRecord,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export class SubtitleStudioService {
  /**
   * Creates a dedicated Subtitle Studio project
   */
  public static async createProject(
    userId: string,
    data: {
      title?: string;
      source_type?: 'upload' | 'url';
      source_url?: string;
      source_filename?: string;
    }
  ): Promise<SubtitleProjectRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = (data.title || 'Untitled Subtitle Project').trim().slice(0, 200);
    const entitlements = await EntitlementService.resolveUserEntitlements(userId);

    const record: any = {
      id,
      user_id: userId,
      title,
      source_type: data.source_type || 'upload',
      source_url: data.source_url || null,
      source_filename: data.source_filename || null,
      video_status: data.source_url ? 'uploaded' : 'uploading',
      ...subtitleProjectDefaults(EntitlementService.isPresetAllowed(entitlements, 'hormozi')),
      created_at: now,
      updated_at: now,
    };

    const inserted = await insertProjectWithinQuota(userId, record, projectQuotaPolicy(entitlements));
    return inserted as SubtitleProjectRecord;
  }

  /**
   * Lists all Subtitle Studio projects for the authenticated user
   */
  public static async listProjects(userId: string): Promise<SubtitleProjectRecord[]> {
    const { data: projects, error } = await dataRepository
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .eq('project_type', 'subtitles')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list subtitle projects', { userId, error });
      throw new AppError('Failed to list subtitle projects.', 500, 'DB_ERROR');
    }

    return (projects || []) as SubtitleProjectRecord[];
  }

  /**
   * Retrieves a single Subtitle Studio project with signed preview & export URLs
   */
  public static async getProject(
    projectId: string,
    userId: string
  ): Promise<{
    project: SubtitleProjectRecord;
    previewUrl: string | null;
    transcript: any | null;
    exportDownloadUrl: string | null;
  }> {
    const { data: project, error } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !project) {
      throw new AppError('Subtitle project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    let previewUrl: string | null = null;
    if (project.source_url) {
      try {
        previewUrl = await signObjectGet('source', project.source_url, project.source_filename);
      } catch (e: any) {
        logger.warn(`Failed to sign source preview URL for project ${projectId}: ${e.message}`);
      }
    }

    let exportDownloadUrl: string | null = null;
    let watermarkRerenderRequired = false;
    if (project.subtitle_export_path) {
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (entitlements.watermarkRequired && project.is_watermarked === false) {
        watermarkRerenderRequired = true;
        logger.info(`[SubtitleStudio] Clean export download suppressed for downgraded user ${userId} on project ${projectId}`);
      } else {
        try {
          exportDownloadUrl = await signObjectGet(
            'clips',
            project.subtitle_export_path,
            `${project.title || 'subtitles'}_rendered.mp4`
          );
        } catch (e: any) {
          logger.warn(`Failed to sign export download URL for project ${projectId}: ${e.message}`);
        }
      }
    }

    const { data: transcript } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    // Cue initialization is a processing completion mutation, never a GET side effect.

    return {
      project: watermarkRerenderRequired ? ({ ...project, watermark_rerender_required: true } as any) : (project as SubtitleProjectRecord),
      previewUrl,
      transcript: transcript || null,
      exportDownloadUrl,
    };
  }

  /**
   * Looks up a valid reusable transcript for the specified user and project.
   * Checks direct project match first, then cross-workflow projects belonging
   * to the same authenticated user with the matching source video URL.
   * Strict tenant isolation is always enforced: user_id must match.
   */
  public static async findReusableTranscript(
    userId: string,
    projectId: string,
    sourceUrl?: string | null
  ): Promise<any | null> {
    const db = await getMongoDb();
    // 1. Direct match on current project and user
    const directTranscript = await db.collection('transcripts').findOne({
      project_id: projectId,
      user_id: userId,
    });
    if (directTranscript && (directTranscript.segments?.length || directTranscript.transcript_text)) {
      await assertTranscriptReusable(directTranscript,sourceUrl || "");
      return directTranscript;
    }

    // 2. Cross-workflow match: check other projects belonging to the SAME user with the same source_url
    if (sourceUrl) {
      const matchingProject = await db.collection('projects').findOne({
        user_id: userId,
        source_url: sourceUrl,
        id: { $ne: projectId },
      });

      if (matchingProject) {
        const sourceTranscript = await db.collection('transcripts').findOne({
          project_id: matchingProject.id,
          user_id: userId,
        });

        if (sourceTranscript && (sourceTranscript.segments?.length || sourceTranscript.transcript_text)) {
          await assertTranscriptReusable(sourceTranscript,sourceUrl || "");
          // Clone to current project for fast subsequent access
          const session=(await getMongoClient()).startSession();try{await session.withTransaction(async()=>{
          const target=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:sourceUrl,processing_run_token:null,video_status:{$nin:['processing','transcribing']}},{$inc:{processing_write_serial:1}},{session});
          if(target.matchedCount!==1)throw new AppError('Project changed before transcript reuse.',409,'PROCESSING_ATTEMPT_CHANGED');
          await db.collection('transcripts').updateOne(
            { project_id: projectId, user_id: userId },
            {
              $setOnInsert: {
                id: crypto.randomUUID(),
                project_id: projectId,
                user_id: userId,
                transcript_text: sourceTranscript.transcript_text,
                text: sourceTranscript.text,
                language: sourceTranscript.language,
                duration_seconds: sourceTranscript.duration_seconds,
                segments: sourceTranscript.segments,
                words: sourceTranscript.words,
                quality_assessment: sourceTranscript.quality_assessment,
                transcription_provenance: sourceTranscript.transcription_provenance,
                transcription_timing_issues: sourceTranscript.transcription_timing_issues,
                provider_segments: (sourceTranscript as any).provider_segments,
                selection_segmentation: (sourceTranscript as any).selection_segmentation,
                source_binding: sourceTranscript.source_binding,
                av_start_offset_sec: sourceTranscript.av_start_offset_sec,
                created_at: new Date(),
                updated_at: new Date(),
              },
            },
            { upsert: true,session }
          );
          })}finally{await session.endSession()}
          return sourceTranscript;
        }
      }
    }

    return null;
  }

  /**
   * Transcribes the uploaded source video and initializes subtitle cues
   */
  public static async transcribeProject(
    projectId: string,
    userId: string,
    processingAttemptId?: string,
    userEmail?: string
  ): Promise<{
    project: SubtitleProjectRecord;
    cues: TimedCaptionCue[];
    creditsCharged: number;
    isReusedTranscript: boolean;
    attemptId: string;
    completionIsCurrent?:boolean;
  }> {
    const { project } = await this.getProject(projectId, userId);

    if (!project.source_url) {
      throw new AppError('Project does not have an uploaded source video yet.', 400, 'SOURCE_VIDEO_MISSING');
    }

    if(processingAttemptId){const {readProcessingCompletion}=await import('./transcription/processingCompletion.js');const done=await readProcessingCompletion(await getMongoDb(),userId,projectId,project.source_url,processingAttemptId);if(done)return{project:done.project as unknown as SubtitleProjectRecord,cues:done.project.subtitle_cues||[],creditsCharged:done.settledAmount,isReusedTranscript:done.settledAmount===0,attemptId:processingAttemptId,completionIsCurrent:done.completionIsCurrent};}

    // Validate duration against plan entitlement if known
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, userEmail);
    if (
      !entitlements.isUnlimited &&
      project.duration_seconds &&
      project.duration_seconds > entitlements.limits.maxUploadDurationSeconds
    ) {
      throw new AppError(
        `Video duration (${Math.round(project.duration_seconds)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`,
        403,
        'DURATION_LIMIT_EXCEEDED'
      );
    }

    const attemptId = processingAttemptId || crypto.randomUUID();



    // Never reclaim on updated_at age: long provider work may not write metadata.
    if(['processing','transcribing'].includes(project.video_status)||(project as any).processing_run_token)throw new AppError('Transcription is already in progress. Recovery requires the old worker to be stopped and reconciled.',409,'PROCESSING_ACTIVE');

    // Check for existing reusable transcript (0 credits if present)
    const reusableTranscript = await this.findReusableTranscript(userId, projectId, project.source_url);

    // Calculate provisional cost (1 credit per 15s, rounded up, min 1 credit floor)
    const durationForEstimate = Number(project.duration_seconds) > 0 ? Number(project.duration_seconds) : 60;
    const creditEstimate = reusableTranscript?{credits:0}:CreditPricingService.calculateCoreProcessingCost(durationForEstimate);
    const creditsToReserve = creditEstimate.credits;

    // Atomically reserve credits
    const creditReservation = await CreditWalletService.reserveCredits({
      userId,
      attemptId,
      operationId: 'core_video_processing',
      amount: creditsToReserve,
      userEmail,
      ttlMinutes: 60,
      metadata: {
        projectId,
        sourceUrl:project.source_url,
        sourceDurationSeconds: project.duration_seconds || null,
        isReusedTranscript: Boolean(reusableTranscript),
        workflow: 'subtitle_studio',
      },
    });

    if (!creditReservation.allowed) {
      throw new AppError(
        creditReservation.errorMessage || 'Insufficient credits to transcribe video.',
        403,
        'INSUFFICIENT_CREDITS'
      );
    }

    // reserveCredits may return another caller's existing attempt. Do not claim
    // or release that reservation, even if this request read an idle snapshot.
    if(creditReservation.idempotent)throw new AppError('Processing attempt already accepted.',409,'PROCESSING_ACTIVE');

    const {claimProjectProcessing,releaseUnadmittedProcessing}=await import('../db/repositories/projectRepository.js');
    let claimed;try{claimed=await claimProjectProcessing(userId,projectId,project.video_status,new Date(project.updated_at||project.created_at),{attemptId,sourceUrl:project.source_url,previousAttemptId:(project as any).processing_attempt_id??null,previousRunToken:(project as any).processing_run_token??null});}catch(error){await releaseUnadmittedProcessing(userId,projectId,project.source_url,attemptId).catch(()=>undefined);throw error}
    if(!claimed){await releaseUnadmittedProcessing(userId,projectId,project.source_url,attemptId).catch(()=>undefined);throw new AppError('Video processing has already started or source changed.',409,'PROCESSING_ACTIVE');}

    logger.info(`Starting transcription for subtitle project ${projectId}`, { userId, projectId, attemptId, creditsToReserve });

    let result;
    try {
      result = await processProjectVideo(projectId, userId, project.source_url, attemptId);
    } catch (procErr: any) {
      // The processing service owns admitted failure release. A rejection before
      // admission may be a duplicate of the rightful worker and cannot release it.
      throw procErr;
    }

    if (result.status !== 'transcribed' || !result.transcript) {
      // Processing service owns failure release after admission; do not release a rightful duplicate run here.
      const reviewCode=transcriptReviewCode(result.reviewCode);
      throw new AppError(result.error || 'Transcription failed to generate output.', reviewCode?409:500, reviewCode||'TRANSCRIPTION_FAILED');
    }

    // Cues/status were published with settlement while the run token was owned.
    // This caller is read-only after producer finally clears its token.
    const db=await getMongoDb();
    const updatedProject=await db.collection('projects').findOne({id:projectId,user_id:userId,source_url:project.source_url,processing_attempt_id:attemptId,processing_completed_run_token:result.completionRunToken,processing_completed_transcript_id:result.transcript.id,video_status:'transcribed'});
    const completed=updatedProject??result.completedProject;
    if(!completed)throw new AppError('Processing completed but its receipt is unavailable. Reload before retrying.',409,'PROCESSING_COMPLETION_REVIEW_REQUIRED');
    return{completionIsCurrent:Boolean(updatedProject),project:completed as unknown as SubtitleProjectRecord,cues:completed.subtitle_cues||[],creditsCharged:reusableTranscript?0:CreditPricingService.calculateCoreProcessingCost(Number(result.transcript.duration_seconds)).credits,isReusedTranscript:Boolean(reusableTranscript),attemptId};
  }

  /**
   * Updates and persists edited subtitle cues with strict timestamp validation
   */
  public static async updateCues(
    projectId: string,
    userId: string,
    cues: TimedCaptionCue[]
  ): Promise<TimedCaptionCue[]> {
    if (!Array.isArray(cues)) {
      throw new AppError('Cues must be an array.', 400, 'INVALID_CUES');
    }

    const {project,transcript}=await this.getProject(projectId,userId);
    if(!transcript)throw new AppError('Transcript unavailable for cue binding.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    await assertTranscriptReusable(transcript,project.source_url||'');

    const sanitized: TimedCaptionCue[] = cues
      .map((cue, index) => {
        const rawStart = Number(cue.start);
        const rawEnd = Number(cue.end);

        if (!Number.isFinite(rawStart) || rawStart < 0) {
          throw new AppError(`Cue at index ${index} has invalid start timestamp.`, 400, 'INVALID_TIMESTAMP');
        }
        if (!Number.isFinite(rawEnd) || rawEnd <= rawStart) {
          throw new AppError(
            `Cue at index ${index} has end timestamp earlier than or equal to start.`,
            400,
            'INVALID_TIMESTAMP'
          );
        }

        return {
          id: cue.id || crypto.randomUUID(),
          start: Math.round(rawStart * 1000) / 1000,
          end: Math.round(rawEnd * 1000) / 1000,
          text: CaptionService.sanitizeAssText(String(cue.text || '').trim()),
          words: Array.isArray(cue.words) ? cue.words : undefined,
          position_x: cue.position_x,
          position_y: cue.position_y,
          presetOverride: cue.presetOverride,
          styleOverrides: cue.styleOverrides,
        };
      })
      .sort((a, b) => a.start - b.start);

    const {transcriptContentIdentity}=await import('../shared/transcriptSourceBinding.js');
    const binding={kind:'manual',sourceUrl:project.source_url,sourceSha256:transcript.source_binding.source_receipt.sha256,transcriptContentSha256:transcriptContentIdentity(transcript)};
    const db=await getMongoDb(),session=(await getMongoClient()).startSession();
    try{await session.withTransaction(async()=>{
      const saved=await db.collection('transcripts').findOne({id:transcript.id,project_id:projectId,user_id:userId},{session});
      if(!saved||transcriptContentIdentity(saved as any)!==binding.transcriptContentSha256)throw new AppError('Transcript changed while saving cues.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
      const changed=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:project.source_url,processing_run_token:null,video_status:'transcribed',processing_completed_transcript_id:(project as any).processing_completed_transcript_id??null},{$set:{subtitle_cues:sanitized,subtitle_cues_binding:binding,updated_at:new Date()}},{session});
      if(changed.matchedCount!==1)throw new AppError('Project changed while saving cues.',409,'PROCESSING_ATTEMPT_CHANGED');
    })}finally{await session.endSession()}

    return sanitized;
  }

  /**
   * Updates and persists subtitle customization styles
   */
  public static async updateStyle(
    projectId: string,
    userId: string,
    style: SubtitleStyleConfig
  ): Promise<SubtitleStyleConfig> {
    if (!style || typeof style !== 'object') {
      throw new AppError('Invalid style configuration.', 400, 'INVALID_STYLE');
    }

    await this.getProject(projectId, userId);

    if (style.preset) {
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (!EntitlementService.isPresetAllowed(entitlements, String(style.preset))) {
        throw new AppError(
          `The subtitle preset "${style.preset}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
          403,
          'PRESET_RESTRICTED'
        );
      }
    }

    if (style.preset) {
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (!EntitlementService.isPresetAllowed(entitlements, String(style.preset))) {
        throw new AppError(
          `The subtitle preset "${style.preset}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
          403,
          'PRESET_RESTRICTED'
        );
      }
    }

    const sanitized: SubtitleStyleConfig = {
      preset: String(style.preset || 'hormozi'),
      fontFamily: CaptionService.validateFontFamily(style.fontFamily),
      fontSize: Math.min(120, Math.max(16, Number(style.fontSize) || 54)),
      fontWeight: style.fontWeight || 'bold',
      textColor: style.textColor && /^#[0-9a-fA-F]{6}$/i.test(style.textColor) ? style.textColor : '#FFFFFF',
      highlightColor:
        style.highlightColor && /^#[0-9a-fA-F]{6}$/i.test(style.highlightColor) ? style.highlightColor : '#FACC15',
      boxEnabled: Boolean(style.boxEnabled),
      boxColor: style.boxColor && /^#[0-9a-fA-F]{6}$/i.test(style.boxColor) ? style.boxColor : '#000000',
      boxOpacity: Math.min(1, Math.max(0, Number(style.boxOpacity ?? 0.75))),
      boxPadding: Math.min(60, Math.max(0, Number(style.boxPadding ?? 12))),
      alignment: style.alignment === 'left' || style.alignment === 'right' ? style.alignment : 'center',
      position: style.position === 'top' || style.position === 'middle' ? style.position : 'bottom',
      positionY: typeof style.positionY === 'number' ? Math.min(1, Math.max(0, style.positionY)) : undefined,
      strokeEnabled: style.strokeEnabled !== undefined ? Boolean(style.strokeEnabled) : true,
      strokeColor: style.strokeColor && /^#[0-9a-fA-F]{6}$/i.test(style.strokeColor) ? style.strokeColor : '#000000',
      strokeWidth: Math.min(12, Math.max(0, Number(style.strokeWidth ?? 3))),
      shadowEnabled: Boolean(style.shadowEnabled),
      shadowColor: style.shadowColor && /^#[0-9a-fA-F]{6}$/i.test(style.shadowColor) ? style.shadowColor : '#000000',
      shadowDepth: Math.min(20, Math.max(0, Number(style.shadowDepth ?? 2))),
      shadowOpacity: Math.min(1, Math.max(0, Number(style.shadowOpacity ?? 0.8))),
      uppercase: Boolean(style.uppercase),
      maxWordsPerLine: Math.min(15, Math.max(1, Number(style.maxWordsPerLine ?? 4))),
      animation:
        style.animation === 'pop' || style.animation === 'karaoke' || style.animation === 'bounce'
          ? style.animation
          : 'none',
    };

    await dataRepository
      .from('projects')
      .update({
        subtitle_style: sanitized,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('user_id', userId);

    return sanitized;
  }

  /**
   * Exports standard SubRip (.SRT) subtitle file
   */
  public static async exportSRT(projectId: string, userId: string): Promise<string> {
    const { project } = await this.getProject(projectId, userId);
    const cues = project.subtitle_cues || [];
    if (cues.length === 0) {
      throw new AppError('No subtitle cues available to export.', 400, 'NO_SUBTITLES');
    }
    return CaptionLocalizationService.generateSRT(cues);
  }

  /**
   * Exports standard WebVTT (.VTT) subtitle file
   */
  public static async exportVTT(projectId: string, userId: string): Promise<string> {
    const { project } = await this.getProject(projectId, userId);
    const cues = project.subtitle_cues || [];
    if (cues.length === 0) {
      throw new AppError('No subtitle cues available to export.', 400, 'NO_SUBTITLES');
    }
    return CaptionLocalizationService.generateVTT(cues);
  }

  /**
   * Triggers real FFmpeg rendering to permanently burn subtitles into the full video
   */
  public static async exportBurnedVideo(
    projectId: string,
    userId: string
  ): Promise<{ message: string; exportStatus: string }> {
    const { project } = await this.getProject(projectId, userId);

    if (!project.source_url) {
      throw new AppError('Source video is missing.', 400, 'SOURCE_VIDEO_MISSING');
    }

    const cues = project.subtitle_cues || [];
    if (cues.length === 0) {
      throw new AppError('No subtitle cues found to burn into video.', 400, 'NO_SUBTITLES');
    }

    const currentPreset = project.subtitle_style?.preset;
    if (currentPreset) {
      const entitlements = await EntitlementService.resolveUserEntitlements(userId);
      if (!EntitlementService.isPresetAllowed(entitlements, currentPreset)) {
        throw new AppError(
          `The subtitle preset "${currentPreset}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
          403,
          'PRESET_RESTRICTED'
        );
      }
    }

    if (project.subtitle_export_status === 'rendering') {
      return { message: 'Render is already in progress.', exportStatus: 'rendering' };
    }

    await dataRepository
      .from('projects')
      .update({
        subtitle_export_status: 'rendering',
        subtitle_export_progress: 5,
        subtitle_export_stage: 'initializing',
        subtitle_export_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('user_id', userId);

    this.runBurnWorker(projectId, userId).catch((err) => {
      logger.error('Background subtitle burn failed', { projectId, userId, error: err.message });
    });

    return { message: 'Subtitle burn rendering started.', exportStatus: 'rendering' };
  }

  /**
   * Background execution worker for full-video subtitle burning via FFmpeg
   */
  private static async runBurnWorker(projectId:string,userId:string):Promise<void>{return workLifecycle.run('subtitle-burn',()=>this.executeBurnWorker(projectId,userId));}
  private static async executeBurnWorker(projectId: string, userId: string): Promise<void> {
    return ownerContext.run(userId, async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vireo-subtitles-${projectId.slice(0, 8)}-`));
      const sourceLocalPath = path.join(tempDir, 'source.mp4');
      const assPath = path.join(tempDir, 'subtitles.ass');
      const outputMp4Path = path.join(tempDir, 'burned_output.mp4');

      try {
        const { project } = await this.getProject(projectId, userId);
        const cues = project.subtitle_cues || [];
        const style = project.subtitle_style || {};

        // 1. Stage: Prepare source video
        await dataRepository
          .from('projects')
          .update({
            subtitle_export_progress: 15,
            subtitle_export_stage: 'fetching_source',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);

        await ClipRenderService.ensureSourceVideo(project.source_url, sourceLocalPath, { projectId });

        // 2. Stage: Build ASS Subtitles Script
        await dataRepository
          .from('projects')
          .update({
            subtitle_export_progress: 30,
            subtitle_export_stage: 'building_subtitles',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);

        const assContent = CaptionService.buildAssScript(cues, {
          style: (style.preset as any) || 'hormozi',
          position: (style.position as any) || 'bottom',
          aspectRatio: '16:9',
          customConfig: {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            primaryColor: style.textColor,
            highlightColor: style.highlightColor,
            strokeColor: style.strokeColor,
            strokeWidth: style.strokeWidth,
            boxEnabled: style.boxEnabled,
            boxColor: style.boxColor,
            boxOpacity: style.boxOpacity,
            shadowEnabled: style.shadowEnabled,
            shadowColor: style.shadowColor,
            shadowDepth: style.shadowDepth,
            uppercase: style.uppercase,
            alignment: style.alignment,
          } as any,
          timingMode: 'word',
        });

        fs.writeFileSync(assPath, assContent, 'utf8');

        // 3. Stage: Burn Subtitles with FFmpeg
        await dataRepository
          .from('projects')
          .update({
            subtitle_export_progress: 45,
            subtitle_export_stage: 'burning_subtitles',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);

        const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
        const watermarkRequired = await WatermarkService.shouldWatermark(userId);
        const filterChain: string[] = [`ass=${safeAss}`];
        if (watermarkRequired) {
          filterChain.push(WatermarkService.getFfmpegFilterString());
          logger.info(`[SubtitleStudio] Watermark enforced for user ${userId} on project ${projectId}`);
        }

        logger.info(`[SubtitleStudio] Burning subtitles with FFmpeg for project ${projectId} (watermark=${watermarkRequired})`);

        await execFileAsync(
          ffmpegBin,
          [
            '-y',
            '-i',
            sourceLocalPath,
            '-filter_complex',
            filterChain.join(','),
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
            outputMp4Path,
          ],
          { timeout: 600000, maxBuffer: 16 * 1024 * 1024 }
        );

        // 4. Stage: Validate Output
        if (!fs.existsSync(outputMp4Path) || fs.statSync(outputMp4Path).size < 1024) {
          throw new Error('Burned subtitle video was not produced or output file is empty.');
        }

        const fileSize = fs.statSync(outputMp4Path).size;

        // 5. Stage: Upload to Storage
        await dataRepository
          .from('projects')
          .update({
            subtitle_export_progress: 85,
            subtitle_export_stage: 'uploading_export',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);

        const exportKey = `users/${userId}/projects/${projectId}/subtitles/burned_${Date.now()}.mp4`;
        await uploadFile('clips', exportKey, outputMp4Path, fileSize, 'video/mp4');

        // 6. Complete
        await dataRepository
          .from('projects')
          .update({
            subtitle_export_status: 'ready',
            subtitle_export_progress: 100,
            subtitle_export_stage: 'completed',
            subtitle_export_path: exportKey,
            is_watermarked: watermarkRequired,
            subtitle_export_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);

        logger.info(`[SubtitleStudio] Subtitle burn successfully completed for project ${projectId}`, {
          projectId,
          exportKey,
          sizeBytes: fileSize,
        });
      } catch (err: any) {
        logger.error(`[SubtitleStudio] Subtitle burn failed for project ${projectId}: ${err.message}`, {
          projectId,
          error: err.message,
        });

        await dataRepository
          .from('projects')
          .update({
            subtitle_export_status: 'failed',
            subtitle_export_stage: 'failed',
            subtitle_export_error: err.message || 'Subtitle rendering failed.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('user_id', userId);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  }

  /**
   * Retrieves burn status and progress for polling
   */
  public static async getBurnStatus(
    projectId: string,
    userId: string
  ): Promise<{
    exportStatus: string;
    progress: number;
    stage: string;
    error: string | null;
    downloadUrl: string | null;
    is_watermarked?: boolean;
  }> {
    const { project, exportDownloadUrl } = await this.getProject(projectId, userId);
    return {
      exportStatus: project.subtitle_export_status || 'idle',
      progress: project.subtitle_export_progress || 0,
      stage: project.subtitle_export_stage || 'idle',
      error: project.subtitle_export_error || null,
      downloadUrl: exportDownloadUrl,
      is_watermarked: project.is_watermarked ?? false,
    };
  }
}
