import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { RenderedClip, ClipAspectRatio } from '../types';

export interface CreateClipResponse {
  status: 'ok';
  message: string;
  clip: RenderedClip;
  renderJob?: any;
}

export interface GetClipsResponse {
  status: 'ok';
  projectId: string;
  count: number;
  clips: RenderedClip[];
}

export interface GetClipResponse {
  status: 'ok';
  clip: RenderedClip;
}

export interface SignedUrlResponse {
  status: 'ok';
  signedUrl: string;
  filename?: string;
  expiresInSeconds: number;
}

class ClipRenderService {
  private getApiUrl(): string {
    return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  }

  private async getAuthHeader(): Promise<HeadersInit> {
    if (!isSupabaseConfigured) {
      return { 'Content-Type': 'application/json' };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Creates a new clip from a selected AI candidate and queues background 9:16 rendering
   */
  async createClipFromCandidate(
    projectId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16'
  ): Promise<CreateClipResponse> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/projects/${projectId}/clips`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ candidateId, aspectRatio }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create clip from candidate.');
    }

    return (await res.json()) as CreateClipResponse;
  }

  /**
   * Fetches all rendered / in-progress clips for a project
   */
  async getProjectClips(projectId: string): Promise<RenderedClip[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/projects/${projectId}/clips`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch project clips.');
    }

    const data = (await res.json()) as GetClipsResponse;
    return data.clips || [];
  }

  /**
   * Fetches single clip and its latest render progress
   */
  async getClip(clipId: string): Promise<RenderedClip> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch clip details.');
    }

    const data = (await res.json()) as GetClipResponse;
    return data.clip;
  }

  /**
   * Retries rendering for a failed or draft clip
   */
  async renderClip(clipId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/render`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to start clip rendering.');
    }
  }

  /**
   * Deletes a clip and its rendered file from storage
   */
  async deleteClip(clipId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete clip.');
    }
  }

  /**
   * Obtains a signed preview URL for <video> playback
   */
  async getPreviewUrl(clipId: string): Promise<string> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/preview-url`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get preview URL.');
    }

    const data = (await res.json()) as SignedUrlResponse;
    return data.signedUrl;
  }

  /**
   * Obtains a signed download URL with filename attachment
   */
  async getDownloadUrl(clipId: string): Promise<{ signedUrl: string; filename?: string }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/download-url`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get download URL.');
    }

    const data = (await res.json()) as SignedUrlResponse;
    return { signedUrl: data.signedUrl, filename: data.filename };
  }
}

export const clipRenderService = new ClipRenderService();
