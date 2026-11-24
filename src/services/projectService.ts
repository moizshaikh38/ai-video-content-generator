import { Project, ContentOutput, OutputPlatform, CreatorProfile, ProjectStatus, Transcript, GenerationOverrides, ClipPreferences } from '../types';
import { backendRequest } from './backendClient';
import { getCurrentAuthOwner } from '../lib/authOwner';

export interface CreateProjectInput {
  id?: string; userId?: string; title: string; sourceType?: 'upload' | 'url';
  sourceUrl?: string | null; videoStatus?: ProjectStatus; notes?: string;
  clip_preferences?: Partial<ClipPreferences>;
}

const INITIAL_PROFILE: CreatorProfile = {
  name: 'Creator', email: 'creator@vireoclip.ai', niche: 'Tech, SaaS & Solopreneurship',
  audience: 'Founders, builders, and content creators', language: 'English', tone: 'Friendly',
};

class ProjectService {
  private projects: Project[] = [];
  private outputs: ContentOutput[] = [];
  private profile: CreatorProfile = INITIAL_PROFILE;

  private scopeOwner = getCurrentAuthOwner();
  private scopeVersion = 0;

  clear(): void {
    this.scopeVersion++;
    this.scopeOwner = getCurrentAuthOwner();
    this.projects = [];
    this.outputs = [];
    this.profile = INITIAL_PROFILE;
    this.inFlightProjectsPromise = null;
    this.inFlightProjectPromises.clear();
  }

  private captureScope(): number {
    if (this.scopeOwner !== getCurrentAuthOwner()) this.clear();
    return this.scopeVersion;
  }

  private assertScope(scope: number): void {
    if (this.captureScope() === scope) return;
    throw Object.assign(new Error('The signed-in account changed. Load this page again.'), {
      name: 'AuthContextChangedError', code: 'AUTH_CONTEXT_CHANGED',
    });
  }

  /** Old-account failures must not surface their details in the new account. */
  private async scopedRequest<T>(scope: number, path: string, options: RequestInit = {}): Promise<T> {
    try {
      return await backendRequest<T>(path, options);
    } catch (error) {
      this.assertScope(scope);
      throw error;
    }
  }

  private mapRow(row: any): Project {
    const status = (row.video_status as ProjectStatus) || 'uploading';
    return {
      id: row.id, user_id: row.user_id, title: row.title || 'Untitled Project',
      source_type: row.source_type || 'upload', source_url: row.source_url || null,
      video_url: row.source_url || null, notes: row.notes || '',
      clip_preferences: row.clip_preferences,
      error_code: row.error_code ?? null,
      processing_failure:row.processing_failure??null,
      core_selection_capable:row.core_selection_capable===true,
      core_selection_status:row.core_selection_status??undefined,
      processing_run_token:typeof row.processing_run_token==='string'?row.processing_run_token:null,
      duration_seconds: row.duration_seconds ?? null,
      metadata: row.metadata ?? null,
      retention_policy: row.retention_policy ?? null,
      transcript_quality_status: row.transcript_quality_status ?? null,
      error_message: row.error_message ?? null,
      poster_url: row.poster_url ?? null,
      status, video_status: status,
      created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString(),
    };
  }

  private inFlightProjectsPromise: Promise<Project[]> | null = null;
  private inFlightProjectPromises: Map<string, Promise<Project | null>> = new Map();

  private cacheProject(row: any, scope = this.captureScope()): Project {
    this.assertScope(scope);
    const project = this.mapRow(row);
    this.projects = [project, ...this.projects.filter((p) => p.id !== project.id)];
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: project.id } }));
    return project;
  }

  async fetchProjects(_userId?: string): Promise<Project[]> {
    const scope = this.captureScope();
    if (this.inFlightProjectsPromise) {
      return this.inFlightProjectsPromise;
    }

    // Token avoids the promise referencing itself inside its own initializer (TS2454);
    // token.settled is assigned synchronously below, before the async body can reach finally.
    const token: { settled?: Promise<Project[]> } = {};
    const promise: Promise<Project[]> = (async () => {
      try {
        const data = await this.scopedRequest<{ projects: any[] }>(scope, '/projects');
        this.assertScope(scope);
        this.projects = (data.projects || []).map((row) => this.mapRow(row));
        return this.getProjects();
      } finally {
        if (this.inFlightProjectsPromise === token.settled) this.inFlightProjectsPromise = null;
      }
    })();

    token.settled = promise;
    this.inFlightProjectsPromise = promise;
    return promise;
  }

  async fetchProject(id: string): Promise<Project | null> {
    const scope = this.captureScope();
    if (this.inFlightProjectPromises.has(id)) {
      return this.inFlightProjectPromises.get(id)!;
    }

    // Same TS2454 repair: compare against token.settled, assigned synchronously below.
    const token: { settled?: Promise<Project | null> } = {};
    const promise: Promise<Project | null> = (async () => {
      try {
        const data = await this.scopedRequest<{ project: any }>(scope, `/projects/${id}`);
        return this.cacheProject(data.project, scope);
      } catch (error: any) {
        if (error.status === 404) return null;
        throw error;
      } finally {
        if (this.inFlightProjectPromises.get(id) === token.settled) this.inFlightProjectPromises.delete(id);
      }
    })();

    token.settled = promise;
    this.inFlightProjectPromises.set(id, promise);
    return promise;
  }

  getProjects(): Project[] { this.captureScope(); return [...this.projects]; }
  getProject(id: string): Project | undefined { this.captureScope(); return this.projects.find((p) => p.id === id); }
  getOutputs(projectId: string): ContentOutput[] { this.captureScope(); return this.outputs.filter((o) => o.project_id === projectId); }
  getProfile(): CreatorProfile { this.captureScope(); return { ...this.profile }; }
  updateProfile(profile: Partial<CreatorProfile>): CreatorProfile {
    this.captureScope();
    this.profile = { ...this.profile, ...profile };
    return this.getProfile();
  }

  async createProjectAsync(input: CreateProjectInput): Promise<Project> {
    const scope = this.captureScope();
    const data = await this.scopedRequest<{ project: any }>(scope, '/projects', {
      method: 'POST', body: JSON.stringify({
        id: input.id || crypto.randomUUID(),
        title: input.title,
        source_type: input.sourceType || 'upload',
        notes: input.notes || '',
        clip_preferences: input.clip_preferences,
      }),
    });
    return this.cacheProject(data.project, scope);
  }

  async ingestProjectUrlAsync(input: {
    url: string;
    title?: string;
    notes?: string;
    id?: string;
    clip_preferences?: Partial<ClipPreferences>;
    /** Aborts the client-side wait; the server may still finish the ingestion. */
    signal?: AbortSignal;
  }): Promise<Project> {
    const scope = this.captureScope();
    const data = await this.scopedRequest<{ project: any }>(scope, '/projects/ingest-url', {
      method: 'POST',
      signal: input.signal,
      body: JSON.stringify({
        id: input.id || crypto.randomUUID(),
        url: input.url,
        title: input.title,
        notes: input.notes,
        clip_preferences: input.clip_preferences,
      }),
    });
    return this.cacheProject(data.project, scope);
  }

  async updateProjectAsync(id: string, updates: Partial<Project>): Promise<Project | null> {
    const scope = this.captureScope();
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.clip_preferences !== undefined) patch.clip_preferences = updates.clip_preferences;
    if (!Object.keys(patch).length) return this.fetchProject(id);
    const data = await this.scopedRequest<{ project: any }>(scope, `/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return this.cacheProject(data.project, scope);
  }

  async deleteProject(id: string): Promise<boolean> {
    const scope = this.captureScope();
    await this.scopedRequest(scope, `/projects/${id}`, { method: 'DELETE' });
    this.assertScope(scope);
    this.projects = this.projects.filter((p) => p.id !== id);
    this.outputs = this.outputs.filter((o) => o.project_id !== id);
    window.dispatchEvent(new CustomEvent('vireo_project_updated'));
    return true;
  }

  /** Local-only compatibility helper for old draft UI paths. */
  createProject(title: string, videoUrl: string | null, notes: string): Project {
    const isUrl = Boolean(videoUrl?.startsWith('https://') || videoUrl?.startsWith('http://'));
    const row = { id: crypto.randomUUID(), title, source_type: isUrl ? 'url' : 'upload',
      source_url: videoUrl, notes, video_status: isUrl ? 'queued' : 'uploading' };
    return this.cacheProject(row);
  }

  updateOutputContent(outputId: string, content: string): boolean {
    this.captureScope();
    const item = this.outputs.find((o) => o.id === outputId);
    if (!item) return false;
    item.content = content;
    return true;
  }

  async startProcessing(projectId: string,selection?:{preferences?:any;customNotes?:string}): Promise<{ success: boolean; message?: string }> {
    const scope = this.captureScope();
    const projectBefore=selection?await this.fetchProject(projectId):this.getProject(projectId);
    this.assertScope(scope);
    const useContinuation=Boolean(selection&&projectBefore?.core_selection_capable);
    const data = await this.scopedRequest<{ message?: string }>(scope, `/projects/${projectId}/process`, { method: 'POST',...(useContinuation?{headers:{'x-vireo-core-continuation':'1'},body:JSON.stringify({continue_to_selection:true,clip_preferences:selection?.preferences,customNotes:selection?.customNotes})}:{}) });
    this.assertScope(scope);
    const project = this.getProject(projectId);
    if (project) { project.video_status = 'processing'; project.status = 'processing'; }
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
    window.dispatchEvent(new CustomEvent('vireo_usage_updated'));
    return { success: true, message: data.message };
  }

  async fetchTranscript(projectId: string): Promise<Transcript | null> {
    const scope = this.captureScope();
    try {
      const data = await this.scopedRequest<{ transcript: Transcript }>(scope, `/projects/${projectId}/transcript`);
      this.assertScope(scope);
      return data.transcript || null;
    } catch (error: any) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async fetchContentOutputs(projectId: string): Promise<ContentOutput[]> {
    const scope = this.captureScope();
    const data = await this.scopedRequest<{ outputs: ContentOutput[] }>(scope, `/projects/${projectId}/content`);
    this.assertScope(scope);
    const outputs = data.outputs || [];
    this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
    return outputs;
  }

  async generateContent(projectId: string, platform?: OutputPlatform, customNotes?: string,
    overrides?: GenerationOverrides): Promise<{ success: boolean; message: string; outputs: ContentOutput[] }> {
    const scope = this.captureScope();
    const data = await this.scopedRequest<{ message?: string; outputs?: ContentOutput[] }>(scope, `/projects/${projectId}/generate-content`, {
      method: 'POST', body: JSON.stringify({ platform, customNotes,
        overrideTone: overrides?.overrideTone, overrideLanguage: overrides?.overrideLanguage,
        overrideCTA: overrides?.overrideCTA }),
    });
    this.assertScope(scope);
    const outputs = data.outputs || [];
    if (platform) this.outputs = this.outputs.filter((o) => !(o.project_id === projectId && o.platform === platform))
      .concat(outputs.filter((o) => o.platform === platform));
    else this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
    return { success: true, message: data.message || 'Content generated successfully.', outputs };
  }

  async updateOutputContentAsync(outputId: string, projectId: string, content: string): Promise<boolean> {
    const scope = this.captureScope();
    await this.scopedRequest(scope, `/projects/${projectId}/content/${outputId}`, {
      method: 'PATCH', body: JSON.stringify({ content }),
    });
    this.assertScope(scope);
    this.updateOutputContent(outputId, content);
    return true;
  }
}

export const projectService = new ProjectService();
