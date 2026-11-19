import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * Instagram Publishing Provider
 * Meta Graph API Video/Reels Publishing Container Flow:
 * 1. POST graph.facebook.com/v19.0/{ig_user_id}/media (media_type=REELS, video_url=...)
 * 2. GET graph.facebook.com/v19.0/{creation_id}?fields=status_code (wait for FINISHED)
 * 3. POST graph.facebook.com/v19.0/{ig_user_id}/media_publish (creation_id=...)
 */
export class InstagramPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'instagram' as const;
  constructor(private readonly wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve,ms))) {}

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: false,
      maxDescriptionLength: 2200,
      maxVideoDurationSeconds: 900, // 15 mins for Reels
      maxVideoSizeBytes: 1024 * 1024 * 1024, // 1GB
      supportedMediaFormats: ['mp4', 'mov'],
      supportsScheduling: true,
      notes: 'Requires Instagram Business/Creator Account connected to a Meta Page with instagram_content_publish permission.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!hasMedia) {
      errors.push('Instagram Reels publishing requires a rendered video clip.');
    }
    const caption = payload.caption || payload.description || '';
    if (caption.length > 2200) {
      errors.push(`Instagram caption cannot exceed 2200 characters (currently ${caption.length}).`);
    }
    if (payload.privacy !== 'public') errors.push('Instagram Reels cannot be posted as private or unlisted by this integration. Explicitly choose public/account audience to continue.');
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload, mediaUrl, providerAccountId } = request;

    if (!mediaUrl) {
      throw new AppError(
        'Instagram Graph API publishing requires a publicly reachable signed video URL.',
        400,
        'SIGNED_URL_REQUIRED'
      );
    }

    const validation = this.validatePublishRequest(payload, true);
    if (!validation.valid) throw new AppError(validation.errors.join(' '),400,'INSTAGRAM_VISIBILITY_UNSUPPORTED');
    // The persisted, user-selected destination is authoritative. Never pick
    // the first page/account returned by Meta, whose ordering can change.
    if (typeof providerAccountId !== 'string' || !/^\d+$/.test(providerAccountId)) {
      throw new AppError('The selected Instagram account ID is missing or invalid.',400,'INSTAGRAM_ACCOUNT_REQUIRED');
    }
    const igUserId = providerAccountId;
    const identity = await fetch(`https://graph.facebook.com/v19.0/${igUserId}?fields=id,username`, {
      redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${accessToken}`},
    });
    const current = await identity.json() as any;
    if (!identity.ok || current.error || current.id !== igUserId || typeof current.username !== 'string' || !current.username.trim()) {
      throw new AppError('The selected Instagram professional account could not be verified. No replacement account will be used.',409,'INSTAGRAM_ACCOUNT_UNVERIFIED');
    }

    const caption = payload.caption || payload.description || payload.title || '';

    // Step 2: Create media container
    const containerParams = new URLSearchParams({
      media_type: 'REELS',
      video_url: mediaUrl,
      caption,
      access_token: accessToken,
    });

    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: containerParams.toString(),
    });

    const containerData = await containerRes.json() as any;
    if (!containerRes.ok || containerData.error) {
      throw new AppError(
        `Instagram media container creation failed: ${containerData.error?.message || containerRes.statusText}`,
        400,
        'INSTAGRAM_CONTAINER_FAILED'
      );
    }

    const creationId = containerData.id;
    if (typeof creationId !== 'string' || !/^\d+$/.test(creationId)) throw new AppError('Instagram did not return a usable container ID.',502,'INSTAGRAM_CONTAINER_UNVERIFIED');

    // Step 3: Poll media container status (up to 10 attempts, 3s intervals)
    let isReady = false;
    for (let i = 0; i < 10; i++) {
      await this.wait(3000);
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json() as any;
        if (statusData.status_code === 'FINISHED') {
          isReady = true;
          break;
        } else if (statusData.status_code === 'ERROR') {
          throw new AppError('Instagram media processing encountered an error.', 502, 'INSTAGRAM_TRANSCODE_FAILED');
        }
      }
    }

    if (!isReady) {
      throw new AppError(
        'Instagram media container took too long to process. Check the selected account before trying another post.',
        504,
        'INSTAGRAM_TIMEOUT'
      );
    }

    // Step 4: Publish container
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });

    const pubData = await pubRes.json() as any;
    if (!pubRes.ok || pubData.error) {
      throw new AppError(
        `Instagram publish failed: ${pubData.error?.message || pubRes.statusText}`,
        502,
        'INSTAGRAM_PUBLISH_FAILED'
      );
    }

    if (typeof pubData.id !== 'string' || !/^\d+$/.test(pubData.id)) throw new AppError('Instagram did not confirm a published media ID.',502,'INSTAGRAM_PUBLISH_UNVERIFIED');
    // Numeric Graph media IDs are NOT Instagram shortcodes. A permalink must
    // come from Meta; no fabricated /p/{numeric-id} link is returned.
    return {
      outcome: 'published',
      providerPostId: pubData.id,
      providerPostUrl: null,
      metadata: {
        instagramMediaId: pubData.id,
        creationId,
      },
    };
  }

  isRetryableError(error: any): boolean {
    if (error?.statusCode >= 500 || error?.status >= 500) return true;
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('rate limit') || msg.includes('transcode');
  }

  normalizePublishError(error: any): { code: string; message: string; retryable: boolean } {
    return {
      code: error?.code || 'INSTAGRAM_PUBLISH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown Instagram error',
      retryable: this.isRetryableError(error),
    };
  }
}
