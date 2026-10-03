import { User } from '@supabase/supabase-js';
import { Request } from 'express';

// ── Canonical Video Status State Machine ──────────────────────────
// These are the ONLY valid values for projects.video_status in the database.
// The schema default is 'uploading'. Transitions are enforced in videoProcessingService.
export type VideoStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'transcribed'
  | 'generating'
  | 'completed'
  | 'failed';

export const VIDEO_STATUSES: readonly VideoStatus[] = [
  'uploading',
  'uploaded',
  'processing',
  'transcribing',
  'transcribed',
  'generating',
  'completed',
  'failed',
] as const;

/** States that allow starting/retrying processing */
export const PROCESSABLE_STATUSES: readonly VideoStatus[] = ['uploaded', 'failed'] as const;

/** States that indicate active background work */
export const ACTIVE_PROCESSING_STATUSES: readonly VideoStatus[] = [
  'processing',
  'transcribing',
  'generating',
] as const;

// ── API Response Types ────────────────────────────────────────────

export interface ApiSuccessResponse<T = unknown> {
  status: 'ok';
  data?: T;
  message?: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  status: 'error';
  code?: string;
  message: string;
  requestId?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp?: string;
  version?: string;
}

// ── Application Error ─────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ── Request Types ─────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: User;
  requestId?: string;
}

// ── UUID Validation ───────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ── Transcript Types ──────────────────────────────────────────────

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptRecord {
  id: string;
  project_id: string;
  user_id: string;
  transcript_text: string;
  language: string;
  duration_seconds: number | null;
  segments: TranscriptSegment[];
  created_at: string;
  updated_at: string;
}

// ── Content Output Types ──────────────────────────────────────────

export type OutputPlatform = 'youtube' | 'instagram' | 'shorts' | 'tiktok' | 'linkedin' | 'x';

export const VALID_PLATFORMS: readonly OutputPlatform[] = [
  'youtube',
  'instagram',
  'shorts',
  'tiktok',
  'linkedin',
  'x',
] as const;

export type OutputContentType =
  | 'title'
  | 'description'
  | 'chapters'
  | 'keywords'
  | 'hook'
  | 'caption'
  | 'hashtags'
  | 'moment'
  | 'post'
  | 'thread';

export interface ContentOutputRecord {
  id: string;
  project_id: string;
  platform: OutputPlatform;
  content_type: OutputContentType;
  content: string;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreatorProfileData {
  niche?: string;
  target_audience?: string;
  language?: string;
  tone?: string;
  custom_tone?: string;
  website_url?: string;
  newsletter_url?: string;
  podcast_url?: string;
  youtube_cta?: string;
  instagram_cta?: string;
  linkedin_cta?: string;
  twitter_cta?: string;
  tiktok_cta?: string;
  preferred_hook_style?: string;
  brand_rules?: string;
  forbidden_phrases?: string;
}

export interface GenerationOverrides {
  overrideTone?: string;
  overrideLanguage?: string;
  overrideCTA?: string;
}

// ── Structured Platform AI Outputs ────────────────────────────────

export interface YouTubeGeneratedContent {
  titles: string[];
  description: string;
  chapters: Array<{ timestamp: string; title: string }>;
  keywords: string[];
}

export interface InstagramGeneratedContent {
  hooks: string[];
  caption: string;
  hashtags: string[];
}

export interface ShortsGeneratedContent {
  moments: Array<{
    start?: string;
    end?: string;
    hook: string;
    description: string;
    timestamps_available?: boolean;
  }>;
}

export interface TikTokGeneratedContent {
  hooks: string[];
  caption: string;
  moment: {
    start?: string;
    end?: string;
    description: string;
    timestamps_available?: boolean;
  };
}

export interface LinkedInGeneratedContent {
  post: string;
}

export interface TwitterGeneratedContent {
  post: string;
  thread: string[];
}

export interface GeneratedPlatformKit {
  youtube?: YouTubeGeneratedContent;
  instagram?: InstagramGeneratedContent;
  shorts?: ShortsGeneratedContent;
  tiktok?: TikTokGeneratedContent;
  linkedin?: LinkedInGeneratedContent;
  x?: TwitterGeneratedContent;
}

// ── Clip Candidates (Phase 10: AI Auto Clip Finder) ───────────────

export type ClipCandidateStatus = 'suggested' | 'selected' | 'dismissed';

export type ClipCandidateCategory =
  | 'educational'
  | 'story'
  | 'controversial'
  | 'insight'
  | 'emotional'
  | 'entertaining'
  | 'tutorial'
  | 'general';

export interface ClipCandidate {
  id: string;
  project_id: string;
  user_id: string;

  start_segment_index: number;
  end_segment_index: number;

  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;

  title: string;
  hook: string;
  reason: string;
  category: ClipCandidateCategory | string;
  engagement_score: number;

  status: ClipCandidateStatus;

  metadata?: Record<string, any>;

  created_at: string;
  updated_at: string;
}

export interface AIClipCandidate {
  start_segment_index: number;
  end_segment_index: number;

  title: string;
  hook: string;
  reason: string;

  category: ClipCandidateCategory;

  hook_score: number;
  standalone_score: number;
  insight_score: number;
  emotion_score: number;
  platform_score: number;
}

export interface AIClipAnalysisResponse {
  clips: AIClipCandidate[];
}

