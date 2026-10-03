export type ProjectStatus =
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'complete'
  | 'failed';

export const isProcessing = (s: string) => !['complete', 'failed'].includes(s);

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
  title: string;
  video_url: string | null;
  notes: string;
  status: ProjectStatus;
  error?: string | null;
  created_at: string;
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
