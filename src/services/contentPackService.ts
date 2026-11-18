import { backendRequest } from './backendClient';
import {
  ContentPack,
  ContentPackItem,
  ContentPackGenerationMode,
  ContentPackTemplate,
  ContentPackSourceType,
  ContentPackVersion,
  OutputPlatform,
} from '../types';

export interface GenerateContentPackParams {
  sourceType?: ContentPackSourceType;
  projectId?: string;
  clipId?: string;
  videoIntelligenceId?: string;
  transcriptText?: string;
  sourceTitle?: string;
  mode?: ContentPackGenerationMode;
  template?: ContentPackTemplate;
  platform?: OutputPlatform;
  platforms?: OutputPlatform[];
  tone?: string;
  targetAudience?: string;
  target_audience?: string;
  user_instruction?: string;
  userInstruction?: string;
  brand_brain_id?: string;
  brandBrainId?: string;
  idempotency_key?: string;
  idempotencyKey?: string;
}

export interface VersionHistoryResponse {
  versions: ContentPackVersion[];
  total: number;
  limit: number;
  offset: number;
}

export interface ContentPackCapabilities {
  provider_state: 'CONFIGURED' | 'NOT_CONFIGURED' | 'TEMP_UNAVAILABLE' | 'ERROR';
  supported_platforms: string[];
  supported_modes: string[];
  supported_templates: string[];
  item_types: string[];
}

class FrontendContentPackService {
  /**
   * Retrieves capabilities and provider status
   */
  async getCapabilities(): Promise<ContentPackCapabilities> {
    const res = await backendRequest<{ status: string; data: ContentPackCapabilities }>(
      '/content-packs/capabilities'
    );
    return res.data;
  }

  /**
   * Generates a new Content Pack supporting all 4 sources:
   * 'clip', 'project', 'upload', or 'transcript'.
   */
  async generateContentPack(params: GenerateContentPackParams): Promise<ContentPack> {
    const idempotencyKey = params.idempotency_key || params.idempotencyKey;
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      '/content-packs/generate',
      {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        body: JSON.stringify(params),
      }
    );
    return res.data;
  }

  /**
   * Lists recent Content Packs across all projects and sources for the authenticated user
   */
  async listRecentPacks(limit = 20): Promise<ContentPack[]> {
    const res = await backendRequest<{ status: string; data: ContentPack[] }>(
      `/content-packs/recent?limit=${Math.min(Math.max(1, limit), 50)}`
    );
    return res.data || [];
  }

  /**
   * Lists content packs for a specific project
   */
  async listPacksForProject(projectId: string): Promise<ContentPack[]> {
    const res = await backendRequest<{ status: string; data: ContentPack[] }>(
      `/content-packs/project/${projectId}`
    );
    return res.data || [];
  }

  /**
   * Retrieves version history for a Content Pack
   */
  async getVersionHistory(
    contentPackId: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
  ): Promise<ContentPackVersion[]> {
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.set('limit', String(options.limit));
    if (options?.offset) queryParams.set('offset', String(options.offset));
    if (options?.order) queryParams.set('order', options.order);
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const res = await backendRequest<{
      status: string;
      data: ContentPackVersion[];
      pagination?: { total: number; limit: number; offset: number };
    }>(`/content-packs/${contentPackId}/versions${qs}`);
    return res.data || [];
  }

  /**
   * Retrieves version history with full pagination metadata for a Content Pack
   */
  async getVersionHistoryWithPagination(
    contentPackId: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
  ): Promise<VersionHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.set('limit', String(options.limit));
    if (options?.offset) queryParams.set('offset', String(options.offset));
    if (options?.order) queryParams.set('order', options.order);
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const res = await backendRequest<{
      status: string;
      data: ContentPackVersion[];
      pagination?: { total: number; limit: number; offset: number };
    }>(`/content-packs/${contentPackId}/versions${qs}`);
    return {
      versions: res.data || [],
      total: res.pagination?.total ?? (res.data || []).length,
      limit: res.pagination?.limit ?? (options?.limit || 20),
      offset: res.pagination?.offset ?? (options?.offset || 0),
    };
  }

  /**
   * Retrieves a Content Pack and all items by ID
   */
  async getContentPack(id: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${id}`
    );
    return res.data;
  }

  /**
   * Phase 4B.4 Phase 3: Batch export content packs in JSON, Markdown, or CSV format.
   * Downloads the file directly in the browser and automatically revokes the created Blob URL.
   */
  async batchExportPacks(
    packIds: string[],
    format: 'json' | 'markdown' | 'csv' = 'json'
  ): Promise<{ filename: string; exportedCount: number; missingIds: string[] }> {
    if (!packIds || packIds.length === 0) {
      throw new Error('At least one pack ID must be selected for export.');
    }
    if (packIds.length > 25) {
      throw new Error('Batch export limit is 25 packs per request.');
    }

    const res = await backendRequest<{
      status: string;
      data: {
        filename: string;
        content_type: string;
        content: string;
        exported_count: number;
        missing_ids: string[];
      };
    }>('/content-packs/batch-export', {
      method: 'POST',
      body: JSON.stringify({ pack_ids: packIds, format }),
    });

    const { filename, content_type, content, exported_count, missing_ids } = res.data;

    // Trigger browser download with automatic ObjectURL cleanup
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([content], { type: content_type });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Revoke the Object URL after download dispatch
      setTimeout(() => {
        try {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          window.URL.revokeObjectURL(objectUrl);
        } catch {}
      }, 1000);
    }

    return {
      filename,
      exportedCount: exported_count,
      missingIds: missing_ids || [],
    };
  }

  /**
   * Lists content packs for a specific clip
   */
  async listPacksForClip(projectId: string, clipId: string): Promise<ContentPack[]> {
    const res = await backendRequest<{ status: string; data: ContentPack[] }>(
      `/projects/${projectId}/clips/${clipId}/content-packs`
    );
    return res.data || [];
  }

  /**
   * Updates an item (text edit, lock, approval)
   */
  async updateItem(
    contentPackId: string,
    itemId: string,
    updates: { text?: string; locked?: boolean; approved?: boolean }
  ): Promise<ContentPackItem> {
    const res = await backendRequest<{ status: string; data: ContentPackItem }>(
      `/content-packs/${contentPackId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return res.data;
  }

  /**
   * Regenerates a single item
   */
  async regenerateItem(
    contentPackId: string,
    itemId: string,
    userInstruction?: string
  ): Promise<ContentPackItem> {
    const res = await backendRequest<{ status: string; data: ContentPackItem }>(
      `/content-packs/${contentPackId}/items/${itemId}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Regenerates items for a specific platform
   */
  async regeneratePlatform(
    contentPackId: string,
    platform: OutputPlatform,
    userInstruction?: string
  ): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/platforms/${platform}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Regenerates the entire Content Pack
   */
  async regeneratePack(
    contentPackId: string,
    userInstruction?: string
  ): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Approves the Content Pack and all items
   */
  async approvePack(contentPackId: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/approve`,
      {
        method: 'POST',
      }
    );
    return res.data;
  }

  /**
   * Translates the Content Pack to a target language
   */
  async translatePack(contentPackId: string, targetLanguage: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/translate`,
      {
        method: 'POST',
        body: JSON.stringify({ target_language: targetLanguage }),
      }
    );
    return res.data;
  }

  /**
   * Retrieves publish handoff payload
   */
  async getPublishHandoff(
    contentPackId: string,
    platform: OutputPlatform
  ): Promise<Record<string, any>> {
    const res = await backendRequest<{ status: string; data: Record<string, any> }>(
      `/content-packs/${contentPackId}/publish-handoff/${platform}`
    );
    return res.data;
  }
}

export const contentPackService = new FrontendContentPackService();
export default contentPackService;
