import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider, PlatformPublishCapabilities,
  PublishExecutionRequest, PublishExecutionResult,
} from '../types.js';

const API = 'https://open.tiktokapis.com/v2';
const PRIVACY = {private: 'SELF_ONLY', public: 'PUBLIC_TO_EVERYONE'} as const;

/** Official Direct Post API. An init receipt is not a confirmed publication.
 * Status is resolved by the durable worker, never by uploading a second copy.
 * https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
 */
export class TikTokPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'tiktok' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true, supportsTextOnly: false, maxDescriptionLength: 2200,
      maxVideoDurationSeconds: 600, maxVideoSizeBytes: 500 * 1024 * 1024,
      supportedMediaFormats: ['mp4', 'webm', 'mov'], supportsScheduling: true,
      notes: 'Direct Post requires video.publish, an eligible developer app, creator-supported privacy and a verified media URL domain. Publication is confirmed separately from submission.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): {valid: boolean; errors: string[]} {
    const errors: string[] = [];
    if (!hasMedia) errors.push('TikTok publishing requires a rendered video clip.');
    const caption = payload.caption || payload.description || payload.title || '';
    if (caption.length > 2200) errors.push(`TikTok caption cannot exceed 2200 characters (currently ${caption.length}).`);
    if (payload.privacy !== undefined && payload.privacy !== 'private' && payload.privacy !== 'public') {
      errors.push('TikTok does not support the selected visibility. Choose private or public explicitly.');
    }
    return {valid: errors.length === 0, errors};
  }

  private async call(path: string, accessToken: string, body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${API}${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8'},
      body: JSON.stringify(body),
    });
    const result = await response.json() as any;
    if (!response.ok || result.error?.code !== 'ok' || !result.data || typeof result.data !== 'object') {
      // Do not persist provider messages, tokens or response bodies in errors.
      throw new AppError(`TikTok API request could not be confirmed (${response.status}).`, response.status >= 500 ? 502 : 400, 'TIKTOK_API_UNCONFIRMED');
    }
    return result.data;
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const {accessToken, payload, mediaUrl, grantedScopes, mediaDurationSeconds} = request;
    if (!mediaUrl) throw new AppError('TikTok publishing requires a video media URL.', 400, 'MEDIA_URL_REQUIRED');
    if (!grantedScopes?.includes('video.publish')) {
      throw new AppError('TikTok Direct Post needs video.publish permission. Existing upload-only permission cannot publish directly.', 409, 'TIKTOK_DIRECT_POST_SCOPE_REQUIRED');
    }
    const validation = this.validatePublishRequest(payload, true);
    if (!validation.valid) throw new AppError(validation.errors.join(' '), 400, 'TIKTOK_VISIBILITY_INVALID');
    const privacy = payload.privacy === 'public' ? 'public' : 'private';
    const level = PRIVACY[privacy];
    const creator = await this.call('/post/publish/creator_info/query/', accessToken, {});
    if (!Array.isArray(creator.privacy_level_options) || !creator.privacy_level_options.includes(level)) {
      throw new AppError('The TikTok account does not currently support the selected visibility. Review it before posting.', 409, 'TIKTOK_VISIBILITY_UNAVAILABLE');
    }
    const maximum = creator.max_video_post_duration_sec;
    if (typeof mediaDurationSeconds !== 'number' || !Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0 ||
        typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum <= 0 || mediaDurationSeconds > maximum) {
      throw new AppError('The clip duration could not be verified against this TikTok account\'s current limit.', 400, 'TIKTOK_DURATION_UNVERIFIED');
    }
    const data = await this.call('/post/publish/video/init/', accessToken, {
      post_info: {
        title: payload.caption || payload.description || payload.title || '', privacy_level: level,
        // No new interaction permission is implied by choosing visibility.
        disable_duet: true, disable_stitch: true, disable_comment: true,
      },
      source_info: {source: 'PULL_FROM_URL', video_url: mediaUrl},
    });
    if (typeof data.publish_id !== 'string' || !data.publish_id.trim()) {
      throw new AppError('TikTok did not return a usable submission receipt. Check the account before retrying.', 502, 'TIKTOK_RECEIPT_MISSING');
    }
    return {providerPostId: data.publish_id, outcome: 'pending', providerPostUrl: null,
      metadata: {publishId: data.publish_id, privacy, confirmation: 'awaiting_platform'}};
  }

  async resolvePending(accessToken: string, publishId: string): Promise<PublishExecutionResult> {
    if (!publishId.trim()) throw new AppError('TikTok submission receipt is missing.', 400, 'TIKTOK_RECEIPT_MISSING');
    const data = await this.call('/post/publish/status/fetch/', accessToken, {publish_id: publishId});
    if (data.status === 'FAILED') {
      // This is a definitive rejection, but the worker still never auto-resubmits.
      throw new AppError('TikTok reported that this submission failed. Review the account before creating another post.', 400, 'TIKTOK_SUBMISSION_FAILED');
    }
    if (data.status !== 'PUBLISH_COMPLETE') {
      if (!['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX'].includes(data.status)) {
        throw new AppError('TikTok returned an unrecognized submission state.', 502, 'TIKTOK_STATUS_UNRECOGNIZED');
      }
      return {providerPostId: publishId, outcome: 'pending', providerPostUrl: null,
        metadata: {publishId, confirmation: data.status}};
    }
    // Private posts may have no public video ID or URL. Never invent one.
    const ids = data.publicaly_available_post_id ?? data.publicly_available_post_id;
    const id = Array.isArray(ids) && typeof ids[0] === 'string' && ids[0].trim() ? ids[0] : publishId;
    return {providerPostId: id, outcome: 'published', providerPostUrl: null,
      metadata: {publishId, confirmation: 'PUBLISH_COMPLETE', providerIdKind: id === publishId ? 'publish_id' : 'video_id'}};
  }

  isRetryableError(error: any): boolean {
    return error?.statusCode >= 500 || error?.status >= 500 || error?.name === 'TimeoutError';
  }
  normalizePublishError(error: any): {code: string; message: string; retryable: boolean} {
    return {code: error?.code || 'TIKTOK_PUBLISH_FAILED', message: error instanceof Error ? error.message : 'TikTok request failed', retryable: this.isRetryableError(error)};
  }
}
