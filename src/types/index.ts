export type ProjectStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'queued'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'complete'
  | 'failed';

export const isProcessing = (s: string) =>
  !['complete', 'completed', 'uploaded', 'failed'].includes(s);

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
