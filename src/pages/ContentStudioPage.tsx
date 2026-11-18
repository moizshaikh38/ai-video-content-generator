import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowLeft,
  Plus,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { Button } from '../components/Button';
import { ContentPack } from '../types';
import { contentPackService, GenerateContentPackParams } from '../services/contentPackService';
import { ContentPackWorkspace } from '../components/contentPack/ContentPackWorkspace';
import { SourcePicker } from '../components/contentStudio/SourcePicker';
import { RecentContentPacks } from '../components/contentStudio/RecentContentPacks';

export interface ContentStudioPageProps {
  initialPackId?: string;
}

export const ContentStudioPage: React.FC<ContentStudioPageProps> = ({ initialPackId }) => {
  const { id: routePackId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const effectiveInitialPackId = routePackId || initialPackId;

  // Navigation / View State: 'create' | 'workspace'
  const [viewMode, setViewMode] = useState<'create' | 'workspace'>(effectiveInitialPackId ? 'workspace' : 'create');

  // Active Content Pack
  const [activePack, setActivePack] = useState<ContentPack | null>(null);
  const [activePackId, setActivePackId] = useState<string | undefined>(effectiveInitialPackId);

  // Sync route param when id changes or browser navigates back/forward
  useEffect(() => {
    if (routePackId) {
      setActivePackId(routePackId);
      setViewMode('workspace');
    } else if (!initialPackId) {
      // At /studio base route
      setActivePackId(undefined);
      setActivePack(null);
      setViewMode('create');
    }
  }, [routePackId, initialPackId]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Counter key to intentionally reset SourcePicker only when explicit fresh creation is requested
  const [sourcePickerResetKey, setSourcePickerResetKey] = useState<number>(0);

  // Recent packs list state
  const [recentPacks, setRecentPacks] = useState<ContentPack[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  // Phase 4B.4 Phase 3: Batch export & multi-selection state
  const [selectedPackIds, setSelectedPackIds] = useState<Set<string>>(new Set());
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load recent content packs
  const loadRecentPacks = useCallback(async () => {
    setIsLoadingRecent(true);
    setRecentError(null);
    try {
      const packs = await contentPackService.listRecentPacks(20);
      setRecentPacks(packs || []);
    } catch (err: any) {
      setRecentError(err.message || 'Failed to load recent content packs.');
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecentPacks();
  }, [loadRecentPacks]);

  // Handle generation submission from SourcePicker
  const handleGenerate = async (params: GenerateContentPackParams) => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const newPack = await contentPackService.generateContentPack(params);
      setActivePack(newPack);
      setActivePackId(newPack.id);
      setViewMode('workspace');
      if (routePackId !== newPack.id) {
        navigate(`/studio/${newPack.id}`, { replace: false });
      }
      // Refresh recent packs list in background
      loadRecentPacks();
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to generate Content Pack.');
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  // Open an existing pack
  const handleSelectPack = (pack: ContentPack) => {
    setActivePack(pack);
    setActivePackId(pack.id);
    setViewMode('workspace');
    if (routePackId !== pack.id) {
      navigate(`/studio/${pack.id}`);
    }
  };

  // Return to source selection (preserves form values)
  const handleBackToSources = () => {
    setViewMode('create');
    if (routePackId) {
      navigate('/studio');
    }
  };

  // Switch back to creator view and intentionally reset the form for a fresh workflow
  const handleStartNewPack = () => {
    setActivePack(null);
    setActivePackId(undefined);
    setSourcePickerResetKey((k) => k + 1);
    setViewMode('create');
    if (routePackId) {
      navigate('/studio');
    }
  };

  // Phase 4B.4 Phase 3: Selection & Batch Export Handlers
  const handleToggleSelectPack = (packId: string) => {
    setSelectedPackIds((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) {
        next.delete(packId);
      } else {
        if (next.size >= 25) {
          setExportFeedback({ message: 'Maximum 25 content packs can be selected for batch export.', type: 'error' });
          return prev;
        }
        next.add(packId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const ids = recentPacks.slice(0, 25).map((p) => p.id);
    setSelectedPackIds(new Set(ids));
    if (recentPacks.length > 25) {
      setExportFeedback({ message: 'Selected top 25 packs (batch export limit).', type: 'success' });
    }
  };

  const handleClearSelection = () => {
    setSelectedPackIds(new Set());
  };

  const handleBatchExport = async (format: 'json' | 'markdown' | 'csv') => {
    if (selectedPackIds.size === 0 || isBatchExporting) return;
    setIsBatchExporting(true);
    setExportFeedback(null);
    try {
      const result = await contentPackService.batchExportPacks(Array.from(selectedPackIds), format);
      const missingMsg = result.missingIds.length > 0 ? ` (${result.missingIds.length} packs unavailable)` : '';
      setExportFeedback({
        message: `Successfully exported ${result.exportedCount} content ${result.exportedCount === 1 ? 'pack' : 'packs'}${missingMsg}.`,
        type: 'success',
      });
    } catch (err: any) {
      setExportFeedback({
        message: err.message || 'Failed to export selected packs.',
        type: 'error',
      });
    } finally {
      setIsBatchExporting(false);
    }
  };

  // Callback when workspace updates pack (approves, regenerates, translates)
  const handlePackUpdated = (updated: ContentPack) => {
    setActivePack(updated);
    setRecentPacks((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 text-violet-400 font-semibold text-xs tracking-wider uppercase">
            <Sparkles className="size-4 text-violet-400" />
            <span>VireoClip Intelligence · AI Content Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mt-1">
            Content Studio
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Transform any video clip, full project, uploaded file, or raw transcript into a multi-platform publishing package
            with source-grounded titles, hooks, social copy, CTAs, hashtags, and visual direction.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {viewMode === 'workspace' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartNewPack}
              className="text-xs border-violet-500/40 text-violet-300 hover:bg-violet-500/10"
            >
              <Plus className="size-3.5 mr-1.5" />
              New Content Pack
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300">
              <Zap className="size-3.5 text-violet-400" />
              <span>Free Feature (0 Credits)</span>
            </div>
          )}
        </div>
      </div>

      {generationError && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{generationError}</span>
        </div>
      )}

      {exportFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
            exportFeedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-destructive/10 border border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{exportFeedback.message}</span>
          </div>
          <button
            onClick={() => setExportFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {/* Workspace View - conditionally rendered only when active */}
      {viewMode === 'workspace' && activePackId && (
        <div className="space-y-4">
          {/* Back Bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToSources}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Content Studio Sources</span>
            </button>
          </div>

          {/* Reused ContentPackWorkspace */}
          <ContentPackWorkspace
            initialPackId={activePackId}
            initialPack={activePack}
            projectId={activePack?.project_id}
            clipId={activePack?.clip_id}
            clipTitle={activePack?.source?.transcript_source || (activePack as any)?.title || 'Content Pack'}
            clipDurationSeconds={activePack?.source?.duration || 30}
            onClose={handleBackToSources}
            onPackUpdated={handlePackUpdated}
          />
        </div>
      )}

      {/* Creation / Source Selection View - kept mounted to preserve local form state, conditionally hidden when in workspace mode */}
      <div className={viewMode === 'workspace' && activePackId ? 'hidden' : 'space-y-8'}>
        {/* Section 1: Source Picker & Generator */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Plus className="size-4 text-violet-400" />
              <span>Create New Content Pack</span>
            </h2>
          </div>
          <SourcePicker
            key={sourcePickerResetKey}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        </section>

        {/* Section 2: Recent Content Packs */}
        <section className="space-y-3">
          <RecentContentPacks
            packs={recentPacks}
            isLoading={isLoadingRecent}
            error={recentError}
            onRefresh={loadRecentPacks}
            onSelectPack={handleSelectPack}
            activePackId={activePackId}
            selectedPackIds={selectedPackIds}
            onToggleSelectPack={handleToggleSelectPack}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onBatchExport={handleBatchExport}
            isBatchExporting={isBatchExporting}
          />
        </section>
      </div>
    </div>
  );
};

export default ContentStudioPage;
