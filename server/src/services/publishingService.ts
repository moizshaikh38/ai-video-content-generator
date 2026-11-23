import {readAutopilotPublishProof,fenceAutopilotPublishProof,assertStoredAutopilotPublishProof} from '../db/repositories/autopilotPublishProofRepository.js';
import {assertSelectionSourceCurrent} from './selectionSourceGuardService.js';
import {runsPublishingWorker} from './runtimePolicy.js';
import {selectPublishMedia,assertPublishMediaSelection,assertPublishObjectSelection,assertReviewedPublishMedia,type PublishMediaSelection} from '../shared/publishMediaSelection.js';
import {workLifecycle} from './queue/workLifecycle.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getMongoDb, getMongoClient } from '../db/mongoClient.js';
import {
  AppError,
  SocialPlatform,
  PublishedPostRecord,
  PublishJobRecord,
  PublishPayload,
  PublishPreviewResult,
  SocialAccountConnectionRecord,
  ClipRecord,
} from '../types/index.js';
import { socialPublishingRegistry } from './publishing/socialPublishingRegistry.js';
import { PlatformPublishCapabilities } from './publishing/types.js';
import { socialProviderRegistry } from './social/socialProviderRegistry.js';
import { decryptToken, encryptToken } from '../utils/tokenEncryption.js';
import { signObjectGet, downloadObjectToFile, headObject } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';

const MAX_RETRY_ATTEMPTS = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes stale lock recovery

export interface CreatePublishRequestDTO {
  userId: string;
  projectId: string;
  clipId?: string | null;
  contentOutputId?: string | null;
  socialConnectionId: string;
  payload: PublishPayload;
  publishType: 'now' | 'scheduled';
  scheduledFor?: string | null; // ISO string
  timezone?: string | null;
}

export class PublishingService {
  /**
   * Deterministic request fingerprint for duplicate & replay protection
   */
  generateFingerprint(
    userId: string,
    connectionId: string,
    clipId: string | null | undefined,
    payload: PublishPayload,
    scheduledFor?: string | null,
    mediaSelection?:PublishMediaSelection,
    approvalIdentity?:string
  ): string {
    const canonical = [
      userId,
      connectionId,
      clipId || 'no_clip',
      payload.title || '',
      payload.caption || '',
      payload.description || '',
      scheduledFor || 'immediate',
    ].join('::');

    return crypto.createHash('sha256').update(approvalIdentity?JSON.stringify([canonical,mediaSelection,approvalIdentity]):mediaSelection?JSON.stringify([canonical,mediaSelection]):canonical).digest('hex');
  }

  /**
   * Return platform capabilities for all supported providers
   */
  getCapabilities(): Record<SocialPlatform, PlatformPublishCapabilities> {
    return socialPublishingRegistry.getAllCapabilities();
  }

  /** Exact rendered output review. Returns a pinned signed URL to its owner,
   * never uploads to a social platform or accepts a caller's media URL. */
  async getPublishReview(userId:string,projectId:string,clipId:string) {
    const db=await getMongoDb();
    const clip=await db.collection<ClipRecord>('clips').findOne({id:clipId,user_id:userId});
    if(!clip||clip.project_id!==projectId)throw new AppError('Selected clip not found in this project.',404,'CLIP_NOT_FOUND');
    if(clip.render_status!=='ready'||!clip.output_storage_path)throw new AppError('Review requires a ready rendered clip.',409,'CLIP_NOT_READY');
    const selection=selectPublishMedia(clip,await headObject('clips',clip.output_storage_path));
    const current=await db.collection<ClipRecord>('clips').findOne({id:clipId,user_id:userId});
    assertPublishMediaSelection({user_id:userId,project_id:projectId,clip_id:clipId,media_selection:selection},current);
    const url=await signObjectGet('clips',selection.objectKey,`clip-${clipId}.mp4`,selection.objectVersionId?{versionId:selection.objectVersionId}:undefined);
    return {selection,url,durationSeconds:clip.duration_seconds};
  }

  /** Explicit composer/account-open read, not called by keystroke previews.
   * No refresh, grants or account writes. Owner/account and scope checked first. */
  async getTikTokComposerOptions(userId:string,connectionId:string) {
    const db=await getMongoDb();
    const conn=await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({id:connectionId,user_id:userId});
    if(!conn||conn.provider!=='tiktok')throw new AppError('Selected TikTok connection not found.',404,'CONNECTION_NOT_FOUND');
    if(conn.status!=='connected')throw new AppError('Selected TikTok connection needs attention.',409,'TIKTOK_CONNECTION_NOT_READY');
    if(!Array.isArray(conn.scopes)||!conn.scopes.includes('video.publish'))throw new AppError('TikTok Direct Post needs video.publish. Upload-only permission cannot load Direct Post creator options. No permission was added.',409,'TIKTOK_DIRECT_POST_SCOPE_REQUIRED');
    if(conn.token_expires_at&&(!(conn.token_expires_at instanceof Date)||!Number.isFinite(conn.token_expires_at.getTime())||conn.token_expires_at.getTime()<=Date.now()))throw new AppError('Selected TikTok connection has expired. Refresh it before loading creator options.',409,'TIKTOK_CONNECTION_NOT_READY');
    const provider=socialPublishingRegistry.getProvider('tiktok');
    if(!provider.getCreatorOptions)throw new AppError('TikTok creator options are unavailable.',503,'TIKTOK_CREATOR_OPTIONS_UNVERIFIED');
    const creator=await provider.getCreatorOptions(decryptToken(conn.access_token));
    return {connectionId:conn.id,providerAccountId:conn.provider_account_id,checkedAt:new Date().toISOString(),creator};
  }

  /**
   * Preview a publish payload without calling provider APIs
   */
  async previewPublish(
    userId: string,
    connectionId: string,
    clipId: string | null | undefined,
    payload: PublishPayload
  ): Promise<PublishPreviewResult> {
    const db = await getMongoDb();
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: connectionId,
      user_id: userId,
    });

    if (!conn) {
      throw new AppError('Connected social account not found or access denied.', 404, 'CONNECTION_NOT_FOUND');
    }

    const provider = socialPublishingRegistry.getProvider(conn.provider);
    const capabilities = provider.getCapabilities();

    let clip: ClipRecord | null = null;
    let mediaMetadata: any = undefined;

    if (clipId) {
      clip = await db.collection<ClipRecord>('clips').findOne({ id: clipId, user_id: userId });
      if (!clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }
      mediaMetadata = {
        clip_id: clip.id,
        duration_seconds: clip.duration_seconds,
        aspect_ratio: clip.aspect_ratio,
        render_status: clip.render_status,
      };
    }

    const hasMedia = Boolean(clip && clip.render_status === 'ready' && clip.output_storage_path);
    const validation = provider.validatePublishRequest(payload, hasMedia);

    const warnings: string[] = [];
    if (conn.provider === 'tiktok' && !conn.scopes?.includes('video.publish')) {
      validation.valid = false;
      warnings.push('TikTok Direct Post is not ready: this connection needs video.publish permission. No permission will be added automatically.');
    }
    if (clip && clip.render_status !== 'ready') {
      warnings.push(`Clip is currently in "${clip.render_status}" status. It must be rendered before publishing.`);
    }

    return {
      valid: validation.valid && (clip ? clip.render_status === 'ready' : true),
      provider: conn.provider,
      account_name: conn.provider_account_name,
      account_username: conn.provider_username,
      platform_requirements: {
        max_title_length: capabilities.maxTitleLength,
        max_description_length: capabilities.maxDescriptionLength,
        supported_media_formats: capabilities.supportedMediaFormats,
        max_video_duration_seconds: capabilities.maxVideoDurationSeconds,
        max_video_size_bytes: capabilities.maxVideoSizeBytes,
        supports_video: capabilities.supportsVideo,
        supports_text_only: capabilities.supportsTextOnly,
      },
      normalized_payload: payload,
      media_metadata: mediaMetadata,
      warnings: [...validation.errors, ...warnings],
    };
  }

  /**
   * Create a Publish Now or Scheduled post record with idempotency safeguards
   */
  async createPublishPost(dto: CreatePublishRequestDTO): Promise<{ post: PublishedPostRecord; job?: PublishJobRecord }> {
    const db = await getMongoDb();

    // 1. Verify social connection ownership
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: dto.socialConnectionId,
      user_id: dto.userId,
    });
    if (!conn) {
      throw new AppError('Connected social account not found or access denied.', 404, 'CONNECTION_NOT_FOUND');
    }

    if (conn.provider === 'tiktok' && !conn.scopes?.includes('video.publish')) {
      throw new AppError('TikTok Direct Post needs video.publish permission. No permission will be added automatically.',409,'TIKTOK_DIRECT_POST_SCOPE_REQUIRED');
    }

    // 2. Verify clip ownership and readiness if provided
    let clip: ClipRecord | null = null;
    let mediaSelection:PublishMediaSelection|undefined;
    if (dto.clipId) {
      clip = await db.collection<ClipRecord>('clips').findOne({ id: dto.clipId, user_id: dto.userId });
      if (!clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }
      if(clip.project_id!==dto.projectId)throw new AppError('Clip does not belong to this project.',409,'PUBLISH_PROJECT_MISMATCH');
      if (clip.render_status !== 'ready' || !clip.output_storage_path) {
        throw new AppError(
          `Clip cannot be published because its render_status is "${clip.render_status}". Only ready clips can be published.`,
          400,
          'CLIP_NOT_READY'
        );
      }
    }

    // 3. Provider validation
    const provider = socialPublishingRegistry.getProvider(conn.provider);
    const capabilities = provider.getCapabilities();
    const hasMedia = Boolean(clip && clip.render_status === 'ready' && clip.output_storage_path);

    if (!hasMedia && !capabilities.supportsTextOnly) {
      throw new AppError(
        `Publish validation failed: ${conn.provider} publishing requires a rendered video clip.`,
        400,
        'VALIDATION_FAILED'
      );
    }

    const validation = provider.validatePublishRequest(dto.payload, hasMedia);
    if (!validation.valid) {
      throw new AppError(`Publish validation failed: ${validation.errors.join('; ')}`, 400, 'VALIDATION_FAILED');
    }

    // 4. Scheduling time validation
    let scheduledDate: Date | null = null;
    if (dto.publishType === 'scheduled') {
      if (!dto.scheduledFor) {
        throw new AppError('scheduledFor timestamp is required for scheduled posts.', 400, 'INVALID_SCHEDULE_TIME');
      }
      scheduledDate = new Date(dto.scheduledFor);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new AppError('Invalid scheduledFor timestamp format.', 400, 'INVALID_TIMESTAMP');
      }
      const now = new Date();
      if (scheduledDate.getTime() <= now.getTime()) {
        throw new AppError('Scheduled time must be in the future.', 400, 'SCHEDULE_TIME_IN_PAST');
      }
    }

    if(clip){
      mediaSelection=selectPublishMedia(clip,await headObject('clips',clip.output_storage_path!));
      if(conn.provider==='tiktok')assertReviewedPublishMedia(dto.payload.platform_custom?.tiktok_reviewed_media,mediaSelection);
      // Storage validation can take time. Do not bind a selection against a
      // newly replaced owner/project/render pointer after that read.
      const current=await db.collection<ClipRecord>('clips').findOne({id:clip.id,user_id:dto.userId});
      assertPublishMediaSelection({user_id:dto.userId,project_id:dto.projectId,clip_id:clip.id,media_selection:mediaSelection},current);
    }

    const runId=dto.payload.platform_custom?.autopilot_run_id;
    const hookApproval=runId===undefined?null:await readAutopilotPublishProof(db,{userId:dto.userId,projectId:dto.projectId,clipId:dto.clipId,runId});
    if(hookApproval){const c=hookApproval.current;await assertSelectionSourceCurrent(dto.userId,dto.projectId,c.clip!.selection_source_receipt,c.clip!.source_storage_path);const head=await headObject('clips',hookApproval.receipt.proof.output_storage_path);const a=hookApproval.receipt.proof.output_artifact_receipt;if(head.size!==a.size||head.etag!==a.etag||(a.version_id&&head.versionId!==a.version_id))throw new AppError('The approved hook video object changed.',409,'AUTOPILOT_PUBLISH_CHANGED');}

    // 5. Idempotency Check via deterministic fingerprint
    const fingerprint = this.generateFingerprint(
      dto.userId,
      dto.socialConnectionId,
      dto.clipId,
      dto.payload,
      dto.scheduledFor,
      mediaSelection,
      hookApproval?.receipt.approval_identity
    );

    const existingPost = await db.collection<PublishedPostRecord>('published_posts').findOne({
      request_fingerprint: fingerprint,
    });

    if (existingPost) {
      // Preserve failed/cancelled history as well. The explicit retry operation
      // owns retries; a repeated create must not erase prior provider outcomes.
      throw new AppError(
        `Duplicate publish request detected. This post is already ${existingPost.status}. Review the existing post instead.`,
        409,
        'DUPLICATE_PUBLISH_REQUEST'
      );
    }

    const now = new Date();
    const postId = crypto.randomUUID();
    const initialStatus = dto.publishType === 'now' ? 'publishing' : 'scheduled';

    const postRecord: PublishedPostRecord = {
      id: postId,
      user_id: dto.userId,
      project_id: dto.projectId,
      ...(dto.clipId ? { clip_id: dto.clipId } : {}),
      ...(mediaSelection?{media_selection:mediaSelection}:{}),
      ...(dto.contentOutputId ? { content_output_id: dto.contentOutputId } : {}),
      social_connection_id: dto.socialConnectionId,
      provider: conn.provider,
      provider_account_id: conn.provider_account_id,
      provider_post_id: null,
      provider_post_url: null,
      status: initialStatus,
      publish_type: dto.publishType,
      scheduled_for: scheduledDate,
      timezone: dto.timezone || 'UTC',
      published_at: null,
      failed_at: null,
      cancelled_at: null,
      retry_count: 0,
      last_error_code: null,
      last_error_message: null,
      request_fingerprint: fingerprint,
      ...(hookApproval?{autopilot_hook_receipt:hookApproval.receipt}:{}),
      payload: dto.payload,
      created_at: now,
      updated_at: now,
    };

    const jobId = crypto.randomUUID();
    const jobRecord: PublishJobRecord = {
      id: jobId,
      user_id: dto.userId,
      published_post_id: postId,
      scheduled_for: scheduledDate || now,
      status: dto.publishType === 'now' ? 'publishing' : 'scheduled',
      attempts: 0,
      locked_at: dto.publishType === 'now' ? now : null,
      started_at: dto.publishType === 'now' ? now : null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };

    const session = (await getMongoClient()).startSession();
    try {
      // A visible post must have its durable worker job. Never compensate a
      // partial failure by deleting history or admit work before commit.
      await session.withTransaction(async () => {
        if(hookApproval){
          await fenceAutopilotPublishProof(db,session,{userId:dto.userId,projectId:dto.projectId,clipId:dto.clipId,runId,expected:hookApproval});
          const liveConnection=await db.collection('social_account_connections').findOne({id:conn.id,user_id:dto.userId},{session});
          if(!liveConnection||liveConnection.provider!==conn.provider||liveConnection.provider_account_id!==conn.provider_account_id)throw new AppError('The selected publishing account changed.',409,'PUBLISH_ACCOUNT_CHANGED');
          const f=await db.collection('social_account_connections').updateOne({_id:liveConnection._id,user_id:dto.userId},{$inc:{autopilot_publish_fence:1}},{session});if(f.matchedCount!==1)throw new AppError('The selected publishing account changed.',409,'PUBLISH_ACCOUNT_CHANGED');
          assertPublishMediaSelection(postRecord,await db.collection('clips').findOne({id:dto.clipId,user_id:dto.userId},{session}));
        }
        await db.collection<PublishedPostRecord>('published_posts').insertOne(postRecord, { session });
        await db.collection<PublishJobRecord>('publish_jobs').insertOne(jobRecord, { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError('This publish request already exists. Review the existing post instead.', 409, 'DUPLICATE_PUBLISH_REQUEST');
      }
      // An unknown commit result is not proof of failure. Do not launch or
      // delete anything; the persisted fingerprint keeps a later create safe.
      throw error;
    } finally {
      await session.endSession();
    }

    logger.info('Publish post created', {
      postId,
      jobId,
      provider: conn.provider,
      publishType: dto.publishType,
      userId: dto.userId,
    });

    // If "Publish Now", kick off asynchronous publishing immediately in background
    if (dto.publishType === 'now') {
      this.executePublishJob(jobId).catch((err) => {
        logger.error('Background publish execution failed', { jobId, err });
      });
    }

    return { post: postRecord, job: jobRecord };
  }

  /**
   * Executes a single publishing job with atomic claiming, token refreshing, and error handling
   */
  async executePublishJob(jobId:string):Promise<void>{return workLifecycle.run('publish-job',()=>this.executeTrackedPublishJob(jobId));}
  private async executeTrackedPublishJob(jobId: string): Promise<void> {
    const db = await getMongoDb();
    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({ id: jobId });
    if (!job || typeof job.user_id !== 'string' || !job.user_id.trim()) return;

    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: job.published_post_id, user_id: job.user_id });
    if (!post || post.status === 'cancelled') {
      await db.collection('publish_jobs').updateOne({ id: jobId, user_id: job.user_id }, { $set: { status: 'cancelled', updated_at: new Date() } });
      return;
    }

    if (post.status === 'published') {
      await db.collection('publish_jobs').updateOne({id:jobId,user_id:job.user_id},{$set:{status:'completed',completed_at:post.published_at||new Date(),updated_at:new Date()}});
      return;
    }
    if (job.status !== 'publishing') return;
    if (job.provider_attempt_started_at !== undefined && !job.provider_pending_id) {
      await this.markJobFailed(jobId, post.id, 'PUBLISH_OUTCOME_UNKNOWN', 'A previous delivery attempt may have reached the platform. Check the connected platform before taking any further action. Automatic resend is disabled.', false);
      return;
    }

    // Step 1: Resolve connection & token
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: post.social_connection_id,
      user_id: post.user_id,
    });

    if (!conn) {
      await this.markJobFailed(jobId, post.id, 'CONNECTION_NOT_FOUND', 'Connected account was deleted or not found.', false);
      return;
    }

    if(conn.provider!==post.provider||conn.provider_account_id!==post.provider_account_id){
      await this.markJobFailed(jobId,post.id,'PUBLISH_ACCOUNT_CHANGED','The selected social account changed. Review this post before publishing.',false);return;
    }

    if (!job.provider_pending_id && post.provider === 'tiktok' && !conn.scopes?.includes('video.publish')) {
      await this.markJobFailed(jobId, post.id, 'TIKTOK_DIRECT_POST_SCOPE_REQUIRED', 'TikTok Direct Post needs video.publish permission. Upload-only permission cannot publish directly. No post was sent.', false);
      return;
    }

    if (!job.provider_pending_id && post.provider === 'instagram' && !conn.scopes?.includes('instagram_content_publish')) {
      await this.markJobFailed(jobId,post.id,'INSTAGRAM_PUBLISH_SCOPE_REQUIRED','Instagram publishing permission is missing. No post was sent.',false);return;
    }

    // A scheduled marked post must still have its exact approved package.
    // Refuse before token refresh or any provider call. Never silently reapprove.
    if(!job.provider_pending_id&&((post as any).autopilot_hook_receipt||post.payload.platform_custom?.autopilot_run_id!==undefined)){try{
      const stored=(post as any).autopilot_hook_receipt;
      const current=await readAutopilotPublishProof(db,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:stored?.run_id??post.payload.platform_custom?.autopilot_run_id});
      assertStoredAutopilotPublishProof(stored,current.receipt);
      const c=current.current;await assertSelectionSourceCurrent(post.user_id,post.project_id,c.clip!.selection_source_receipt,c.clip!.source_storage_path);
    }catch(error:any){await this.markJobFailed(jobId,post.id,error.code||'AUTOPILOT_PUBLISH_CHANGED',error.message||'The approved hook package changed.',false);return;}}

    // Step 2: Check & refresh token if expired
    let accessToken: string;
    try {
      const now = new Date();
      if (conn.token_expires_at && conn.token_expires_at.getTime() - now.getTime() < 300000) {
        // Expired or expiring within 5 mins: refresh
        const oauthProvider = socialProviderRegistry.getProvider(conn.provider);
        const rawRefresh = conn.refresh_token ? decryptToken(conn.refresh_token) : decryptToken(conn.access_token);
        const refResult = await oauthProvider.refreshAccessToken(rawRefresh);
        accessToken = refResult.accessToken;

        const updateData: any = {
          access_token: encryptToken(refResult.accessToken),
          token_expires_at: refResult.expiresInSeconds ? new Date(now.getTime() + refResult.expiresInSeconds * 1000) : null,
          updated_at: now,
        };
        if(refResult.scopes){updateData.scopes=refResult.scopes;conn.scopes=refResult.scopes;}
        if (refResult.refreshToken) {
          updateData.refresh_token = encryptToken(refResult.refreshToken);
        }
        await db.collection('social_account_connections').updateOne({ id: conn.id }, { $set: updateData });
      } else {
        accessToken = decryptToken(conn.access_token);
      }
    } catch (err: any) {
      logger.warn('Token refresh prior to publishing failed', { connectionId: conn.id, err: err?.message });
      await this.markJobFailed(jobId, post.id, 'AUTH_REFRESH_FAILED', `Token refresh failed: ${err?.message}`, false);
      return;
    }

    if (!job.provider_pending_id && post.provider==='instagram'&&!conn.scopes?.includes('instagram_content_publish')) {
      await this.markJobFailed(jobId,post.id,'INSTAGRAM_PUBLISH_SCOPE_REQUIRED','Current Instagram publishing permission is missing. No post was sent.',false);return;
    }

    if (job.provider_pending_id) {
      await this.resolvePendingPublish(job, post, accessToken, conn.scopes);
      return;
    }

    // Step 3: Prepare media if clip is specified
    let tempFilePath: string | null = null;
    let signedMediaUrl: string | null = null;
    let mediaSize: number = 0;
    let mediaDurationSeconds: number | undefined;

    if (post.clip_id) {
      const clip = await db.collection<ClipRecord>('clips').findOne({ id: post.clip_id, user_id: post.user_id });
      if (!clip || !clip.output_storage_path) {
        await this.markJobFailed(jobId, post.id, 'CLIP_NOT_FOUND', 'Rendered clip output path not found.', false);
        return;
      }

      // A scheduled job must recheck the creation-time requirement. An old
      // output path retained during a new render is not current ready media.
      if (clip.render_status !== 'ready') {
        await this.markJobFailed(jobId, post.id, 'CLIP_NOT_READY', 'Clip is no longer ready. Review the clip before publishing.', false);
        return;
      }

      mediaDurationSeconds = clip.duration_seconds;
      try {
        const selection=assertPublishMediaSelection(post,clip);
        const selectedKey=selection?.objectKey??clip.output_storage_path;
        const headInfo = await headObject('clips', selectedKey);
        assertPublishObjectSelection(selection,headInfo);
        mediaSize = headInfo.size;

        // Create temporary signed URL for providers that pull via URL (e.g. Meta, TikTok)
        signedMediaUrl = await signObjectGet('clips', selectedKey, `clip-${clip.id}.mp4`,selection?.objectVersionId?{versionId:selection.objectVersionId}:undefined);

        // If provider requires direct byte stream (e.g. YouTube resumable upload), download to secure temp file
        if (post.provider === 'youtube') {
          const tempDir = os.tmpdir();
          tempFilePath = path.join(tempDir, `vireo-upload-${crypto.randomUUID()}.mp4`);
          const downloaded=await downloadObjectToFile('clips', selectedKey, tempFilePath,selection?{requireSnapshotReceipt:true,expectedObject:{size:selection.bytes,etag:selection.etag,versionId:selection.objectVersionId}}:undefined);
          if(selection){
            if(!downloaded.sourceReceipt)throw new AppError('Selected video bytes could not be verified.',409,'PUBLISH_MEDIA_CHANGED');
            assertPublishObjectSelection({...selection,objectVersionId:null},{size:downloaded.sizeBytes,etag:downloaded.sourceReceipt.etag});
          }
        }
      } catch (err: any) {
        if(err?.code==='SOURCE_VERSION_CHANGED')err=new AppError('Selected video bytes changed. Review the post before publishing.',409,'PUBLISH_MEDIA_CHANGED');
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        await this.markJobFailed(jobId, post.id, err?.code==='PUBLISH_MEDIA_CHANGED'?'PUBLISH_MEDIA_CHANGED':'MEDIA_FETCH_FAILED', err?.code==='PUBLISH_MEDIA_CHANGED'?err.message:`Failed to retrieve media: ${err?.message}`, err?.code!=='PUBLISH_MEDIA_CHANGED');
        return;
      }
    }

    // Step 4: Execute provider publish
    const publishProvider = socialPublishingRegistry.getProvider(post.provider);

    let providerEntered = false;
    try {
      // A one-way marker is persisted before the first external side effect.
      // Ambiguous crashes/transport errors never authorize another upload.
      let dispatch:any;
      if((post as any).autopilot_hook_receipt){
        try{const current=await readAutopilotPublishProof(db,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:(post as any).autopilot_hook_receipt.run_id});assertStoredAutopilotPublishProof((post as any).autopilot_hook_receipt,current.receipt);await assertSelectionSourceCurrent(post.user_id,post.project_id,current.current.clip!.selection_source_receipt,current.current.clip!.source_storage_path);}catch(error:any){await this.markJobFailed(jobId,post.id,error.code||'AUTOPILOT_PUBLISH_CHANGED',error.message||'Approved source changed before dispatch.',false);return;}
        const tx=(await getMongoClient()).startSession();try{dispatch=await tx.withTransaction(async()=>{
          const stored=(post as any).autopilot_hook_receipt;
          const expected=await readAutopilotPublishProof(db,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:stored.run_id},tx);
          assertStoredAutopilotPublishProof(stored,expected.receipt);
          await fenceAutopilotPublishProof(db,tx,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:stored.run_id,expected});
          const currentConnection=await db.collection('social_account_connections').findOne({id:conn.id,user_id:post.user_id},{session:tx});
          if(!currentConnection||currentConnection.provider!==post.provider||currentConnection.provider_account_id!==post.provider_account_id||(post.provider==='instagram'&&!currentConnection.scopes?.includes('instagram_content_publish'))||(post.provider==='tiktok'&&!currentConnection.scopes?.includes('video.publish')))throw new AppError('The selected publishing account or permission changed.',409,'PUBLISH_ACCOUNT_CHANGED');
          await db.collection('social_account_connections').updateOne({_id:currentConnection._id,user_id:post.user_id},{$inc:{autopilot_publish_fence:1}},{session:tx});
          return await db.collection('publish_jobs').updateOne({id:jobId,user_id:job.user_id,published_post_id:post.id,status:'publishing',provider_attempt_started_at:{$exists:false}},{$set:{provider_attempt_started_at:new Date(),updated_at:new Date()}},{session:tx});
        },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}catch(error:any){await this.markJobFailed(jobId,post.id,error.code||'AUTOPILOT_PUBLISH_CHANGED',error.message||'Approved hook changed before dispatch.',false);return;}finally{await tx.endSession();}
      }else{
        dispatch = await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        {id:jobId,user_id:job.user_id,published_post_id:post.id,status:'publishing',provider_attempt_started_at:{$exists:false}},
        {$set:{provider_attempt_started_at:new Date(),updated_at:new Date()}},
        {writeConcern:{w:'majority'}}
      );
      }
      if (dispatch.matchedCount !== 1) return;
      providerEntered = true;
      const pubResult = await publishProvider.publish({
        accessToken,
        payload: post.payload,
        mediaFilePath: tempFilePath || undefined,
        mediaUrl: signedMediaUrl || undefined,
        mediaSize,
        grantedScopes: conn.scopes,
        providerAccountId: post.provider_account_id,
        mediaDurationSeconds,
      });

      await this.recordPublishOutcome(job, post, pubResult);
    } catch (err: any) {
      if (providerEntered) {
        // The post write may have succeeded before the job acknowledgement
        // failed. Never downgrade a verified published record to failed.
        const persisted = await db.collection<PublishedPostRecord>('published_posts').findOne({id:post.id,user_id:post.user_id});
        if (persisted?.status === 'published' && persisted.provider_post_id) return;
        const recoverable = await db.collection<PublishJobRecord>('publish_jobs').findOne({id:jobId,user_id:job.user_id});
        if (recoverable?.provider_pending_id) return; // persisted receipt is resolved, never re-uploaded
        await this.markJobFailed(jobId, post.id, 'PUBLISH_OUTCOME_UNKNOWN', 'The platform may have accepted this post, but delivery could not be confirmed. Check the connected platform before taking any further action. Automatic resend is disabled.', false);
      } else {
        // No provider call was entered. The dispatch write itself may still
        // have committed, so recovery must respect any persisted marker.
        throw err;
      }
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
    }
  }

  /** Persist the receipt before acknowledging pending. A crash can then resume
   * checks/continuation without entering the upload path a second time.
   * A stale processing read must never erase an irreversible dispatch marker. */
  private async recordPublishOutcome(job: PublishJobRecord, post: PublishedPostRecord, result: import('./publishing/types.js').PublishExecutionResult): Promise<void> {
    if (!result || typeof result.providerPostId !== 'string' || !result.providerPostId.trim() ||
        (result.outcome !== undefined && !['pending', 'published'].includes(result.outcome))) {
      throw new AppError('The platform did not return a verified posting outcome.', 502, 'PUBLISH_VERIFICATION_FAILED');
    }
    const db = await getMongoDb(), now = new Date();
    if (result.outcome === 'pending') {
      if (!socialPublishingRegistry.getProvider(post.provider).resolvePending ||
          (job.provider_pending_id && job.provider_pending_id !== result.providerPostId)) {
        throw new AppError('The platform submission cannot be safely resolved.', 502, 'PUBLISH_VERIFICATION_FAILED');
      }
      const savedReceipt = await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        {id:job.id,user_id:job.user_id,status:'publishing',
          ...(post.provider==='instagram' && !result.metadata?.publishDispatchStarted ? {'provider_pending_metadata.publishDispatchStarted':{$ne:true}} : {})},
        {$set:{provider_pending_id:result.providerPostId,provider_pending_started_at:job.provider_pending_started_at || now,provider_pending_metadata:{...job.provider_pending_metadata,...result.metadata},
          status:'scheduled',scheduled_for:new Date(now.getTime()+60000),next_retry_at:null,locked_at:null,updated_at:now}},
        {writeConcern:{w:'majority'}},
      );
      if (savedReceipt.matchedCount !== 1) throw new AppError('Submission receipt could not be saved.',502,'PUBLISH_RECEIPT_NOT_SAVED');
      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        {id:post.id,user_id:post.user_id,status:{$nin:['published','failed','cancelled']}},
        {$set:{status:'publishing',metadata:{...post.metadata,...result.metadata,confirmation:'awaiting_platform'},updated_at:now}},
      );
      return;
    }
    // Preserve confirmed publication while surfacing incomplete/unknown caption
    // details through the history API's existing visible feedback field. Never
    // turn partial success into failed/retryable delivery or resend the video.
    const publicationReview = post.provider==='instagram' && (result.metadata?.partialSuccess || result.metadata?.captionAttachmentVerified===false)
      ? (result.metadata?.partialSuccess ? 'Published, but Instagram reported incomplete caption or attachment settings. Check the selected Instagram account. Do not repost automatically.' : 'Publication confirmed, but caption and attachments could not be verified. Check the selected Instagram account. Do not repost automatically.') : null;
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      {id:post.id,user_id:post.user_id,status:{$nin:['failed','cancelled']}},
      {$set:{status:'published',provider_post_id:result.providerPostId,provider_post_url:result.providerPostUrl || null,
        published_at:now,metadata:{...post.metadata,...result.metadata},last_error_code:publicationReview?'PUBLISHED_REVIEW_REQUIRED':null,last_error_message:publicationReview,updated_at:now}},
    );
    await db.collection<PublishJobRecord>('publish_jobs').updateOne(
      {id:job.id,user_id:job.user_id},{$set:{status:'completed',completed_at:now,updated_at:now}},
    );
    logger.info('Publishing confirmed',{postId:post.id,provider:post.provider});
  }

  private async resolvePendingPublish(job: PublishJobRecord, post: PublishedPostRecord, accessToken: string, grantedScopes?:string[]): Promise<void> {
    const provider = socialPublishingRegistry.getProvider(post.provider);
    const started = job.provider_pending_started_at?.getTime();
    if (!provider.resolvePending || !started || !Number.isFinite(started) || Date.now()-started > (provider.pendingMaxDurationMs ?? 24*60*60*1000)) {
      await this.markJobFailed(job.id,post.id,'PUBLISH_OUTCOME_UNKNOWN','Publication is still unconfirmed. Check the selected platform account. This submission will not be uploaded again.',false);
      return;
    }
    try {
      const db=await getMongoDb();
      const result = provider.continuePending ? await provider.continuePending(
        {accessToken,payload:post.payload,providerAccountId:post.provider_account_id,grantedScopes},job.provider_pending_id!,job.provider_pending_metadata || {},async(metadata)=>{
          let saved:any;
          if((post as any).autopilot_hook_receipt||post.payload.platform_custom?.autopilot_run_id!==undefined){
            const stored=(post as any).autopilot_hook_receipt;
            const expected=await readAutopilotPublishProof(db,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:stored?.run_id??post.payload.platform_custom?.autopilot_run_id});
            assertStoredAutopilotPublishProof(stored,expected.receipt);
            await assertSelectionSourceCurrent(post.user_id,post.project_id,expected.current.clip!.selection_source_receipt,expected.current.clip!.source_storage_path);
            const artifact=expected.receipt.proof.output_artifact_receipt,head=await headObject('clips',artifact.key);
            if(head.size!==artifact.size||head.etag!==artifact.etag||(artifact.version_id&&head.versionId!==artifact.version_id))throw new AppError('Approved output changed before publication.',409,'AUTOPILOT_PUBLISH_CHANGED');
            const tx=(await getMongoClient()).startSession();try{saved=await tx.withTransaction(async()=>{
              await fenceAutopilotPublishProof(db,tx,{userId:post.user_id,projectId:post.project_id,clipId:post.clip_id,runId:stored.run_id,expected});
              const currentConnection=await db.collection('social_account_connections').findOne({id:post.social_connection_id,user_id:post.user_id},{session:tx});
              if(!currentConnection||currentConnection.provider!==post.provider||currentConnection.provider_account_id!==post.provider_account_id||!currentConnection.scopes?.includes('instagram_content_publish'))throw new AppError('The selected publishing account or permission changed before publication.',409,'PUBLISH_ACCOUNT_CHANGED');
              await db.collection('social_account_connections').updateOne({_id:currentConnection._id,user_id:post.user_id},{$inc:{autopilot_publish_fence:1}},{session:tx});
              return await db.collection('publish_jobs').updateOne({id:job.id,user_id:job.user_id,published_post_id:post.id,status:'publishing',provider_pending_id:job.provider_pending_id,'provider_pending_metadata.publishDispatchStarted':{$ne:true}},{$set:{provider_pending_metadata:metadata,updated_at:new Date()}},{session:tx});
            },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await tx.endSession();}
          }else{
            saved=await db.collection<PublishJobRecord>('publish_jobs').updateOne(
            {id:job.id,user_id:job.user_id,published_post_id:post.id,status:'publishing',provider_pending_id:job.provider_pending_id,'provider_pending_metadata.publishDispatchStarted':{$ne:true}},
            {$set:{provider_pending_metadata:metadata,updated_at:new Date()}},{writeConcern:{w:'majority'}});
          }
          if(saved.matchedCount!==1)throw new AppError('Publish dispatch was already started or could not be checkpointed.',409,'PUBLISH_CHECKPOINT_UNVERIFIED');
        }) : await provider.resolvePending(accessToken,job.provider_pending_id!);
      await this.recordPublishOutcome(job,post,result);
    } catch (error: any) {
      if (['PUBLISH_ACCOUNT_CHANGED','AUTOPILOT_PUBLISH_CHANGED','AUTOPILOT_HOOK_OUTPUT_REQUIRED','AUTOPILOT_APPROVAL_CONFLICT','TIKTOK_SUBMISSION_FAILED','INSTAGRAM_SUBMISSION_FAILED','INSTAGRAM_SUBMISSION_BINDING_CHANGED','INSTAGRAM_PUBLISH_SCOPE_REQUIRED'].includes(error?.code)) {
        await this.markJobFailed(job.id,post.id,error.code,error.message || 'The saved platform submission failed. No automatic new upload will be made.',false);
        return;
      }
      // Status reads can be retried safely. A transport error never permits
      // resending the media. Keep the durable receipt on the SAME job.
      const db = await getMongoDb(), now = new Date();
      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        {id:job.id,user_id:job.user_id,status:'publishing'},
        {$set:{status:'scheduled',scheduled_for:new Date(now.getTime()+60000),next_retry_at:null,locked_at:null,updated_at:now}},
      );
    }
  }

  private async markJobFailed(
    jobId: string,
    postId: string,
    errorCode: string,
    errorMessage: string,
    isRetryable: boolean
  ): Promise<void> {
    const db = await getMongoDb();
    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({ id: jobId });
    const attempts = (job?.attempts || 0) + 1;
    const now = new Date();
    const sanitizedError = JobReliabilityService.sanitizeErrorMessage(errorMessage);
    const retryEligible = isRetryable && JobReliabilityService.isTransientError(new Error(errorMessage));

    if (retryEligible && attempts < MAX_RETRY_ATTEMPTS) {
      const backoffDelayMs = JobReliabilityService.computeBackoffDelayMs(attempts, { baseDelayMs: 30000, maxDelayMs: 300000 });
      const nextRetryAt = new Date(now.getTime() + backoffDelayMs);

      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: 'scheduled',
            attempts,
            locked_at: null,
            next_retry_at: nextRetryAt,
            last_error: sanitizedError,
            updated_at: now,
          },
        }
      );

      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        { id: postId },
        {
          $set: {
            retry_count: attempts,
            last_error_code: errorCode,
            last_error_message: sanitizedError,
            updated_at: now,
          },
        }
      );

      logger.warn('Publishing failed, scheduled for retry', { jobId, attempts, nextRetryAt });
    } else {
      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: 'failed',
            attempts,
            locked_at: null,
            last_error: sanitizedError,
            updated_at: now,
          },
        }
      );

      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        { id: postId },
        {
          $set: {
            status: 'failed',
            failed_at: now,
            retry_count: attempts,
            last_error_code: errorCode,
            last_error_message: sanitizedError,
            updated_at: now,
          },
        }
      );

      logger.error('Publishing permanently failed', { jobId, errorCode, errorMessage: sanitizedError });
    }
  }

  /**
   * Background processor loop: claims scheduled jobs and recovers stale locks
   */
  async processDueJobs():Promise<number>{
    if(!runsPublishingWorker()||workLifecycle.isDraining())return 0;
    return workLifecycle.run('publishing-sweep',()=>this.executeDueJobs());
  }
  private async executeDueJobs(): Promise<number> {
    const db = await getMongoDb();
    const now = new Date();
    const workerId = `publish_worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Recover stale locks (jobs stuck in publishing > 5 minutes)
    const staleCutoff = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    await db.collection<PublishJobRecord>('publish_jobs').updateMany(
      {
        status: 'publishing',
        locked_at: { $lt: staleCutoff },
      },
      {
        $set: {
          status: 'scheduled',
          locked_at: null,
          updated_at: now,
        },
      }
    );

    // 2. Atomically claim one due job
    const claimedJob = await db.collection<PublishJobRecord>('publish_jobs').findOneAndUpdate(
      {
        status: 'scheduled',
        scheduled_for: { $lte: now },
        $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
      },
      {
        $set: {
          status: 'publishing',
          worker_id: workerId,
          locked_at: now,
          started_at: now,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!claimedJob) return 0;

    await this.executePublishJob(claimedJob.id);
    return 1;
  }

  /**
   * Cancel a scheduled post before publishing starts
   */
  async cancelScheduledPost(userId: string, postId: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'scheduled') {
      throw new AppError(`Cannot cancel post with status "${post.status}". Only scheduled posts can be cancelled.`, 400, 'CANNOT_CANCEL');
    }

    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId },
      { $set: { status: 'cancelled', cancelled_at: now, updated_at: now } }
    );

    await db.collection<PublishJobRecord>('publish_jobs').updateOne(
      { published_post_id: postId },
      { $set: { status: 'cancelled', updated_at: now } }
    );

    logger.info('Scheduled post cancelled successfully', { postId, userId });
  }

  /**
   * Reschedule an existing scheduled post
   */
  async reschedulePost(userId: string, postId: string, newScheduledFor: string, timezone?: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'scheduled') {
      throw new AppError('Only scheduled posts can be rescheduled.', 400, 'CANNOT_RESCHEDULE');
    }

    const newDate = new Date(newScheduledFor);
    if (Number.isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
      throw new AppError('New schedule time must be a valid future timestamp.', 400, 'INVALID_SCHEDULE_TIME');
    }

    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId },
      {
        $set: {
          scheduled_for: newDate,
          timezone: timezone || post.timezone,
          updated_at: now,
        },
      }
    );

    await db.collection<PublishJobRecord>('publish_jobs').updateOne(
      { published_post_id: postId },
      {
        $set: {
          scheduled_for: newDate,
          updated_at: now,
        },
      }
    );

    logger.info('Post rescheduled', { postId, newScheduledFor });
  }

  /**
   * Retry a failed post
   */
  async retryFailedPost(userId: string, postId: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'failed') {
      throw new AppError('Only failed posts can be retried.', 400, 'CANNOT_RETRY');
    }

    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({published_post_id:postId,user_id:userId});
    if (post.last_error_code === 'PUBLISH_OUTCOME_UNKNOWN' || job?.provider_attempt_started_at !== undefined) {
      throw new AppError('Delivery may already have reached the platform. Check the connected platform; this request cannot be resent automatically.',409,'PUBLISH_OUTCOME_UNKNOWN');
    }
    if (!job) throw new AppError('The saved publish job is missing. No retry was started.',409,'PUBLISH_JOB_MISSING');
    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId, user_id:userId },
      {
        $set: {
          status: 'publishing',
          failed_at: null,
          last_error_code: null,
          last_error_message: null,
          updated_at: now,
        },
      }
    );

    if (job) {
      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: job.id },
        {
          $set: {
            status: 'publishing',
            locked_at: now,
            started_at: now,
            completed_at: null,
            next_retry_at: null,
            last_error: null,
            updated_at: now,
          },
        }
      );
      this.executePublishJob(job.id).catch((err) => {
        logger.error('Background retry failed', { jobId: job.id, err });
      });
    }
  }

  /**
   * Get user's published posts history with optional status and platform filters
   */
  async getUserPosts(
    userId: string,
    filters?: { status?: string; provider?: string; limit?: number; offset?: number }
  ): Promise<{ posts: PublishedPostRecord[]; total: number }> {
    const db = await getMongoDb();
    const query: any = { user_id: userId };
    if (filters?.status) query.status = filters.status;
    if (filters?.provider) query.provider = filters.provider;

    const limit = Math.min(filters?.limit || 50, 100);
    const offset = filters?.offset || 0;

    const [posts, total] = await Promise.all([
      db
        .collection<PublishedPostRecord>('published_posts')
        .find(query)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection<PublishedPostRecord>('published_posts').countDocuments(query),
    ]);

    return { posts, total };
  }

  async getPostById(userId: string, postId: string): Promise<PublishedPostRecord> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({
      id: postId,
      user_id: userId,
    });
    if (!post) {
      throw new AppError('Post not found or access denied.', 404, 'POST_NOT_FOUND');
    }
    return post;
  }
}

export const publishingService = new PublishingService();
