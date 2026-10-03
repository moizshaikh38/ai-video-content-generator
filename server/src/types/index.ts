import { User } from '@supabase/supabase-js';
import { Request } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
}

export interface AppError extends Error {
  statusCode?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

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

export type OutputPlatform = 'youtube' | 'instagram' | 'shorts' | 'linkedin' | 'x';

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
}

// Structured Platform AI Outputs
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
  linkedin?: LinkedInGeneratedContent;
  x?: TwitterGeneratedContent;
}
