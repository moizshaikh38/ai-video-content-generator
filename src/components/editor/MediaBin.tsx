import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Plus,
  Folder,
  Search,
  Sparkles,
  Image as ImageIcon,
  CheckCircle,
  Play,
  RotateCw,
  ShieldAlert,
  Upload,
  Film,
  Music,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackType,
  NormalizedMediaItem,
  MediaSearchFilter,
  BrollPlanRecord,
  BrollStyle,
  ProviderCapabilities,
} from '../../types';
import { mediaService } from '../../services/mediaService';

export type TabType = 'library' | 'broll';

// All supported subtab keys preserved for type-checking and regression compatibility
export type LibrarySubTab = 'Project' | 'Uploads' | 'Clips' | 'Brand' | 'Stock' | 'Generated';
export const ALL_LIBRARY_SUBTABS: readonly LibrarySubTab[] = ['Project', 'Uploads', 'Clips', 'Brand', 'Stock', 'Generated'] as const;

// User-facing asset collection subtabs for the clean Media Library panel
const ASSET_LIBRARY_TABS: readonly LibrarySubTab[] = ['Project', 'Uploads', 'Clips', 'Brand'] as const;

interface MediaBinProps {
  project: EditorProject;
  sourceVideoUrl?: string | null;
  onAddMediaToTimeline: (type: EditorTrackType, name: string, url: string, duration?: number) => void;
  onRefreshProject?: () => void;
  currentTime?: number;
  initialTab?: 'library' | 'broll' | string;
  brollDirectOnly?: boolean;
}


/**
 * Renders the asset's real preview when one exists. Video assets show their first frame via a
 * metadata-only <video>; images show the image. Assets with no preview data get a typed
 * placeholder rather than a stand-in picture.
 */
const AssetThumb: React.FC<{ item: { media_type: string; preview_url?: string | null; title?: string } }> = ({ item }) => {
  const frame = 'w-16 h-10 shrink-0 rounded-lg overflow-hidden border border-vc-border bg-vc-canvas flex items-center justify-center';
  const src = item.preview_url || undefined;

  if (src && item.media_type === 'IMAGE') {
    return (
      <div className={frame}>
        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
      </div>
    );
  }
  if (src && item.media_type === 'VIDEO') {
    return (
      <div className={frame}>
        <video src={src} preload="metadata" muted playsInline className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={frame}>
      {item.media_type === 'AUDIO' ? (
        <Music className="w-4 h-4 text-vc-text-muted" />
      ) : item.media_type === 'IMAGE' ? (
        <ImageIcon className="w-4 h-4 text-vc-text-muted" />
      ) : (
        <Video className="w-4 h-4 text-vc-text-muted" />
      )}
    </div>
  );
};

export const MediaBin: React.FC<MediaBinProps> = ({
  project,
  sourceVideoUrl,
  onAddMediaToTimeline,
  onRefreshProject,
  currentTime = 0,
  initialTab = 'library',
  brollDirectOnly: _brollDirectOnly = false,
}) => {
  // Mode determined by initialTab ('library' or 'broll')
  const [activeTab, setActiveTab] = useState<TabType>(initialTab === 'broll' ? 'broll' : 'library');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('Project');
  const [brollSubView, setBrollSubView] = useState<'suggestions' | 'search'>('suggestions');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize activeTab if initialTab changes externally
  useEffect(() => {
    if (initialTab === 'broll') {
      setActiveTab('broll');
    } else if (initialTab === 'library') {
      setActiveTab('library');
    }
  }, [initialTab]);

  // Search & Filter (Library)
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'ALL' | 'VIDEO' | 'IMAGE' | 'AUDIO'>('ALL');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState<NormalizedMediaItem[]>([]);
  const [providerCaps, setProviderCaps] = useState<ProviderCapabilities[]>([]);

  // B-Roll Intelligence State
  const [brollStyle, setBrollStyle] = useState<BrollStyle>('BALANCED');
  const [brollPlan, setBrollPlan] = useState<BrollPlanRecord | null>(null);
  const [isDetectingBroll, setIsDetectingBroll] = useState(false);
  const [isApplyingBroll, setIsApplyingBroll] = useState(false);
  const [brollMessage, setBrollMessage] = useState<string | null>(null);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockItems, setStockItems] = useState<NormalizedMediaItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [previewItem, setPreviewItem] = useState<NormalizedMediaItem | null>(null);

  // Load capabilities & initial media
  useEffect(() => {
    loadCapabilities();
  }, []);

  useEffect(() => {
    if (activeTab === 'library') {
      loadLibraryMedia();
    } else if (activeTab === 'broll') {
      if (project.clip_id) {
        loadLatestBrollPlan();
      }
      loadStockMedia();
    }
  }, [project.id, librarySubTab, activeTab]);

  const loadCapabilities = async () => {
    try {
      const caps = await mediaService.getMediaCapabilities();
      setProviderCaps(caps);
    } catch (e) {
      console.error('Failed to load media capabilities', e);
    }
  };

  const loadLibraryMedia = async () => {
    setLoadingMedia(true);
    try {
      const filter: MediaSearchFilter = {
        query: searchQuery.trim() || undefined,
        media_type: mediaTypeFilter === 'ALL' ? undefined : (mediaTypeFilter as any),
        project_id: project.project_id || undefined,
        per_page: 30,
      };

      if (librarySubTab === 'Project') {
        filter.source_type = 'PROJECT_SOURCE';
      } else if (librarySubTab === 'Uploads') {
        filter.source_type = 'USER_UPLOAD';
      } else if (librarySubTab === 'Clips') {
        filter.source_type = 'GENERATED_CLIP';
      } else if (librarySubTab === 'Brand') {
        filter.source_type = 'BRAND_ASSET';
      }

      const res = await mediaService.searchMedia(filter);
      setMediaItems(res.items || []);
    } catch (e) {
      console.error('Failed to load media items', e);
      setMediaItems([]);
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadStockMedia = async () => {
    setLoadingStock(true);
    try {
      const filter: MediaSearchFilter = {
        query: stockSearchQuery.trim() || undefined,
        media_type: 'VIDEO',
        provider: 'pexels',
        per_page: 20,
      };
      const res = await mediaService.searchMedia(filter);
      setStockItems(res.items || []);
    } catch (e) {
      console.error('Failed to load stock media', e);
      setStockItems([]);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleLibrarySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLibraryMedia();
  };

  const handleStockSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadStockMedia();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');
    const mediaType: NormalizedMediaItem['media_type'] = isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : 'IMAGE';

    const newItem: NormalizedMediaItem = {
      id: crypto.randomUUID(),
      provider: 'local_upload',
      provider_asset_id: file.name,
      title: file.name,
      media_type: mediaType,
      source_url: url,
      preview_url: url,
      duration: isVideo ? 5.0 : isAudio ? 10.0 : 3.0,
      width: isAudio ? 0 : 1080,
      height: isAudio ? 0 : 1920,
      tags: ['upload', 'local', isAudio ? 'audio' : isVideo ? 'video' : 'image'],
      priority_source: 'user_library',
      aspect_ratio: isAudio ? undefined : '9:16',
      license_type: 'Local User Upload',
    };

    setMediaItems((prev) => [newItem, ...prev]);
    setLibrarySubTab('Uploads');
  };

  const loadLatestBrollPlan = async () => {
    if (!project.clip_id) return;
    try {
      const plan = await mediaService.getClipBrollPlan(project.clip_id);
      if (plan) setBrollPlan(plan);
    } catch (e) {
      console.error('Failed to fetch B-roll plan', e);
    }
  };

  const handleDetectBroll = async () => {
    if (!project.clip_id) return;
    setIsDetectingBroll(true);
    setBrollMessage(null);
    try {
      const plan = await mediaService.createClipBrollPlan(project.clip_id, brollStyle);
      setBrollPlan(plan);
      setBrollMessage(`Discovered ${plan.suggestions.length} context-aware B-roll opportunities.`);
    } catch (e: any) {
      setBrollMessage(e.message || 'Failed to detect B-roll opportunities.');
    } finally {
      setIsDetectingBroll(false);
    }
  };

  const handleApplyBrollPlan = async (suggestionId?: string) => {
    if (!brollPlan) return;
    setIsApplyingBroll(true);
    try {
      const selectedIds = suggestionId ? [suggestionId] : undefined;
      const res = await mediaService.applyBrollPlan(brollPlan.id, selectedIds);
      setBrollMessage(`Successfully inserted ${res.appliedCount} B-roll layers into timeline!`);
      if (onRefreshProject) onRefreshProject();
      loadLatestBrollPlan();
    } catch (e: any) {
      setBrollMessage(e.message || 'Failed to apply B-roll plan.');
    } finally {
      setIsApplyingBroll(false);
    }
  };

  const handleInsertDirectAsset = async (asset: NormalizedMediaItem) => {
    try {
      await mediaService.insertDirectBroll(
        project.id,
        asset.id,
        currentTime,
        asset.duration && asset.duration > 0 ? Math.min(4.0, asset.duration) : 3.0
      );
      if (onRefreshProject) onRefreshProject();
    } catch (e: any) {
      // Fallback: use callback to add to project timeline
      const trackType: EditorTrackType =
        asset.media_type === 'AUDIO' ? 'AUDIO' : asset.media_type === 'IMAGE' ? 'IMAGE' : 'VIDEO';
      onAddMediaToTimeline(
        trackType,
        asset.title,
        asset.source_url || asset.preview_url,
        asset.duration || 3
      );
    }
  };

  const stockCap = providerCaps.find((c) => c.provider === 'pexels' || c.provider === 'pixabay');
  const genCap = providerCaps.find((c) => c.provider === 'ai_generated');

  return (
    <div className="w-full h-full bg-vc-surface1 flex flex-col text-xs text-vc-text-secondary select-none animate-panelSlideIn">
      {/* Hidden File Input for Direct Uploads (Library mode) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── PANEL HEADER ── */}
      {activeTab === 'library' ? (
        <div className="p-3 border-b border-white/[0.08] bg-vc-canvas/60 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Folder className="w-4 h-4 text-vc-text-secondary" />
            <span className="text-sm">Media Library</span>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] text-[11px] font-medium text-white hover:text-white flex items-center gap-1.5 transition shadow-sm"
            title="Upload Local Video, Image, or Audio"
          >
            <Upload className="w-3.5 h-3.5 text-vc-text-secondary" />
            <span>Upload</span>
          </button>
        </div>
      ) : (
        <div className="p-3 border-b border-white/[0.08] bg-vc-canvas/60 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Film className="w-4 h-4 text-vc-text-secondary" />
            <span className="text-sm">B-Roll Studio</span>
          </div>
          <div className="text-[10px] text-vc-text-secondary font-mono px-2 py-0.5 rounded bg-white/[0.04] ">
            Playhead: {currentTime.toFixed(1)}s
          </div>
        </div>
      )}

      {/* ── MODE 1: DEDICATED MEDIA LIBRARY ── */}
      {activeTab === 'library' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Subtabs for genuine project asset categories */}
          <div className="flex items-center gap-1 p-2 border-b border-white/[0.08] overflow-x-auto no-scrollbar bg-vc-canvas/40">
            {ASSET_LIBRARY_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLibrarySubTab(tab)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${
                  librarySubTab === tab
                    ? 'bg-white/[0.10] text-white border border-white/[0.12]'
                    : 'text-vc-text-secondary hover:text-white bg-white/[0.03] border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Bar & Media Type Filter */}
          <div className="p-2.5 border-b border-white/[0.08] flex flex-col gap-2 bg-vc-canvas/40">
            <form onSubmit={handleLibrarySearchSubmit} className="relative">
              <input
                type="text"
                placeholder={`Search ${librarySubTab.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-vc-canvas border border-vc-border rounded-lg pl-7 pr-3 py-1.5 text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 text-xs"
              />
              <Search className="w-3.5 h-3.5 text-vc-text-secondary absolute left-2 top-2.5" />
            </form>

            <div className="flex items-center justify-between text-[10px] text-vc-text-secondary">
              <div className="flex items-center gap-1">
                {(['ALL', 'VIDEO', 'IMAGE', 'AUDIO'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMediaTypeFilter(type);
                      loadLibraryMedia();
                    }}
                    className={`px-2 py-0.5 rounded-md transition ${
                      mediaTypeFilter === type
                        ? 'bg-white/[0.10] border border-white/20 text-white font-medium'
                        : 'hover:text-vc-text-secondary bg-white/[0.04]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadLibraryMedia}
                className="hover:text-white flex items-center gap-1"
                title="Refresh media"
              >
                <RotateCw className="w-3 h-3 text-vc-text-secondary" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {/* Pinned Source Footage Card */}
            {librarySubTab === 'Project' && sourceVideoUrl && (
              <div className="p-2.5 rounded-xl bg-vc-canvas transition flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-white truncate max-w-[190px]">
                    <Video className="w-3.5 h-3.5 text-vc-text-secondary shrink-0" />
                    <span className="truncate">Source Video</span>
                  </div>
                  <span className="text-[10px] text-vc-text-secondary font-mono">
                    {project.canvas.duration ? `${project.canvas.duration.toFixed(0)}s` : 'Base'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onAddMediaToTimeline('VIDEO', 'Source Video Track', sourceVideoUrl, project.canvas.duration || 10)}
                    className="flex-1 py-1.5 rounded-lg bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai font-medium flex items-center justify-center gap-1 transition shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add to Timeline</span>
                  </button>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {loadingMedia && (
              <div className="py-8 text-center text-vc-text-muted flex flex-col items-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-vc-text-secondary" />
                <span>Loading media assets...</span>
              </div>
            )}

            {/* Empty State */}
            {!loadingMedia && mediaItems.length === 0 && (
              <div className="py-12 text-center text-vc-text-muted flex flex-col items-center gap-2">
                <Folder className="w-8 h-8 text-neutral-600 stroke-[1.5]" />
                <p className="font-medium text-vc-text-secondary text-xs">No media assets in {librarySubTab.toLowerCase()}</p>
                <p className="text-[11px] text-vc-text-secondary max-w-[220px]">
                  {librarySubTab === 'Uploads'
                    ? 'Click "Upload" above to import your videos, images, or audio.'
                    : 'Add project footage or select another category.'}
                </p>
              </div>
            )}

            {/* Media Items List */}
            {!loadingMedia &&
              mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-vc-surface2/60 transition-colors flex flex-col gap-2 group"
                >
                  <div className="flex items-start gap-2.5">
                    <AssetThumb item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-vc-text-primary truncate">{item.title}</span>
                        <span className="text-[10px] text-vc-text-muted font-mono shrink-0">
                          {item.duration ? `${item.duration.toFixed(1)}s` : item.aspect_ratio || '9:16'}
                        </span>
                      </div>
                      <span className="block text-[10px] text-vc-text-muted mt-0.5 capitalize">
                        {item.media_type.toLowerCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertDirectAsset(item)}
                      className="flex-1 py-1 rounded-lg bg-white/[0.08] hover:bg-white/20 hover:text-white text-neutral-200 font-medium flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Use this</span>
                    </button>
                    {item.preview_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-vc-text-secondary border border-vc-border"
                        title="Preview Asset"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── MODE 2: DEDICATED B-ROLL STUDIO ── */}
      {activeTab === 'broll' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-view toggle (AI Suggestions vs Stock Search) */}
          <div className="p-2 border-b border-white/[0.08] bg-vc-canvas/60 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBrollSubView('suggestions')}
              className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition ${
                brollSubView === 'suggestions'
                  ? 'bg-white/[0.10] text-white border border-white/[0.12]'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              AI Suggestions
            </button>
            <button
              type="button"
              onClick={() => {
                setBrollSubView('search');
                loadStockMedia();
              }}
              className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition ${
                brollSubView === 'search'
                  ? 'bg-white/[0.10] text-white border border-white/[0.12]'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              Stock Search
            </button>
          </div>

          {brollSubView === 'suggestions' ? (
            <>
              {/* Controls Bar */}
              <div className="p-3 border-b border-white/[0.08] bg-vc-canvas/40 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-xs">Pacing Style</span>
                  <div className="flex items-center gap-1">
                    {(['MINIMAL', 'BALANCED', 'DYNAMIC'] as BrollStyle[]).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setBrollStyle(style)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                          brollStyle === style
                            ? 'bg-white/[0.15] text-white shadow-sm'
                            : 'bg-white/[0.04] text-vc-text-secondary hover:text-neutral-200'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDetectingBroll}
                  onClick={handleDetectBroll}
                  className="w-full py-2 rounded-full bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-1.5 transition shadow-md shadow-black/40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isDetectingBroll ? 'Detecting Moments...' : 'Detect & Plan B-Roll'}</span>
                </button>

                {brollMessage && (
                  <div className="text-[10px] p-2 rounded-lg bg-white/[0.08] text-white">
                    {brollMessage}
                  </div>
                )}
              </div>

              {/* Opportunities / Suggestions List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {!brollPlan || brollPlan.suggestions.length === 0 ? (
                  <div className="py-10 text-center text-vc-text-muted flex flex-col items-center gap-2">
                    <Sparkles className="w-8 h-8 text-neutral-600" />
                    <p className="font-semibold text-vc-text-secondary text-xs">No B-Roll Plan Generated Yet</p>
                    <p className="text-[11px] max-w-[240px] text-vc-text-secondary leading-relaxed">
                      Click "Detect & Plan B-Roll" to let VireoClip analyze speech pacing, scene cuts, and topic changes automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-1">
                      <span className="font-medium text-vc-text-secondary text-[11px]">
                        {brollPlan.suggestions.length} Suggested Slots
                      </span>
                      <button
                        type="button"
                        disabled={isApplyingBroll}
                        onClick={() => handleApplyBrollPlan()}
                        className="text-[11px] font-medium text-vc-text-secondary hover:text-white"
                      >
                        {isApplyingBroll ? 'Applying...' : 'Apply All'}
                      </button>
                    </div>

                    {brollPlan.suggestions.map((sug, idx) => {
                      const opp = sug.opportunity;
                      const asset = sug.selected_asset;

                      return (
                        <div
                          key={sug.id || idx}
                          className="p-2.5 rounded-xl bg-vc-canvas transition flex flex-col gap-2 shadow-sm"
                        >
                          {/* Interval & Concept Header */}
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-vc-text-secondary font-semibold text-xs">
                              {opp
                                ? `${opp.start_time.toFixed(1)}s – ${opp.end_time.toFixed(1)}s`
                                : `${sug.suggested_timeline_start.toFixed(1)}s – ${sug.suggested_timeline_end.toFixed(1)}s`}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                              {sug.relevance_score}% Match
                            </span>
                          </div>

                          <div className="text-[11px] font-medium text-white truncate">
                            "{opp?.concept || asset?.title || 'Visual Context'}"
                          </div>

                          <p className="text-[10px] text-vc-text-secondary leading-relaxed">
                            {opp?.reason || sug.explanation.summary}
                          </p>

                          {/* Candidate Asset Info */}
                          {asset && (
                            <div className="p-1.5 rounded-lg bg-white/[0.04] flex items-center justify-between text-[10px]">
                              <span className="truncate max-w-[160px] text-vc-text-secondary">{asset.title}</span>
                              <span className="text-vc-text-secondary font-mono">
                                {asset.duration ? `${asset.duration.toFixed(1)}s` : asset.aspect_ratio || '9:16'}
                              </span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              disabled={isApplyingBroll || sug.status === 'applied'}
                              onClick={() => handleApplyBrollPlan(sug.id)}
                              className={`flex-1 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition text-xs ${
                                sug.status === 'applied'
                                  ? 'bg-neutral-800 text-vc-text-secondary cursor-default'
                                  : 'bg-white/[0.10] text-white border border-white/[0.12] hover:bg-white/15'
                              }`}
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>{sug.status === 'applied' ? 'Applied' : 'Use this'}</span>
                            </button>
                            {asset?.preview_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewItem(asset)}
                                className="px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-vc-text-secondary border border-vc-border"
                                title="Preview Asset"
                              >
                                <Play className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </>
          ) : (
            /* Stock Search View */
            <div className="flex-1 flex flex-col overflow-hidden p-2.5 space-y-2">
              <form onSubmit={handleStockSearchSubmit} className="relative">
                <input
                  type="text"
                  placeholder="Search stock footage..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  className="w-full bg-vc-canvas border border-vc-border rounded-lg pl-7 pr-3 py-1.5 text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 text-xs"
                />
                <Search className="w-3.5 h-3.5 text-vc-text-secondary absolute left-2 top-2.5" />
              </form>

              {/* Provider Notices when keys are missing */}
              {stockCap?.status === 'NOT_CONFIGURED' && (
                <div className="p-3.5 rounded-xl bg-vc-canvas text-vc-text-secondary flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-400 font-medium">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Stock Provider Not Configured</span>
                  </div>
                  <p className="text-[11px] text-vc-text-secondary leading-relaxed">
                    External stock video and image search requires an active provider key. Configure{' '}
                    <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">PEXELS_API_KEY</code> or{' '}
                    <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">PIXABAY_API_KEY</code> in your environment.
                  </p>
                  <div className="text-[10px] text-vc-text-secondary bg-white/[0.03] p-2 rounded-lg ">
                    Real project source footage, clips, and local uploads remain fully available in the Media Library.
                  </div>
                </div>
              )}

              {genCap?.status === 'NOT_CONFIGURED' && (
                <div className="p-3.5 rounded-xl bg-vc-canvas text-vc-text-secondary flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-400 font-medium">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>AI Generation Not Configured</span>
                  </div>
                  <p className="text-[11px] text-vc-text-secondary leading-relaxed">
                    AI Text-to-Video generation is disabled because no generation provider is configured. Configure{' '}
                    <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">AI_MEDIA_GEN_API_KEY</code> to enable generative assets.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-vc-text-secondary">
                <span>Placement at playhead: {currentTime.toFixed(1)}s</span>
                <button
                  type="button"
                  onClick={loadStockMedia}
                  className="hover:text-white flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3 text-vc-text-secondary" />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingStock && (
                <div className="py-8 text-center text-vc-text-muted flex flex-col items-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-vc-text-secondary" />
                  <span>Searching stock footage...</span>
                </div>
              )}

              {!loadingStock && stockItems.length === 0 && (
                <div className="py-10 text-center text-vc-text-muted flex flex-col items-center gap-1.5">
                  <Film className="w-6 h-6 text-neutral-600" />
                  <p className="font-medium text-vc-text-secondary">No stock footage found</p>
                  <p className="text-[11px]">Search above to find B-roll to place at the playhead.</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2">
                {!loadingStock &&
                  stockItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-vc-canvas transition flex flex-col gap-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white truncate max-w-[180px]">{item.title}</span>
                        <span className="text-[10px] text-vc-text-secondary font-mono">
                          {item.duration ? `${item.duration.toFixed(1)}s` : item.aspect_ratio || '9:16'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInsertDirectAsset(item)}
                          className="flex-1 py-1 rounded-lg bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai font-medium flex items-center justify-center gap-1 transition text-xs shadow-sm"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Place at {currentTime.toFixed(1)}s</span>
                        </button>
                        {item.preview_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-vc-text-secondary border border-vc-border"
                            title="Preview Video"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Asset Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 glass-scrim glass-scrim-deep z-50 flex items-center justify-center p-4">
          <div className="glass-float rounded-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
              <span className="font-semibold text-white truncate text-xs">{previewItem.title}</span>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-vc-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="aspect-[9/16] bg-black flex items-center justify-center max-h-[420px] overflow-hidden">
              {previewItem.media_type === 'IMAGE' ? (
                <img
                  src={previewItem.preview_url}
                  alt={previewItem.title}
                  className="w-full h-full object-contain"
                />
              ) : previewItem.media_type === 'AUDIO' ? (
                <div className="p-6 flex flex-col items-center justify-center gap-4 text-center">
                  <Music className="w-12 h-12 text-vc-text-secondary animate-pulse" />
                  <span className="text-white text-xs font-medium truncate max-w-[240px]">{previewItem.title}</span>
                  <audio
                    src={previewItem.source_url || previewItem.preview_url}
                    controls
                    autoPlay
                    className="w-full"
                  />
                </div>
              ) : (
                <video
                  src={previewItem.source_url || previewItem.preview_url}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="p-3 flex items-center justify-between bg-vc-canvas">
              <div className="text-[10px] text-vc-text-secondary">
                {previewItem.license_type || 'User Owned'} · {previewItem.aspect_ratio || '9:16'}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleInsertDirectAsset(previewItem);
                  setPreviewItem(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai font-medium flex items-center gap-1 shadow-md shadow-black/50 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert into Timeline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
