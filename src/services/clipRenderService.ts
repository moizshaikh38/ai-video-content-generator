import {createCandidateCreationRecovery,type CandidateCreationInput} from '../lib/candidateCreationRecovery';
import {supabase} from '../lib/supabase';
import {createRenderSubmissionRecovery} from '../lib/renderSubmissionRecovery';
import { backendRequest } from './backendClient';
import { RenderedClip, ClipAspectRatio } from '../types';

export interface RenderClipReceipt {
  status: 'ok';
  submissionId?: string;
  clipId: string;
  jobId: string;
  renderVersion: number;
  editorVersion: number;
}

export type ExportResolution = '720p' | '1080p' | '1440p' | '2160p';

export interface CreateClipResponse {
  status: 'ok';
  creationId?:string;
  replayed?:boolean;
  message?: string;
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
  /**
   * Creates a new clip from a selected AI candidate and queues background 9:16 rendering
   */
  async createClipFromCandidate(
    projectId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16',
    cropMode: 'smart' | 'center' = 'smart',
    options?: {
      caption_enabled?: boolean;
      caption_style?: string;
      caption_config?: any;
    },
    newVariant=false
  ): Promise<CreateClipResponse> {
    return candidateCreationRecovery.submit(projectId,{candidateId,aspectRatio,cropMode,...options},newVariant);
  }

  async listCandidateCreations(projectId:string):Promise<CandidateCreationInput[]>{return candidateCreationRecovery.listProject(projectId);}
  async recoverCandidateCreation(projectId:string,input:CandidateCreationInput):Promise<CreateClipResponse|null>{
    return candidateCreationRecovery.recover(projectId,input);
  }
  async closeCandidateCreation(projectId:string,input:CandidateCreationInput):Promise<CreateClipResponse|null>{
    return candidateCreationRecovery.close(projectId,input);
  }

  /**
   * Fetches all rendered / in-progress clips for a project
   */
  async getProjectClips(projectId: string): Promise<RenderedClip[]> {
    const data = await backendRequest<GetClipsResponse>(`/projects/${projectId}/clips`);
    if (!Array.isArray(data?.clips) || data.projectId !== projectId ||
      data.clips.some(row => !row || typeof row.id !== 'string' || !row.id || row.project_id !== projectId)) {
      throw new Error('Saved rendered clips could not be read. Please try loading again.');
    }
    return data.clips;
  }

  /**
   * Fetches single clip and its latest render progress
   */
  async getClip(clipId: string, signal?: AbortSignal): Promise<RenderedClip> {
    const data = await backendRequest<GetClipResponse>(`/clips/${clipId}`, { signal });
    return data.clip;
  }

  /**
   * Retries rendering for a failed or draft clip
   */
  async renderClip(clipId: string, options?: { caption_enabled?: boolean; caption_style?: string; render_resolution?: ExportResolution }): Promise<RenderClipReceipt> {
    return renderSubmissionRecovery.submit(clipId,options ?? {});
  }

  async recoverRender(clipId: string): Promise<RenderClipReceipt | null> {
    return renderSubmissionRecovery.recover(clipId);
  }

  async closePendingRender(clipId: string): Promise<RenderClipReceipt | null> {
    return renderSubmissionRecovery.closePending(clipId);
  }

  async resolveRender(clipId: string, submissionId?: string): Promise<void> {
    return renderSubmissionRecovery.resolve(clipId,submissionId);
  }

  /**
   * Regenerates the opening hook/title for a clip from its own transcript span.
   * Fails with the server's error code (e.g. HOOK_PROVIDER_UNAVAILABLE) when
   * hook generation cannot run; never returns fabricated text.
   */
  async regenerateHook(clipId: string): Promise<{ hook: string; title: string | null }> {
    const data = await backendRequest<{ status: 'ok'; hook: string; title: string | null }>(
      `/clips/${clipId}/hook/regenerate`,
      { method: 'POST' }
    );
    return { hook: data.hook, title: data.title };
  }

  /**
   * Deletes a clip and its rendered file from storage
   */
  async deleteClip(clipId: string): Promise<void> {
    await backendRequest<void>(`/clips/${clipId}`, { method: 'DELETE' });
  }

  /**
   * Obtains a signed preview URL for <video> playback
   */
  async getPreviewUrl(clipId: string, receipt?: RenderClipReceipt): Promise<string> {
    if (receipt && receipt.clipId !== clipId) throw new Error('The render receipt belongs to a different clip.');
    const query = receipt ? '?' + new URLSearchParams({
      render_version: String(receipt.renderVersion), editor_version: String(receipt.editorVersion), job_id: receipt.jobId,
    }).toString() : '';
    const data = await backendRequest<SignedUrlResponse>(`/clips/${clipId}/preview-url${query}`);
    if (typeof data?.signedUrl !== 'string' || !data.signedUrl.trim()) throw new Error('The rendered preview could not be verified.');
    return data.signedUrl;
  }

  /**
   * Obtains a signed download URL with filename attachment
   */
  async getDownloadUrl(clipId: string): Promise<{ signedUrl: string; filename?: string }> {
    const data = await backendRequest<SignedUrlResponse>(`/clips/${clipId}/download-url`);
    return { signedUrl: data.signedUrl, filename: data.filename };
  }

  /**
   * Phase 12: Fetches full editor bundle (metadata, editor config, caption timing mode, presets, clean source, rendered preview, editorProject)
   */
  async getClipEditorData(clipId: string): Promise<{
    clip: RenderedClip;
    timingMode: string;
    availablePresets: string[];
    previewUrl?: string;
    cleanSourceUrl?: string;
    renderedPreviewUrl?: string;
    editorProject?: any;
    watermarkRequired?: boolean;
  }> {
    return backendRequest(`/clips/${clipId}/editor`);
  }

  /**
   * Phase 12: Saves updated editor configuration
   */
  async updateClipEditor(
    clipId: string,
    update: Record<string, any>,
    tokenOverride?: string
  ): Promise<RenderedClip> {
    const data = await backendRequest<{ clip: RenderedClip }>(`/clips/${clipId}/editor`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }, tokenOverride);
    return data.clip;
  }

  /**
   * Phase 12: Resets editor configuration back to baseline defaults
   */
  async resetClipEditor(clipId: string): Promise<RenderedClip> {
    const data = await backendRequest<{ clip: RenderedClip }>(`/clips/${clipId}/editor/reset`, {
      method: 'POST',
    });
    return data.clip;
  }

  /**
   * Phase 12: Fetches normalized preview caption cues
   */
  /**
   * Phase: Timeline Pro — fetches cached audio peaks for an uploaded audio asset.
   */
  async getAssetWaveform(assetId: string): Promise<{
    peaks: number[]; duration: number; resolution: number; version: number; cached?: boolean;
  }> {
    return backendRequest(`/audio-assets/${assetId}/waveform`);
  }

  /**
   * Phase: Timeline Pro — fetches a cached base64 sprite-sheet filmstrip for the clip.
   */
  async getClipThumbnails(clipId: string, count?: number): Promise<{
    dataUrl: string;
    frameCount: number;
    frameWidth: number;
    frameHeight: number;
    duration: number;
    version: number;
    cached?: boolean;
  }> {
    const q = count ? `?count=${count}` : '';
    return backendRequest(`/clips/${clipId}/thumbnails${q}`);
  }

  /**
   * Phase: Timeline Pro — fetches cached audio peaks for the clip's source window.
   * Peaks are quantized 0..100 (see server/src/shared/waveformPeaks.ts).
   */
  async getClipWaveform(clipId: string): Promise<{
    peaks: number[];
    duration: number;
    resolution: number;
    version: number;
    cached?: boolean;
  }> {
    return backendRequest(`/clips/${clipId}/waveform`);
  }

  async getClipCaptions(clipId: string): Promise<{
    timingMode: string;
    cues: Array<{
      id: string;
      start: number;
      end: number;
      text: string;
      tokens?: Array<{ text: string; start: number; end: number }>;
    }>;
  }> {
    return backendRequest(`/clips/${clipId}/captions`);
  }

  /**
   * Phase 13: Triggers smart auto-reframe face tracking analysis
   */
  async analyzeClipReframe(clipId: string): Promise<{
    status: string;
    analysis_status: string;
    clipId: string;
  }> {
    return backendRequest(`/clips/${clipId}/reframe/analyze`, { method: 'POST' });
  }

  /**
   * Phase 13: Fetches latest smart reframe tracking data
   */
  /** Tracker control: follow a user-picked subject. Times are source-file seconds. */
  async trackClipSubject(
    clipId: string,
    body: { refTime: number; box: { x: number; y: number; w: number; h: number }; startSec: number; endSec: number }
  ): Promise<{
    status: 'ok';
    source_width: number;
    source_height: number;
    keyframes: Array<{ time: number; centerX: number; centerY: number }>;
    tracked_from: number;
    tracked_to: number;
    lost_after: number | null;
    lost_before: number | null;
  }> {
    return backendRequest(`/clips/${clipId}/track-subject`, { method: 'POST', body: JSON.stringify(body) });
  }

  async getClipReframe(clipId: string,candidate?:boolean): Promise<{
    adaptiveComposition?:boolean;
    measuredPlanEnvelope?:import('../../server/src/shared/previewItemAutomaticPlan').PreviewMeasuredPlanEnvelope|null;
    contentFramingDecision?: import('../../server/src/shared/contentFramingDecision').ContentFramingDecision | null;
    status: 'pending' | 'analyzing' | 'ready' | 'failed';
    analyzedSourcePath?: string | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    detectedFaceCount: number;
    dominantTrackId: string | null;
    smoothedKeyframes: Array<{ time: number; centerX: number; centerY: number }>;
    analysisVersion: number;
    analyzedTrimStart?: number;
    analyzedTrimEnd?: number;
    analyzedAspectRatio?: string;
    isStale?: boolean;
    speaker1X?: number | null;
    speaker2X?: number | null;
    /** Server-computed per-speaker split framing (same helper the export
     * uses) so the preview mirrors the exported zoom/anchors. Null = legacy
     * anchor-only split framing. */
    splitGeometry?: {
      speaker1: { x: number; y: number; windowW: number };
      speaker2: { x: number; y: number; windowW: number };
    } | null;
    /** Server-computed group framing for multi-person single-view (same
     * helper the export uses) so the preview mirrors the blur-fill fit.
     * Null = tight tracking stays. */
    shotComposition?: Array<{start:number;end:number;kind:'group'|'solo'|'fit';windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>}> | null;
    groupFrame?: {
      keyframes: Array<{ time: number; centerX: number; centerY: number }>;
      windowW: number;
      /** Composition window height (fraction of source height) when face
       * sizes are known; absent = legacy 4:3 window. */
      windowH?: number;
      sourceWidth: number;
      sourceHeight: number;
    } | null;
    /** True when the dominant track is below the export tracking floor: the
     * export degrades to the blurred layout and the preview must mirror it. */
    lowConfidenceTrack?: boolean;
  }> {
    return backendRequest(`/clips/${clipId}/reframe${candidate===undefined?'':`?layoutCandidate=${candidate?'review-v1':'off'}`}`);
  }
}

export const clipRenderService = new ClipRenderService();

const renderSubmissionRecovery = createRenderSubmissionRecovery({
  owner:async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session?.user?.id??'';},
  request:async(path,options,owner)=>{
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    if(!data.session?.access_token||data.session.user.id!==owner)throw new Error('The signed-in account changed. The render request was not sent.');
    return backendRequest(path,options,data.session.access_token);
  },
  readClip:id=>clipRenderService.getClip(id),
  storage:()=>{try{return window.localStorage;}catch{throw new Error('Browser storage is required to recover render requests. No render was submitted.');}},
  newId:()=>crypto.randomUUID(),
  lock:async(name,work)=>{
    if(typeof navigator==='undefined'||!navigator.locks?.request)throw new Error('This browser cannot safely coordinate render recovery across tabs. No render was submitted.');
    return navigator.locks.request(name,work);
  },
});

const candidateCreationRecovery=createCandidateCreationRecovery({
  owner:async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session?.user?.id??'';},
  request:async(path,options,owner)=>{
    const {data,error}=await supabase.auth.getSession();if(error)throw error;
    if(!data.session?.access_token||data.session.user.id!==owner)throw new Error('The signed-in account changed. The creation request was not sent.');
    return backendRequest(path,options,data.session.access_token);
  },
  storage:()=>{try{return window.localStorage;}catch{throw new Error('Browser storage is required to recover clip creation. No clip was created.');}},
  newId:()=>crypto.randomUUID(),
  lock:async(name,work)=>{
    if(typeof navigator==='undefined'||!navigator.locks?.request)throw new Error('This browser cannot safely coordinate creation recovery across tabs. No clip was created.');
    return navigator.locks.request(name,work);
  },
});
