import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Project, ContentOutput, CreatorProfile, ProjectStatus } from '../types';

export interface CreateProjectInput {
  id?: string;
  userId?: string;
  title: string;
  sourceType?: 'upload' | 'url';
  sourceUrl?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
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
      source_type: row.source_type || (row.source_url ? 'url' : 'upload'),
      source_url: row.source_url || null,
      video_url: row.source_url || row.storage_path || null,
      storage_path: row.storage_path || null,
      file_name: row.file_name || null,
      file_size: row.file_size || null,
      mime_type: row.mime_type || null,
      notes: row.notes || '',
      status,
      video_status: status,
      error: row.error || null,
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

    const newProject: Project = {
      id: projectId,
      user_id: input.userId,
      title: input.title.trim() || 'Untitled Video Project',
      source_type: input.sourceType || 'upload',
      source_url: input.sourceUrl || null,
      video_url: input.sourceUrl || input.storagePath || null,
      storage_path: input.storagePath || null,
      file_name: input.fileName || null,
      file_size: input.fileSize || null,
      mime_type: input.mimeType || null,
      notes: input.notes?.trim() || '',
      status,
      video_status: status,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && input.userId) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            id: newProject.id,
            user_id: newProject.user_id,
            title: newProject.title,
            source_type: newProject.source_type,
            source_url: newProject.source_url,
            storage_path: newProject.storage_path,
            file_name: newProject.file_name,
            file_size: newProject.file_size,
            mime_type: newProject.mime_type,
            video_status: newProject.video_status,
            notes: newProject.notes,
          })
          .select()
          .single();

        if (error) {
          console.error('Failed to create project in Supabase:', error.message);
          throw new Error(`Failed to save project: ${error.message}`);
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
    }

    // Local fallback
    this.projects.unshift(newProject);
    this.save();
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
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
        const dbUpdates: Record<string, any> = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.storage_path !== undefined) dbUpdates.storage_path = updates.storage_path;
        if (updates.source_url !== undefined) dbUpdates.source_url = updates.source_url;
        if (updates.file_name !== undefined) dbUpdates.file_name = updates.file_name;
        if (updates.file_size !== undefined) dbUpdates.file_size = updates.file_size;
        if (updates.mime_type !== undefined) dbUpdates.mime_type = updates.mime_type;
        if (updates.status !== undefined || updates.video_status !== undefined) {
          dbUpdates.video_status = updates.video_status || updates.status;
        }
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

        const { data, error } = await supabase
          .from('projects')
          .update(dbUpdates)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (error) {
          console.error('Error updating Supabase project:', error.message);
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
      error: null,
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
}

export const projectService = new ProjectService();
