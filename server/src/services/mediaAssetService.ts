import crypto from 'node:crypto';
import {headObject,signObjectGet} from './objectStorageService.js';
import {isAllowedClientEditorSourcePath} from '../utils/editorAssetValidator.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import {
  AppError,
  isValidUUID,
  MediaAssetRecord,
  MediaSearchFilter,
  MediaSearchResult,
  NormalizedMediaItem,
  MediaSourceType,
  MediaType,
  ClipAspectRatio,
} from '../types/index.js';
import { StockMediaProviderRegistry } from './stockMediaProvider.js';
import { logger } from '../utils/logger.js';

export class MediaAssetService {
  /**
   * Persists a new media asset record for a user.
   */
  public static async createAsset(
    userId: string,
    data: Partial<MediaAssetRecord>
  ): Promise<MediaAssetRecord> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();

    const semanticText = [
      data.title || '',
      data.description || '',
      (data.tags || []).join(' '),
      data.semantic_text || '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const record: MediaAssetRecord = {
      id,
      user_id: userId,
      project_id: data.project_id || null,
      clip_id: data.clip_id || null,
      source_type: data.source_type || 'USER_UPLOAD',
      media_type: data.media_type || 'VIDEO',
      provider: data.provider || 'local',
      provider_asset_id: data.provider_asset_id || null,
      storage_path: data.storage_path || null,
      external_preview_url: data.external_preview_url || null,
      title: data.title || 'Untitled Asset',
      description: data.description || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      duration: data.duration !== undefined ? data.duration : null,
      width: data.width || 1080,
      height: data.height || 1920,
      fps: data.fps || 30,
      aspect_ratio: data.aspect_ratio || '9:16',
      license_type: data.license_type || 'User Owned / Local',
      license_source: data.license_source || 'user',
      source_page_url: data.source_page_url || null,
      attribution: typeof data.attribution === 'string' ? data.attribution : null,
      thumbnail_path: data.thumbnail_path || null,
      proxy_path: data.proxy_path || null,
      semantic_text: semanticText,
      created_at: now,
      updated_at: now,
    };

    const { error } = await dataRepository.from('media_assets').insert(record);
    if (error) {
      logger.error('[MediaAssetService] Failed to insert asset', { error: error.message });
      throw new AppError(`Failed to save media asset: ${error.message}`, 500, 'DATABASE_ERROR');
    }

    return record;
  }

  /**
   * Retrieves an asset by ID verifying user ownership.
   */
  public static async getAsset(id: string, userId: string): Promise<MediaAssetRecord | null> {
    if (!isValidUUID(id)) return null;

    const { data, error } = await dataRepository
      .from('media_assets')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.resolveGeneratedAsset(data as MediaAssetRecord, userId);
  }

  /** Generated library entries identify rendered output, never original footage.
   * Resolve again at read time so historical misindexed rows cannot bypass this.
   * This does not materialize storage or change render-freshness rollout policy.
   */
  private static async resolveGeneratedAsset(asset: MediaAssetRecord, userId: string): Promise<MediaAssetRecord | null> {
    if (asset.source_type !== 'GENERATED_CLIP') return asset;
    if (!asset.clip_id || asset.user_id !== userId) return null;
    const { data: clip, error } = await dataRepository.from('clips').select('*')
      .eq('id', asset.clip_id).eq('user_id', userId).maybeSingle();
    const output = clip?.output_storage_path;
    if (error || !clip || clip.render_status !== 'ready' || typeof output !== 'string' ||
        !output.startsWith(`users/${userId}/`) || !isAllowedClientEditorSourcePath(userId, output) || output === clip.source_storage_path) return null;
    return { ...asset, storage_path: output };
  }

  /** Exact selected owned library preview, without changing saved references.
   * A short-lived URL identifies this output, not latest-editor freshness.
   */
  public static async selectedVideoPreview(id:string,userId:string,expectedKey:string):Promise<{signedUrl:string;expiresInSeconds:number}> {
    const resolve=async()=>{
      const asset=await this.getAsset(id,userId);
      if(!asset||asset.media_type!=='VIDEO'||!['PROJECT_SOURCE','GENERATED_CLIP'].includes(asset.source_type)||
         asset.storage_path!==expectedKey||!expectedKey.startsWith(`users/${userId}/`)||!isAllowedClientEditorSourcePath(userId,expectedKey))
        throw new AppError('Selected media is no longer available. Choose it again.',409,'ASSET_NOT_AVAILABLE');
      if(asset.source_type==='PROJECT_SOURCE'){
        const {data:project,error}=await dataRepository.from('projects').select('*').eq('id',asset.project_id).eq('user_id',userId).maybeSingle();
        if(error||!project||project.source_storage_path!==expectedKey)throw new AppError('Selected project source changed.',409,'ASSET_NOT_AVAILABLE');
      }
      return asset.source_type==='GENERATED_CLIP'?'clips' as const:'source' as const;
    };
    const bucket=await resolve();
    const head=await headObject(bucket,expectedKey);
    if(!Number.isSafeInteger(head.size)||head.size<=0||head.size>16*1024*1024||!head.etag||head.etag.startsWith('W/'))throw new AppError('Selected media is outside the bounded preview scope.',409,'ASSET_NOT_AVAILABLE');
    if(await resolve()!==bucket)throw new AppError('Selected media changed.',409,'ASSET_NOT_AVAILABLE');
    if(bucket==='clips'){
      const asset=await this.getAsset(id,userId);
      if(!asset?.clip_id||asset.storage_path!==expectedKey)throw new AppError('Selected clip changed.',409,'ASSET_NOT_AVAILABLE');
      const {ClipRenderService}=await import('./clipRenderService.js');
      // Keep existing source, freshness-rollout and export entitlement checks.
      const preview=await ClipRenderService.getSignedPreviewUrl(asset.clip_id,userId,undefined,expectedKey);
      if(await resolve()!==bucket)throw new AppError('Selected clip changed.',409,'ASSET_NOT_AVAILABLE');
      return preview;
    }
    return {signedUrl:await signObjectGet(bucket,expectedKey,undefined,{versionId:head.versionId}),expiresInSeconds:300};
  }

  /** Concurrent first opens converge on one row without rewriting legacy IDs. */
  private static async createIndexedAsset(userId:string,binding:string,data:Partial<MediaAssetRecord>):Promise<MediaAssetRecord>{
    const hash=crypto.createHash('sha256').update(JSON.stringify([userId,binding])).digest('hex');
    const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    try{return await this.createAsset(userId,{...data,id});}
    catch(error){
      const {data:existing,error:readError}=await dataRepository.from('media_assets').select('*').eq('id',id).eq('user_id',userId).maybeSingle();
      if(!readError&&existing&&existing.source_type===data.source_type&&existing.project_id===data.project_id&&existing.clip_id===(data.clip_id??null))return existing as MediaAssetRecord;
      throw error;
    }
  }

  /**
   * Indexes existing real project media:
   * - Source video from `projects`
   * - Rendered clips from `clips`
   * - Transcripts / OCR keywords for semantic text
   */
  public static async indexProjectMedia(
    projectId: string,
    userId: string
  ): Promise<MediaAssetRecord[]> {
    if (!isValidUUID(projectId)) {
      throw new AppError('Invalid project ID.', 400, 'INVALID_UUID');
    }

    // 1. Fetch project to index source video
    const { data: project, error: pErr } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (pErr || !project) {
      throw new AppError('Project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
    }

    // Bound this explicit synchronization before any index mutation. Existing
    // rows are read once, not once per clip. Large libraries need paging first.
    const {data:clips,error:clipsError}=await dataRepository.from('clips').select('*')
      .eq('project_id',projectId).eq('user_id',userId).limit(101);
    const {data:existingAssets,error:assetsError}=await dataRepository.from('media_assets').select('*')
      .eq('project_id',projectId).eq('user_id',userId).limit(301);
    if(clipsError||assetsError||!Array.isArray(clips)||!Array.isArray(existingAssets))throw new AppError('Could not read project media for synchronization.',503,'DATABASE_ERROR');
    if(clips.length>100||existingAssets.length>300)throw new AppError('This project library needs paged synchronization before loading.',409,'MEDIA_LIBRARY_SYNC_LIMIT');
    const indexedAssets:MediaAssetRecord[]=[];
    const sources=existingAssets.filter(a=>a.source_type==='PROJECT_SOURCE');
    if(sources.length>1)throw new AppError('Project source library identity needs review.',409,'MEDIA_LIBRARY_IDENTITY_CONFLICT');
    const existingSource=sources[0];
    const generated=new Map<string,MediaAssetRecord>();
    for(const row of existingAssets.filter(a=>a.source_type==='GENERATED_CLIP')){
      if(row.clip_id&&generated.has(row.clip_id))throw new AppError('Generated library identity needs review.',409,'MEDIA_LIBRARY_IDENTITY_CONFLICT');
      if(row.clip_id)generated.set(row.clip_id,row as MediaAssetRecord);
    }

    if (!existingSource && project.source_storage_path) {
      const sourceAsset = await this.createIndexedAsset(userId, `PROJECT_SOURCE:${projectId}`, {
        project_id: projectId,
        source_type: 'PROJECT_SOURCE',
        media_type: 'VIDEO',
        provider: 'local',
        provider_asset_id: project.id,
        storage_path: project.source_storage_path,
        title: project.title || 'Source Video',
        description: `Original source footage for project ${project.title || projectId}`,
        duration: project.duration_seconds || null,
        width: 1920,
        height: 1080,
        aspect_ratio: '16:9',
        tags: ['source', 'original', 'raw_footage'],
        semantic_text: `source video original raw footage ${project.title || ''}`,
      });
      indexedAssets.push(sourceAsset);
    } else if (existingSource) {
      indexedAssets.push(existingSource as MediaAssetRecord);
    }

    if (Array.isArray(clips)) {
      for (const clip of clips) {
        // Only a published output is a generated clip. Source footage is indexed
        // separately above and must never stand in for this chosen clip.
        if (clip.render_status !== 'ready' || typeof clip.output_storage_path !== 'string' ||
            !clip.output_storage_path.startsWith(`users/${userId}/`) || !isAllowedClientEditorSourcePath(userId, clip.output_storage_path) ||
            clip.output_storage_path === clip.source_storage_path) continue;
        const existingClipAsset=generated.get(clip.id);

        if (!existingClipAsset) {
          const duration = clip.end_seconds && clip.start_seconds
            ? clip.end_seconds - clip.start_seconds
            : clip.duration_seconds || null;

          const tags = Array.isArray(clip.tags) ? clip.tags : [];
          const clipAsset = await this.createIndexedAsset(userId, `GENERATED_CLIP:${clip.id}`, {
            project_id: projectId,
            clip_id: clip.id,
            source_type: 'GENERATED_CLIP',
            media_type: 'VIDEO',
            provider: 'vireo',
            provider_asset_id: clip.id,
            storage_path: clip.output_storage_path,
            title: clip.title || `Clip #${clip.id.slice(0, 8)}`,
            description: clip.explanation || clip.summary || '',
            tags: ['clip', clip.aspect_ratio || '9:16', ...tags],
            duration,
            width: clip.aspect_ratio === '9:16' ? 1080 : 1920,
            height: clip.aspect_ratio === '9:16' ? 1920 : 1080,
            aspect_ratio: clip.aspect_ratio || '9:16',
            semantic_text: `clip ${clip.title || ''} ${clip.summary || ''} ${tags.join(' ')}`,
          });
          indexedAssets.push(clipAsset);
        } else {
          const resolved={...existingClipAsset,storage_path:clip.output_storage_path};
          if (resolved) {
            if (resolved.storage_path !== existingClipAsset.storage_path) {
              const { error } = await dataRepository.from('media_assets').update({ storage_path: resolved.storage_path })
                .eq('id', resolved.id).eq('user_id', userId).eq('source_type', 'GENERATED_CLIP');
              if (error) throw new AppError('Failed to refresh generated media identity.', 500, 'DATABASE_ERROR');
            }
            indexedAssets.push(resolved);
          }
        }
      }
    }

    logger.info(`[MediaAssetService] Indexed ${indexedAssets.length} assets for project ${projectId}`);
    return indexedAssets;
  }

  /**
   * Search media across prioritized layers:
   * 1. Project assets
   * 2. User media library
   * 3. Brand assets
   * 4. Stock providers (returns empty + NOT_CONFIGURED when unconfigured)
   * 5. Generated media provider
   */
  public static async searchMedia(
    userId: string,
    filter: MediaSearchFilter = {}
  ): Promise<MediaSearchResult> {
    const query = (filter.query || '').trim().toLowerCase();
    const queryTokens = query ? query.split(/\s+/).filter((t) => t.length > 1) : [];

    // Query user media_assets collection
    let dbQuery = dataRepository.from('media_assets').select('*').eq('user_id', userId);

    if (filter.project_id && isValidUUID(filter.project_id)) {
      // If user specifically requested project-only search
      if (filter.source_type === 'PROJECT_SOURCE') {
        dbQuery = dbQuery.eq('project_id', filter.project_id);
      }
    }

    if (filter.source_type) {
      dbQuery = dbQuery.eq('source_type', filter.source_type);
    }
    if (filter.media_type) {
      dbQuery = dbQuery.eq('media_type', filter.media_type);
    }

    const { data: rawAssets, error } = await dbQuery;
    const userAssets: MediaAssetRecord[] = Array.isArray(rawAssets) ? rawAssets : [];

    // Score and rank user assets
    const scoredUserItems: NormalizedMediaItem[] = [];

    for (const savedAsset of userAssets) {
      const asset = await this.resolveGeneratedAsset(savedAsset, userId);
      if (!asset) continue;
      // Filter out duration bounds if specified
      if (typeof filter.min_duration === 'number' && typeof asset.duration === 'number' && asset.duration < filter.min_duration) {
        continue;
      }
      if (typeof filter.max_duration === 'number' && typeof asset.duration === 'number' && asset.duration > filter.max_duration) {
        continue;
      }
      if (filter.orientation) {
        const isPortrait = asset.aspect_ratio === '9:16' || (asset.height && asset.width && asset.height > asset.width);
        if (filter.orientation === 'portrait' && !isPortrait) continue;
        if (filter.orientation === 'landscape' && isPortrait) continue;
      }

      const scoreResult = this.computeRelevanceScore(asset, queryTokens, filter);

      scoredUserItems.push({
        id: asset.id,
        provider: asset.provider || 'local',
        provider_asset_id: asset.provider_asset_id || asset.id,
        media_type: asset.media_type,
        title: asset.title,
        preview_url: asset.external_preview_url || asset.thumbnail_path || '',
        source_url: asset.storage_path || '',
        duration: asset.duration || 0,
        width: asset.width || 1080,
        height: asset.height || 1920,
        aspect_ratio: asset.aspect_ratio || '9:16',
        license_type: asset.license_type || 'User Owned',
        license_source: asset.license_source || 'user',
        source_page_url: asset.source_page_url || undefined,
        attribution: asset.attribution || null,
        tags: asset.tags,
        relevance_score: scoreResult.score,
        relevance_explanation: scoreResult.explanation,
        priority_source: asset.project_id === filter.project_id ? 'project' : asset.source_type === 'BRAND_ASSET' ? 'brand' : 'user_library',
      });
    }

    // Sort scored user items by priority then score
    scoredUserItems.sort((a, b) => {
      // Prioritize project assets over other user assets
      const priorityWeightA = a.priority_source === 'project' ? 30 : a.priority_source === 'brand' ? 20 : 10;
      const priorityWeightB = b.priority_source === 'project' ? 30 : b.priority_source === 'brand' ? 20 : 10;
      return (b.relevance_score! + priorityWeightB) - (a.relevance_score! + priorityWeightA);
    });

    // Check stock providers if requested or if user items are few
    let stockItems: NormalizedMediaItem[] = [];
    let stockStatus = 'SUPPORTED';

    if (filter.provider && filter.provider !== 'local') {
      const stockResult = await StockMediaProviderRegistry.searchStock(query, filter);
      stockItems = stockResult.items;
      stockStatus = stockResult.status;
    }

    const combinedItems = [...scoredUserItems, ...stockItems];

    // Pagination
    const page = filter.page || 1;
    const pageSize = filter.page_size || filter.per_page || 20;
    const offset = (page - 1) * pageSize;
    const paginatedItems = combinedItems.slice(offset, offset + pageSize);

    return {
      provider: filter.provider || 'vireo_media_intelligence',
      status: stockStatus as any,
      items: paginatedItems,
      total_count: combinedItems.length,
      page,
      has_more: offset + pageSize < combinedItems.length,
    };
  }

  /**
   * Calculates a transparent, normalized 0–100 relevance score with an honest explanation.
   */
  public static computeRelevanceScore(
    asset: Partial<MediaAssetRecord>,
    queryTokens: string[],
    filter: MediaSearchFilter = {}
  ): { score: number; explanation: string } {
    let score = 50; // Baseline candidate score
    const reasons: string[] = [];

    const textToMatch = [
      asset.title || '',
      asset.description || '',
      (asset.tags || []).join(' '),
      asset.semantic_text || '',
    ]
      .join(' ')
      .toLowerCase();

    // 1. Keyword / Semantic match (up to 30 points)
    if (queryTokens.length > 0) {
      let matchedCount = 0;
      for (const token of queryTokens) {
        if (textToMatch.includes(token)) matchedCount++;
      }
      const matchRatio = matchedCount / queryTokens.length;
      const matchScore = Math.round(matchRatio * 30);
      score += matchScore;
      if (matchedCount > 0) {
        reasons.push(`matches ${matchedCount} search term${matchedCount > 1 ? 's' : ''}`);
      } else {
        score -= 20;
        reasons.push('weak keyword match');
      }
    } else {
      reasons.push('general collection candidate');
    }

    // 2. Aspect ratio compatibility (up to 15 points)
    if (filter.orientation) {
      const isPortrait = asset.aspect_ratio === '9:16' || (asset.height && asset.width && asset.height > asset.width);
      if ((filter.orientation === 'portrait' && isPortrait) || (filter.orientation === 'landscape' && !isPortrait)) {
        score += 15;
        reasons.push(`${asset.aspect_ratio || filter.orientation} compatible`);
      } else {
        score -= 10;
        reasons.push('aspect ratio requires crop');
      }
    }

    // 3. Duration fit (up to 10 points)
    if (filter.target_duration && asset.duration) {
      const durDiff = Math.abs(asset.duration - filter.target_duration);
      if (durDiff <= 1.0) {
        score += 10;
        reasons.push(`${asset.duration.toFixed(1)}s duration precisely fits slot`);
      } else if (durDiff <= 3.0) {
        score += 5;
        reasons.push(`${asset.duration.toFixed(1)}s duration fits slot`);
      }
    }

    // 4. Source preference
    if (asset.source_type === 'PROJECT_SOURCE') {
      score += 15;
      reasons.push('direct project source footage');
    } else if (asset.source_type === 'BRAND_ASSET') {
      score += 10;
      reasons.push('curated brand asset');
    }

    // Bound between 0 and 100
    const finalScore = Math.max(0, Math.min(100, score));
    const explanation = `${finalScore} relevance — ${reasons.join('; ')}.`;

    return { score: finalScore, explanation };
  }

  /**
   * Finds similar assets based on shared tags, semantic text, and aspect ratio.
   */
  public static async findSimilar(
    assetId: string,
    userId: string,
    limit: number = 6
  ): Promise<MediaAssetRecord[]> {
    const target = await this.getAsset(assetId, userId);
    if (!target) return [];

    const { data: allRaw } = await dataRepository
      .from('media_assets')
      .select('*')
      .eq('user_id', userId);

    const allAssets: MediaAssetRecord[] = Array.isArray(allRaw) ? allRaw : [];
    const resolvedAssets = await Promise.all(allAssets.map(asset => this.resolveGeneratedAsset(asset, userId)));
    const candidates = resolvedAssets.filter((a): a is MediaAssetRecord => a !== null && a.id !== target.id);

    const scored = candidates.map((c) => {
      let simScore = 0;
      if (c.media_type === target.media_type) simScore += 10;
      if (c.aspect_ratio === target.aspect_ratio) simScore += 10;

      // Shared tags
      const targetTags = new Set(target.tags || []);
      const shared = (c.tags || []).filter((t) => targetTags.has(t)).length;
      simScore += shared * 15;

      // Semantic text overlap
      const targetWords = (target.semantic_text || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const cWords = new Set((c.semantic_text || '').toLowerCase().split(/\s+/));
      for (const tw of targetWords) {
        if (cWords.has(tw)) simScore += 5;
      }

      return { asset: c, score: simScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.asset);
  }
}
