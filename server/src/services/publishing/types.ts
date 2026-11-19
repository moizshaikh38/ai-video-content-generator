import { SocialPlatform, PublishPayload } from '../../types/index.js';

export interface PlatformPublishCapabilities {
  supportsVideo: boolean;
  supportsTextOnly: boolean;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
  maxVideoDurationSeconds?: number;
  maxVideoSizeBytes?: number;
  supportedMediaFormats: string[];
  supportsScheduling: boolean;
  notes?: string;
}

export interface PublishExecutionRequest {
  accessToken: string;
  payload: PublishPayload;
  mediaFilePath?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaContentType?: string;
  grantedScopes?: string[];
  providerAccountId?: string;
  mediaDurationSeconds?: number;
}

export interface PublishExecutionResult {
  /** Absent is legacy synchronous success. Pending must never be shown as published. */
  outcome?: 'pending' | 'published';
  providerPostId: string;
  providerPostUrl?: string | null;
  metadata?: Record<string, any>;
}

export interface SocialPublishingProvider {
  readonly platform: SocialPlatform;
  readonly pendingMaxDurationMs?: number;

  /** Return supported capabilities and constraints for this platform */
  getCapabilities(): PlatformPublishCapabilities;

  /** Validate publish payload before attempting upload */
  validatePublishRequest(payload: PublishPayload, hasMedia: boolean): { valid: boolean; errors: string[] };

  /** Execute upload/publishing to the official platform API */
  publish(request: PublishExecutionRequest): Promise<PublishExecutionResult>;

  /** Read-only resolution of a persisted submission. Must never create a new post. */
  resolvePending?(accessToken: string, receiptId: string): Promise<PublishExecutionResult>;

  /** Resume preparation using a durable receipt. checkpoint must commit before
   * any irreversible publish dispatch; uncertain dispatches are read-only. */
  continuePending?(request: PublishExecutionRequest,receiptId:string,metadata:Record<string,any>,checkpoint:(metadata:Record<string,any>)=>Promise<void>):Promise<PublishExecutionResult>;

  /** Check if a published error is retryable (5xx, rate limits, network) */
  isRetryableError(error: unknown): boolean;

  /** Normalize publishing error for logging and client-facing feedback */
  normalizePublishError(error: unknown): { code: string; message: string; retryable: boolean };
}
