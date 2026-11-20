import { backendRequest, authToken, apiBase } from './backendClient';
import { SubtitleProject, SubtitleStyleConfig, TimedCaptionCue } from '../types';

export interface BurnStatusResponse {
  status: 'idle' | 'rendering' | 'ready' | 'failed';
  progress: number;
  stage: string;
  error?: string | null;
  downloadUrl?: string | null;
  is_watermarked?: boolean;
}

export class SubtitleService {
  /**
   * Create a new standalone subtitle project
   */
  public static async createProject(title?: string): Promise<{ project: SubtitleProject }> {
    return backendRequest<{ project: SubtitleProject }>('/subtitles/projects', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  /**
   * List all subtitle projects for current user
   */
  public static async listProjects(): Promise<{ projects: SubtitleProject[] }> {
    return backendRequest<{ projects: SubtitleProject[] }>('/subtitles/projects');
  }

  /**
   * Get single subtitle project by ID
   */
  public static async getProject(projectId: string): Promise<{
    project: SubtitleProject;
    previewUrl?: string;
    transcript?: any;
    exportDownloadUrl?: string;
  }> {
    return backendRequest<{
      project: SubtitleProject;
      previewUrl?: string;
      transcript?: any;
      exportDownloadUrl?: string;
    }>(`/subtitles/projects/${projectId}`);
  }

  /**
   * Get server-authoritative cost estimate for transcribing this project
   */
  public static async estimateCost(
    projectId: string,
    durationSeconds?: number
  ): Promise<{
    operation_id: string;
    estimated_credits: number;
    is_reused_transcript: boolean;
    rate_description: string;
    available_credits: number;
    has_sufficient_credits: boolean;
    is_unlimited?: boolean;
    duration_seconds?: number;
  }> {
    const params = new URLSearchParams();
    if (durationSeconds) params.set('duration_seconds', String(durationSeconds));
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await backendRequest<{ status: string; data: any }>(
      `/subtitles/projects/${projectId}/cost-estimate${query}`
    );
    return res.data;
  }

  /**
   * Trigger speech transcription and initial cue extraction
   */
  public static async transcribeProject(projectId: string): Promise<{
    project: SubtitleProject;
    cues: TimedCaptionCue[];
  }> {
    return backendRequest<{
      project: SubtitleProject;
      cues: TimedCaptionCue[];
    }>(`/subtitles/projects/${projectId}/transcribe`, {
      method: 'POST',
    });
  }

  /**
   * Persist edited subtitle cues
   */
  public static async updateCues(projectId: string, cues: TimedCaptionCue[]): Promise<{ cues: TimedCaptionCue[] }> {
    return backendRequest<{ cues: TimedCaptionCue[] }>(`/subtitles/projects/${projectId}/cues`, {
      method: 'PUT',
      body: JSON.stringify({ cues }),
    });
  }

  /**
   * Update and save subtitle styling configuration
   */
  public static async updateStyle(
    projectId: string,
    style: SubtitleStyleConfig
  ): Promise<{ style: SubtitleStyleConfig }> {
    return backendRequest<{ style: SubtitleStyleConfig }>(`/subtitles/projects/${projectId}/style`, {
      method: 'PUT',
      body: JSON.stringify({ style }),
    });
  }

  /**
   * Start FFmpeg burned-in video export job
   */
  public static async startBurn(projectId: string): Promise<{ success: boolean; status: string }> {
    return backendRequest<{ success: boolean; status: string }>(`/subtitles/projects/${projectId}/export/burn`, {
      method: 'POST',
    });
  }

  /**
   * Check status of FFmpeg burned-in video export job
   */
  public static async getBurnStatus(projectId: string): Promise<{
    status: string;
    burnStatus: BurnStatusResponse;
  }> {
    return backendRequest<{
      status: string;
      burnStatus: BurnStatusResponse;
    }>(`/subtitles/projects/${projectId}/export/burn-status`);
  }

  /**
   * Download exported SRT or VTT subtitle file
   */
  public static async downloadSubtitleFile(
    projectId: string,
    format: 'srt' | 'vtt',
    fileName?: string
  ): Promise<void> {
    const token = await authToken();
    const response = await fetch(`${apiBase}/subtitles/projects/${projectId}/export/${format}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message || `Failed to download .${format}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `subtitles_${projectId.slice(0, 8)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

