import {waitForClipSelection} from '../lib/waitForClipSelection';
import { backendRequest } from './backendClient';
import { ClipCandidate, ClipCandidateStatus, ClipPreferences } from '../types';

export interface AnalyzeClipsResponse {
  status: 'ok';
  queued?:boolean;selectionJobId?:string;selectionStatus?:string;
  projectId: string;
  count: number;
  candidates: ClipCandidate[];
}

export interface GetClipCandidatesResponse {
  status: 'ok';
  projectId: string;
  count: number;
  candidates: ClipCandidate[];
}

export interface UpdateClipCandidateResponse {
  status: 'ok';
  candidate: ClipCandidate;
}

class ClipService {
  /**
   * Triggers AI clip analysis for a transcribed project with genre & clip preferences
   */
  async analyzeClips(
    projectId: string,
    customNotes?: string,
    clipPreferences?: Partial<ClipPreferences>
  ): Promise<AnalyzeClipsResponse> {
    const initial=await backendRequest<AnalyzeClipsResponse>(`/projects/${projectId}/analyze-clips`, {
      method: 'POST',
      headers:{'x-vireo-selection-dispatch':'1'},
      body: JSON.stringify({ customNotes, clip_preferences: clipPreferences }),
    });
    return waitForClipSelection(initial,projectId,jobId=>backendRequest<AnalyzeClipsResponse>(`/projects/${projectId}/clip-candidates?selection_job_id=${encodeURIComponent(jobId)}`));
  }

  async readSavedSelection(projectId:string,jobId:string):Promise<AnalyzeClipsResponse>{
    const data=await backendRequest<AnalyzeClipsResponse>(`/projects/${projectId}/clip-candidates?selection_job_id=${encodeURIComponent(jobId)}`);
    if(data.projectId!==projectId||data.selectionJobId!==jobId||data.selectionStatus!=='completed'||!Array.isArray(data.candidates))throw Error('Saved selection is not confirmed complete. No new generation was started.');
    return data;
  }

  /**
   * Fetches all clip candidates for a project, sorted by engagement_score DESC
   */
  async getClipCandidates(projectId: string): Promise<ClipCandidate[]> {
    const data = await backendRequest<GetClipCandidatesResponse>(`/projects/${projectId}/clip-candidates`);
    if (!Array.isArray(data?.candidates) || data.projectId !== projectId ||
      data.candidates.some(row => !row || typeof row.id !== 'string' || !row.id || row.project_id !== projectId)) {
      throw new Error('Saved clip candidates could not be read. Please try loading again.');
    }
    return data.candidates;
  }

  /**
   * Updates candidate status (suggested | selected | dismissed)
   */
  async updateClipCandidateStatus(
    projectId: string,
    candidateId: string,
    status: ClipCandidateStatus
  ): Promise<ClipCandidate> {
    const data = await backendRequest<UpdateClipCandidateResponse>(`/projects/${projectId}/clip-candidates/${candidateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return data.candidate;
  }

  /**
   * Natural-language moment search across multimodal video timeline
   */
  async findMoments(
    projectId: string,
    query: string,
    options?: { targetDuration?: number; platform?: string; minScore?: number }
  ): Promise<import('../types').MomentSearchResult[]> {
    const res = await backendRequest<{
      status: 'ok';
      data: { query: string; moments: import('../types').MomentSearchResult[]; count: number };
    }>(`/projects/${projectId}/find-moments`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        targetDuration: options?.targetDuration,
        platform: options?.platform,
        minScore: options?.minScore,
      }),
    });
    return res.data?.moments || [];
  }
}

export const clipService = new ClipService();
