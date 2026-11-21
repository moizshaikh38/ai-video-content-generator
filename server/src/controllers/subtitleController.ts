import {projectQuotaPolicy} from '../db/repositories/projectQuotaRepository.js';
import {UrlIngestionService} from '../services/urlIngestionService.js';
import {dataRepository} from '../db/repositories/dataRepository.js';
import { Response } from 'express';
import crypto from 'node:crypto';
import { AuthenticatedRequest, isValidUUID, AppError } from '../types/index.js';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { EntitlementService } from '../services/entitlementService.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { getMongoDb } from '../db/mongoClient.js';
import { config } from '../config/index.js';

export class SubtitleController {
  public static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    const { title, source_type, source_url, source_filename, file_size } = req.body || {};

    // Validate user entitlements for project creation
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);

    // Validate file size limit against plan entitlements and server cap
    if (file_size !== undefined && file_size !== null) {
      const bytes = Number(file_size);
      const effectiveMaxBytes = Math.min(config.maxVideoBytes, entitlements.limits.maxFileSizeBytes);
      if (isNaN(bytes) || bytes < 0 || bytes > effectiveMaxBytes) {
        res.status(400).json({
          status: 'error',
          code: 'FILE_SIZE_EXCEEDED',
          message: `Video file exceeds your plan limit of ${Math.round(entitlements.limits.maxFileSizeBytes / (1024 * 1024))} MB.`,
          limit_bytes: effectiveMaxBytes,
        });
        return;
      }
    }

    // Validate monthly project creation limit
    if (!entitlements.isUnlimited) {
      const db = await getMongoDb();
      const currentMonthStart = new Date();
      currentMonthStart.setUTCDate(1);
      currentMonthStart.setUTCHours(0, 0, 0, 0);

      const projectCount = await db.collection('projects').countDocuments({
        user_id: userId,
        $or: [
          { created_at: { $gte: currentMonthStart } },
          { created_at: { $gte: currentMonthStart.toISOString() } },
        ],
      });

      if (projectCount >= entitlements.limits.maxProjects) {
        res.status(403).json({
          status: 'error',
          code: 'MONTHLY_PROJECT_LIMIT_EXCEEDED',
          message: `Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxProjects} projects per month. Please upgrade your plan to create more projects.`,
          limit: entitlements.limits.maxProjects,
          current: projectCount,
        });
        return;
      }
    }

    const project = await SubtitleStudioService.createProject(userId, {
      title,
      source_type,
      source_url,
      source_filename,
    });

    res.status(201).json({
      status: 'ok',
      project,
    });
  }

  /** Source import only. Transcription and spending retain their separate route. */
  public static async ingestProjectUrl(req: AuthenticatedRequest,res: Response):Promise<void>{
    const userId=req.user?.id;
    if(!userId){res.status(401).json({status:'error',code:'AUTH_REQUIRED',message:'User not authenticated.'});return;}
    const {url,title}=req.body||{};
    if(typeof url!=='string'||!url.trim()){res.status(400).json({status:'error',code:'INVALID_URL',message:'Valid video URL is required.'});return;}
    const entitlements=await EntitlementService.resolveUserEntitlements(userId,req.user?.email);
    if(!entitlements.isUnlimited){
      const db=await getMongoDb(),start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);
      const count=await db.collection('projects').countDocuments({user_id:userId,$or:[{created_at:{$gte:start}},{created_at:{$gte:start.toISOString()}}]});
      if(count>=entitlements.limits.maxProjects){res.status(403).json({status:'error',code:'MONTHLY_PROJECT_LIMIT_EXCEEDED',message:`Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxProjects} projects per month.`,limit:entitlements.limits.maxProjects,current:count});return;}
    }
    const result=await UrlIngestionService.ingestUrlToProject({userId,url:url.trim(),title:typeof title==='string'?title.trim():undefined,creationPlanId:entitlements.planId,projectQuota:projectQuotaPolicy(entitlements),maxBytes:Math.min(config.maxVideoBytes,entitlements.limits.maxFileSizeBytes),subtitleProject:{hormoziAllowed:EntitlementService.isPresetAllowed(entitlements,'hormozi')}});
    const {data:project,error}=await dataRepository.from('projects').select('*').eq('id',result.projectId).eq('user_id',userId).eq('project_type','subtitles').single();
    if(error||!project)throw new AppError('Failed to load imported subtitle project.',500,'DB_ERROR');
    res.status(201).json({status:'ok',project});
  }

  public static async listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    const projects = await SubtitleStudioService.listProjects(userId);
    res.status(200).json({
      status: 'ok',
      projects,
    });
  }

  public static async getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const result = await SubtitleStudioService.getProject(id, userId);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  }

  public static async transcribeProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const rawAttemptId = req.headers['x-processing-attempt-id'] as string;
    const attemptId = rawAttemptId && isValidUUID(rawAttemptId) ? rawAttemptId : crypto.randomUUID();

    try {
      const result = await SubtitleStudioService.transcribeProject(id, userId, attemptId, req.user?.email);
      res.status(200).json({
        status: 'ok',
        message: 'Video successfully transcribed.',
        ...result,
      });
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'INSUFFICIENT_CREDITS') {
        const wallet = await CreditWalletService.getWalletSummary(userId, req.user?.email).catch(() => null);
        const { project } = await SubtitleStudioService.getProject(id, userId).catch(() => ({ project: null }));
        const duration = Number(project?.duration_seconds) > 0 ? Number(project?.duration_seconds) : 60;
        const required = CreditPricingService.calculateCoreProcessingCost(duration).credits;
        const available = wallet?.available_credits ?? 0;
        res.status(403).json({
          status: 'error',
          code: 'INSUFFICIENT_CREDITS',
          message: err.message,
          required_credits: required,
          available_credits: available,
          missing_credits: Math.max(0, required - available),
        });
        return;
      }
      throw err;
    }
  }

  public static async estimateCost(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    let isReusedTranscript = false;
    let durationSeconds = Number(req.query.duration_seconds || req.query.duration || 0);

    if (id && isValidUUID(id)) {
      try {
        const { project } = await SubtitleStudioService.getProject(id, userId);
        if (project.source_url) {
          const reusable = await SubtitleStudioService.findReusableTranscript(userId, id, project.source_url);
          if (reusable) {
            isReusedTranscript = true;
          }
        }
        if (!durationSeconds && project.duration_seconds) {
          durationSeconds = Number(project.duration_seconds);
        }
      } catch {}
    }

    if (!durationSeconds || durationSeconds <= 0) {
      durationSeconds = 60;
    }

    const pricing = isReusedTranscript
      ? { credits: 0, units: 0, rateDescription: 'Transcript Reused (0 credits • Free)' }
      : CreditPricingService.calculateCoreProcessingCost(durationSeconds);

    const wallet = await CreditWalletService.getWalletSummary(userId, req.user?.email);

    res.status(200).json({
      status: 'ok',
      data: {
        operation_id: 'core_video_processing',
        estimated_credits: pricing.credits,
        is_reused_transcript: isReusedTranscript,
        rate_description: pricing.rateDescription,
        available_credits: wallet.available_credits,
        has_sufficient_credits: wallet.is_unlimited || wallet.available_credits >= pricing.credits,
        is_unlimited: wallet.is_unlimited,
        duration_seconds: durationSeconds,
      },
    });
  }

  public static async updateCues(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;
    const { cues } = req.body || {};

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const updatedCues = await SubtitleStudioService.updateCues(id, userId, cues);
    res.status(200).json({
      status: 'ok',
      message: 'Subtitles updated successfully.',
      cues: updatedCues,
    });
  }

  public static async updateStyle(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;
    const { style } = req.body || {};

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const updatedStyle = await SubtitleStudioService.updateStyle(id, userId, style);
    res.status(200).json({
      status: 'ok',
      message: 'Subtitle styling saved.',
      style: updatedStyle,
    });
  }

  public static async exportBurn(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const result = await SubtitleStudioService.exportBurnedVideo(id, userId);
    res.status(202).json({
      status: 'ok',
      ...result,
    });
  }

  public static async getBurnStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const status = await SubtitleStudioService.getBurnStatus(id, userId);
    res.status(200).json({
      status: 'ok',
      burnStatus: status,
    });
  }

  public static async exportSRT(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const srt = await SubtitleStudioService.exportSRT(id, userId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subtitles_${id.slice(0, 8)}.srt"`);
    res.status(200).send(srt);
  }

  public static async exportVTT(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
      return;
    }

    if (!id || !isValidUUID(id)) {
      res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
      return;
    }

    const vtt = await SubtitleStudioService.exportVTT(id, userId);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subtitles_${id.slice(0, 8)}.vtt"`);
    res.status(200).send(vtt);
  }
}
