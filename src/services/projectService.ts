import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Project, ContentOutput, OutputPlatform, CreatorProfile, ProjectStatus, Transcript } from '../types';

export interface CreateProjectInput {
  id?: string;
  userId?: string;
  title: string;
  sourceType?: 'upload' | 'url';
  sourceUrl?: string | null;
  videoStatus?: ProjectStatus;
  notes?: string;
}

const INITIAL_PROFILE: CreatorProfile = {
  name: 'Creator',
  email: 'creator@vireo.app',
  niche: 'Tech, SaaS & Solopreneurship',
  audience: 'Founders, builders, and content creators',
  language: 'English',
  tone: 'Friendly',
};

class ProjectService {
  private projects: Project[] = [];
  private outputs: ContentOutput[] = [];
  private profile: CreatorProfile = INITIAL_PROFILE;

  constructor() {
    this.load();
  }

  private load() {
    try {
      const p = localStorage.getItem('vireo_projects');
      const o = localStorage.getItem('vireo_outputs');
      const pr = localStorage.getItem('vireo_profile');

      this.projects = p ? JSON.parse(p) : [];
      this.outputs = o ? JSON.parse(o) : [];
      this.profile = pr ? JSON.parse(pr) : INITIAL_PROFILE;
    } catch {
      this.projects = [];
      this.outputs = [];
      this.profile = INITIAL_PROFILE;
    }
  }

  private save() {
    try {
      localStorage.setItem('vireo_projects', JSON.stringify(this.projects));
      localStorage.setItem('vireo_outputs', JSON.stringify(this.outputs));
      localStorage.setItem('vireo_profile', JSON.stringify(this.profile));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  private mapRowToProject(row: any): Project {
    const status = (row.video_status as ProjectStatus) || 'uploading';
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title || 'Untitled Project',
      source_type: row.source_type || 'upload',
      source_url: row.source_url || null,
      video_url: row.source_url || null,
      notes: row.notes || '',
      status,
      video_status: status,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Fetches real projects from Supabase for the authenticated user.
   * Updates local cache and notifies listeners.
   */
  async fetchProjects(userId?: string): Promise<Project[]> {
    if (!isSupabaseConfigured) {
      return this.getProjects();
    }

    try {
      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching Supabase projects:', error.message);
        return this.getProjects();
      }

      if (data) {
        const mapped = data.map((row) => this.mapRowToProject(row));
        this.projects = mapped;
        this.save();
        window.dispatchEvent(new CustomEvent('vireo_project_updated'));
        return mapped;
      }
    } catch (err) {
      console.error('Unexpected error fetching projects:', err);
    }

    return this.getProjects();
  }

  /**
   * Fetches a single project by ID from Supabase or local cache.
   */
  async fetchProject(id: string): Promise<Project | null> {
    if (!isSupabaseConfigured) {
      return this.getProject(id) || null;
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching Supabase project:', error.message);
        return this.getProject(id) || null;
      }

      if (data) {
        const mapped = this.mapRowToProject(data);
        const idx = this.projects.findIndex((p) => p.id === id);
        if (idx >= 0) {
          this.projects[idx] = mapped;
        } else {
          this.projects.unshift(mapped);
        }
        this.save();
        window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: id } }));
        return mapped;
      }
    } catch (err) {
      console.error('Unexpected error fetching single project:', err);
    }

    return this.getProject(id) || null;
  }

  /**
   * Synchronous cached projects getter for instant initial rendering.
   */
  getProjects(): Project[] {
    return [...this.projects];
  }

  /**
   * Synchronous cached project getter by ID.
   */
  getProject(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  getOutputs(projectId: string): ContentOutput[] {
    return this.outputs.filter((o) => o.project_id === projectId);
  }

  getProfile(): CreatorProfile {
    return { ...this.profile };
  }

  updateProfile(profile: Partial<CreatorProfile>): CreatorProfile {
    this.profile = { ...this.profile, ...profile };
    this.save();
    return this.profile;
  }

  /**
   * Async project creation inserting to Supabase when configured, or local fallback.
   */
  async createProjectAsync(input: CreateProjectInput): Promise<Project> {
    const projectId = input.id || crypto.randomUUID();
    const status = input.videoStatus || 'uploading';

    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.'
      );
    }

    if (!input.userId) {
      throw new Error('You must be signed in with a Supabase user account to create a project.');
    }

    const sourceUrl = input.sourceUrl || null;

    const newProject: Project = {
      id: projectId,
      user_id: input.userId,
      title: input.title.trim() || 'Untitled Video Project',
      source_type: input.sourceType || 'upload',
      source_url: sourceUrl,
      video_url: sourceUrl,
      notes: input.notes?.trim() || '',
      status,
      video_status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const insertPayload = {
      id: newProject.id,
      user_id: newProject.user_id,
      title: newProject.title,
      source_type: newProject.source_type,
      source_url: newProject.source_url,
      video_status: newProject.video_status,
      notes: newProject.notes,
    };

    // Safe diagnostics logging (Task 12: table, operation, column names only)
    console.info('[Supabase Project Save]', {
      table: 'projects',
      operation: 'insert',
      columns: Object.keys(insertPayload),
    });

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('Failed to create project in Supabase:', error.message);
        throw new Error(`Failed to save project to Supabase: ${error.message}`);
      }

      if (data) {
        const mapped = this.mapRowToProject(data);
        this.projects.unshift(mapped);
        this.save();
        window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
        return mapped;
      }
    } catch (err: any) {
      console.error('Error inserting project to Supabase:', err);
      throw err;
    }

    return newProject;
  }

  /**
   * Updates an existing project in Supabase or local cache.
   */
  async updateProjectAsync(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existingIdx = this.projects.findIndex((p) => p.id === id);
    const existing = existingIdx >= 0 ? this.projects[existingIdx] : null;

    if (isSupabaseConfigured) {
      try {
        // ONLY update columns that actually exist in the database table public.projects:
        // title, source_type, source_url, video_status, notes
        const dbUpdates: Record<string, any> = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.source_type !== undefined) dbUpdates.source_type = updates.source_type;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

        // In the database schema, source_url holds the storage path for uploads
        if (updates.source_url !== undefined) {
          dbUpdates.source_url = updates.source_url;
        }

        if (updates.video_status !== undefined || updates.status !== undefined) {
          dbUpdates.video_status = updates.video_status || updates.status;
        }

        // Safe diagnostics logging (Task 12: table, operation, column names only)
        console.info('[Supabase Project Save]', {
          table: 'projects',
          operation: 'update',
          projectId: id,
          columns: Object.keys(dbUpdates),
        });

        const { data, error } = await supabase
          .from('projects')
          .update(dbUpdates)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (error) {
          console.error('Error updating Supabase project:', error.message);
          throw new Error(`Failed to update project in Supabase: ${error.message}`);
        } else if (data) {
          const mapped = this.mapRowToProject(data);
          if (existingIdx >= 0) {
            this.projects[existingIdx] = mapped;
          } else {
            this.projects.unshift(mapped);
          }
          this.save();
          window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: id } }));
          return mapped;
        }
      } catch (err) {
        console.error('Unexpected error updating project in Supabase:', err);
        throw err;
      }
    }

    // Local fallback update
    if (existing) {
      const updated: Project = {
        ...existing,
        ...updates,
        status: updates.video_status || updates.status || existing.status,
        video_status: updates.video_status || updates.status || existing.video_status,
        updated_at: new Date().toISOString(),
      };
      this.projects[existingIdx] = updated;
      this.save();
      window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: id } }));
      return updated;
    }

    return null;
  }

  /**
   * Deletes a project from Supabase and local cache.
   */
  async deleteProject(id: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) {
          console.error('Error deleting project from Supabase:', error.message);
        }
      } catch (err) {
        console.error('Unexpected error deleting project from Supabase:', err);
      }
    }

    this.projects = this.projects.filter((p) => p.id !== id);
    this.outputs = this.outputs.filter((o) => o.project_id !== id);
    this.save();
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: id } }));
    return true;
  }

  /**
   * Legacy synchronous createProject method preserved for backward-compatibility.
   */
  createProject(title: string, videoUrl: string | null, notes: string): Project {
    const isUrl = Boolean(videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')));
    const newProj: Project = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled Video Project',
      source_type: isUrl ? 'url' : 'upload',
      source_url: isUrl ? videoUrl : null,
      video_url: videoUrl,
      notes: notes.trim(),
      status: isUrl ? 'queued' : 'uploaded',
      video_status: isUrl ? 'queued' : 'uploaded',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.projects.unshift(newProj);
    this.save();
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: newProj.id } }));
    return newProj;
  }

  updateOutputContent(outputId: string, content: string): boolean {
    const item = this.outputs.find((o) => o.id === outputId);
    if (!item) return false;
    item.content = content;
    this.save();
    return true;
  }

  /**
   * Calls the backend API to start/retry video processing and transcription.
   * POST /api/projects/:id/process
   */
  async startProcessing(projectId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('User session not found. Please log in again.');
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/projects/${projectId}/process`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to start video processing.');
      }

      // Optimistically update local project video_status to 'processing'
      await this.updateProjectAsync(projectId, { video_status: 'processing' });
      return { success: true, message: data.message };
    } catch (err: any) {
      console.error('Failed to trigger project processing:', err);
      throw err;
    }
  }

  /**
   * Fetches transcript for a project from Supabase database or backend API.
   * GET /api/projects/:id/transcript or supabase query
   */
  async fetchTranscript(projectId: string): Promise<Transcript | null> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('transcripts')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching transcript directly from Supabase, trying backend API:', error.message);
        } else if (data) {
          return data as Transcript;
        }
      } catch (err) {
        console.warn('Direct transcript query failed:', err);
      }
    }

    // Fallback: fetch via backend API endpoint with auth token
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/projects/${projectId}/transcript`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json.transcript || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches content outputs for a project from Supabase content_outputs or backend API.
   * Synchronizes local cache so getOutputs(projectId) returns latest data.
   */
  async fetchContentOutputs(projectId: string): Promise<ContentOutput[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('content_outputs')
          .select('*')
          .eq('project_id', projectId)
          .order('platform', { ascending: true })
          .order('position', { ascending: true });

        if (!error && data) {
          // Replace cached outputs for this project
          this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(data as ContentOutput[]);
          this.save();
          return data as ContentOutput[];
        }
      } catch (err) {
        console.warn('Direct content_outputs fetch failed:', err);
      }
    }

    // Fallback: fetch via backend API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return this.getOutputs(projectId);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/projects/${projectId}/content`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const json = await response.json();
        const outputs = json.outputs || [];
        this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
        this.save();
        return outputs;
      }
    } catch (err) {
      console.warn('Backend content fetch error:', err);
    }

    return this.getOutputs(projectId);
  }

  /**
   * Triggers content generation on the backend for all platforms or a specific platform.
   * POST /api/projects/:id/generate-content
   */
  async generateContent(
    projectId: string,
    platform?: OutputPlatform,
    customNotes?: string
  ): Promise<{ success: boolean; message: string; outputs: ContentOutput[] }> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error('User session not found. Please log in again.');
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${apiUrl}/projects/${projectId}/generate-content`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform,
        customNotes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to generate content.');
    }

    const outputs = (data.outputs || []) as ContentOutput[];

    // Synchronize local cache with returned outputs
    if (platform) {
      this.outputs = this.outputs
        .filter((o) => !(o.project_id === projectId && o.platform === platform))
        .concat(outputs.filter((o) => o.platform === platform));
    } else {
      this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
    }
    this.save();
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));

    return {
      success: true,
      message: data.message || 'Content generated successfully.',
      outputs,
    };
  }

  /**
   * Persists an edited output item to Supabase content_outputs and local cache.
   */
  async updateOutputContentAsync(outputId: string, projectId: string, content: string): Promise<boolean> {
    // 1. Update local cache immediately
    this.updateOutputContent(outputId, content);

    // 2. Persist to Supabase if configured
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('content_outputs')
          .update({ content: content.trim() })
          .eq('id', outputId)
          .eq('project_id', projectId);

        if (!error) return true;
      } catch (err) {
        console.warn('Direct output update error, attempting backend API:', err);
      }
    }

    // 3. Fallback to backend API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return true;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      await fetch(`${apiUrl}/projects/${projectId}/content/${outputId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
    } catch {
      // Local cache already updated
    }

    return true;
  }
}

export const projectService = new ProjectService();
