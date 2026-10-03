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

