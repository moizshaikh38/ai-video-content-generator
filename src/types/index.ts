export type ProjectStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'complete'
  | 'queued'
  | 'failed';

export const isProcessing = (s: string) =>
  ['processing', 'transcribing', 'analyzing', 'generating'].includes(s);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
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

export type OutputPlatform = 'youtube' | 'instagram' | 'shorts' | 'tiktok' | 'linkedin' | 'x';

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

export interface ContentOutput {
  id: string;
  project_id: string;
  platform: OutputPlatform;
  content_type: OutputContentType;
  content: string;
  position: number;
}

export interface Project {
  id: string;
  user_id?: string;
  title: string;
  source_type?: 'upload' | 'url';
  source_url?: string | null;
  video_url?: string | null;
  notes?: string;
  status: ProjectStatus;
  video_status?: ProjectStatus;
  created_at: string;
  updated_at?: string;
}

export interface CreatorProfile {
  name: string;
  email: string;
  niche: string;
  audience: string;
  language: string;
  tone: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp?: string;
}
