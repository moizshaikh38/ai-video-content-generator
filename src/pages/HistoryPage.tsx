import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BTN_PILL_BRAND, BTN_PILL_DESTRUCTIVE, BTN_PILL_SECONDARY } from '../lib/buttonStyles';
import {
  Trash2,
  ArrowUpRight,
  Video,
  Search,
  Plus,
  FolderOpen,
  CheckCircle2,
  Clock3,
  Play,
  Download,
  Film,
  Scissors,
  X,
  ExternalLink,
  Flame,
} from 'lucide-react';
import { projectPath } from '../lib/projectUrls';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { clipRenderService } from '../services/clipRenderService';
import { useAuth } from '../context/AuthContext';
import { Project, RenderedClip } from '../types';
import { ProjectThumbImage } from '../components/ProjectThumbImage';
import { ClipThumbImage } from '../components/ClipThumbImage';
import { triggerBrowserDownload } from '../utils/downloadUtils';

const statusOf = (p: Project) => p.video_status || p.status;

interface HistoryPageProps {
  initialTab?: 'clips' | 'projects';
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ initialTab }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab: 'clips' (Media Library) vs 'projects' (Project History)
  const queryTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'clips' | 'projects'>(() => {
    if (initialTab === 'clips' || queryTab === 'clips') return 'clips';
    if (initialTab === 'projects' || queryTab === 'projects') return 'projects';
    return initialTab || 'clips';
  });

  useEffect(() => {
    if (queryTab === 'clips' || queryTab === 'projects') {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  const switchTab = (tab: 'clips' | 'projects') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const queryText = searchParams.get('q') ?? '';
  const [search, setSearch] = useState(queryText);
  // Header search hands the query over via ?q=
  useEffect(() => {
    setSearch(queryText);
  }, [queryText]);
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('newest');

  // Media Library (Clips) state
  const [clips, setClips] = useState<(RenderedClip & { projectTitle?: string })[]>([]);
  const [isClipsLoading, setIsClipsLoading] = useState(true);
  const [clipSearch, setClipSearch] = useState('');
  const [aspectFilter, setAspectFilter] = useState<'all' | '9:16' | '1:1' | '16:9'>('all');
  const [activePreviewClip, setActivePreviewClip] = useState<RenderedClip | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);

  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const openDelete = (project: Project) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setProjectToDelete(project);
  };
  const closeDelete = () => {
    setProjectToDelete(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  };
  const hasLoadedSuccessfully = useRef(false);

  const loadProjectsAndClips = async () => {
    if (!user) return;
    setIsLoading(true);
    setIsClipsLoading(true);
    setErrorMsg('');
    try {
      let data = await projectService.fetchProjects(user.id);

      // Auto-clean any failed projects so they don't clutter the history
      const failed = data.filter((p) => ['failed', 'error'].includes(statusOf(p)));
      if (failed.length > 0) {
        failed.forEach((fp) => {
          projectService.deleteProject(fp.id).catch((err) => console.warn('Auto cleanup failed project:', fp.id, err));
        });
        data = data.filter((p) => !['failed', 'error'].includes(statusOf(p)));
      }

      setProjects(data);
      hasLoadedSuccessfully.current = true;

      // Fetch clips for all completed projects
      const completed = data.filter((p) => ['completed', 'complete', 'transcribed'].includes(statusOf(p)));
      const clipResults = await Promise.allSettled(
        completed.map(async (p) => {
          const projectClips = await clipRenderService.getProjectClips(p.id);
          return projectClips.map((c) => ({ ...c, projectTitle: p.title }));
        })
      );

      const allClips: (RenderedClip & { projectTitle?: string })[] = [];
      clipResults.forEach((res) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          allClips.push(...res.value);
        }
      });

      // Sort clips by created_at DESC or virality score
      allClips.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setClips(allClips);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to retrieve your projects.');
    } finally {
      setIsLoading(false);
      setIsClipsLoading(false);
    }
  };

  useEffect(() => {
    loadProjectsAndClips();
    const update = () => {
      if (hasLoadedSuccessfully.current) {
        setProjects(projectService.getProjects());
      }
    };
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  useEffect(() => {
    if (projectToDelete) cancelRef.current?.focus();
  }, [projectToDelete]);

  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await projectService.deleteProject(id);
      setProjects(projectService.getProjects());
      setClips((prev) => prev.filter((c) => c.project_id !== id));
      closeDelete();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (clip: RenderedClip) => {
    setDownloadingClipId(clip.id);
    try {
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(clip.id);
      await triggerBrowserDownload(signedUrl, filename || `clip-${clip.id.slice(0, 8)}.mp4`);
    } catch (err: any) {
      alert(err.message || 'Failed to download clip.');
    } finally {
      setDownloadingClipId(null);
    }
  };

  const handleOpenPreview = async (clip: RenderedClip) => {
    setActivePreviewClip(clip);
    setPreviewSignedUrl(null);
    try {
      const url = await clipRenderService.getPreviewUrl(clip.id);
      setPreviewSignedUrl(url);
    } catch {
      setPreviewSignedUrl(clip.thumbnail_url || null);
    }
  };

  const filteredProjects = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) &&
            (status === 'all' ||
              (status === 'completed'
                ? ['completed', 'complete', 'transcribed'].includes(statusOf(p))
                : status === 'processing'
                ? ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))
                : ['failed', 'error'].includes(statusOf(p)))) &&
            (source === 'all' || p.source_type === source)
        )
        .sort((a, b) =>
          sort === 'newest'
            ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [projects, search, status, source, sort]
  );

  const filteredClips = useMemo(() => {
    return clips.filter((c) => {
      const matchesSearch =
        !clipSearch.trim() ||
        (c.title || '').toLowerCase().includes(clipSearch.toLowerCase()) ||
        (c.projectTitle || '').toLowerCase().includes(clipSearch.toLowerCase());
      const matchesAspect = aspectFilter === 'all' || c.aspect_ratio === aspectFilter;
      return matchesSearch && matchesAspect;
    });
  }, [clips, clipSearch, aspectFilter]);

  const summary = [
    { label: 'Total Clips', value: hasLoadedSuccessfully.current ? clips.length : '-', icon: Film },
    { label: 'All Projects', value: hasLoadedSuccessfully.current ? projects.length : '-', icon: FolderOpen },
    {
      label: 'Completed',
      value: hasLoadedSuccessfully.current
        ? projects.filter((p) => ['completed', 'complete', 'transcribed'].includes(statusOf(p))).length
        : '-',
      icon: CheckCircle2,
    },
    {
      label: 'In Progress',
      value: hasLoadedSuccessfully.current
        ? projects.filter((p) => ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))).length
        : '-',
      icon: Clock3,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-['Sora',sans-serif] text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {activeTab === 'clips' ? 'Media Library' : 'Project History'}
          </h1>
          <p className="mt-1 text-sm text-vc-text-secondary">
            {activeTab === 'clips'
              ? 'Browse, preview, search, and export all generated AI clips and rendered vertical videos.'
              : 'View and manage all your source videos and batch clipping pipelines.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/projects/new"
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold cursor-pointer ${BTN_PILL_BRAND}`}
          >
            <Plus className="size-4" />
            New Clip Project
          </Link>
        </div>
      </div>

      {/* Primary Tab Navigation Switcher */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-px">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => switchTab('clips')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'clips'
                ? 'border-violet-500 text-white shadow-[0_4px_12px_rgba(139,92,246,0.25)]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Film className="size-4 text-violet-400" />
            <span>Clips &amp; Rendered Media</span>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs font-mono font-normal text-zinc-300">
              {clips.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('projects')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'projects'
                ? 'border-violet-500 text-white shadow-[0_4px_12px_rgba(139,92,246,0.25)]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderOpen className="size-4 text-violet-400" />
            <span>Source Projects</span>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs font-mono font-normal text-zinc-300">
              {projects.length}
            </span>
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-vc-surface1 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-vc-text-secondary">
              <s.icon className="size-3.5 text-vc-text-muted" />
              {s.label}
            </p>
            <p
              className={`mt-2.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${
                s.value === '-' ? 'text-vc-text-muted' : 'text-vc-text-primary'
              }`}
            >
              {s.value === '-' ? '—' : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* TAB 1: MEDIA LIBRARY (CLIPS) */}
      {activeTab === 'clips' && (
        <section className="space-y-5">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl bg-vc-surface1/90 p-3.5 shadow-xl">
            <div className="relative flex-1">
              <Search className="size-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={clipSearch}
                onChange={(e) => setClipSearch(e.target.value)}
                placeholder="Search clips by title, hook, or project name..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center">
              {(['all', '9:16', '1:1', '16:9'] as const).map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => setAspectFilter(aspect)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    aspectFilter === aspect
                      ? 'bg-violet-600/25 border-violet-500/50 text-white shadow-sm'
                      : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white'
                  }`}
                >
                  {aspect === 'all' ? 'All Formats' : aspect}
                </button>
              ))}
            </div>
          </div>

          {/* Clips Content Area */}
          {isClipsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="aspect-[9/14] rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : filteredClips.length === 0 ? (
            <div className="rounded-2xl bg-vc-surface1/80 p-14 text-center">
              <Film className="mx-auto size-10 text-zinc-500" />
              <h3 className="mt-3 font-semibold text-lg text-white font-['Sora',sans-serif]">
                {clips.length ? 'No matching clips found' : 'No clips rendered yet'}
              </h3>
              <p className="mt-1 text-sm text-vc-text-secondary max-w-sm mx-auto">
                {clips.length
                  ? 'Try adjusting your search terms or format filters.'
                  : 'Open any project to analyze video moments and generate high-retention 9:16 clips.'}
              </p>
              {!clips.length && (
                <div className="mt-5">
                  <Link
                    to="/projects/new"
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold ${BTN_PILL_BRAND}`}
                  >
                    <Plus className="size-4" />
                    Create Your First Clip
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredClips.map((clip) => {
                const durationSec = Math.round(clip.duration_seconds || (clip.end_seconds - clip.start_seconds) || 30);
                // Show the internal AI ranking only when the clip actually has one —
                // never fabricate a score for clips that were not ranked.
                const engagementScore = typeof (clip as any).engagement_score === 'number' ? (clip as any).engagement_score : null;

                return (
                  <div
                    key={clip.id}
                    className="group relative rounded-2xl border border-white/[0.08] mv-cv-auto bg-vc-surface1 overflow-hidden flex flex-col justify-between shadow-lg hover:border-violet-500/40 hover:shadow-violet-900/20 transition-all duration-300"
                  >
                    {/* Visual Media Poster */}
                    <div
                      onClick={() => handleOpenPreview(clip)}
                      className="relative aspect-[9/12] w-full bg-black cursor-pointer overflow-hidden flex items-center justify-center"
                    >
                      <ClipThumbImage
                        clip={clip}
                        alt={clip.title || 'Clip thumbnail'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        fallback={
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-white/40">
                            <Film className="size-8 text-violet-400/60 mb-2" />
                            <span className="text-[11px] font-mono">9:16 Vertical</span>
                          </div>
                        }
                      />

                      {/* Top badges: AI rank (when scored) & duration */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-none">
                        {engagementScore !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 shadow">
                            <Flame className="size-3 text-emerald-400" />
                            {engagementScore} AI Rank
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-mono font-semibold text-white/60 shadow">
                            Unranked
                          </span>
                        )}

                        <span className="rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono font-semibold text-white/90 shadow">
                          {durationSec}s
                        </span>
                      </div>

                      {/* Hover play pill */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="size-12 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                          <Play className="size-5 fill-white ml-0.5" />
                        </span>
                      </div>
                    </div>

                    {/* Clip Meta Info */}
                    <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-violet-300 transition-colors">
                          {clip.title || 'Untitled Clip'}
                        </h4>
                        {clip.projectTitle && (
                          <p className="text-[11px] text-zinc-400 truncate mt-1 flex items-center gap-1 font-mono">
                            <Video className="size-3 text-zinc-500 shrink-0" />
                            {clip.projectTitle}
                          </p>
                        )}
                      </div>

                      {/* Action Bar */}
                      <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-1.5">
                        <Link
                          to={`/clips/${clip.id}/edit`}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] hover:text-white text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all cursor-pointer"
                        >
                          <Scissors className="size-3.5" />
                          <span>Studio</span>
                        </Link>

                        <button
                          type="button"
                          disabled={downloadingClipId === clip.id}
                          onClick={() => handleDownload(clip)}
                          title="Download Clip MP4"
                          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Download className="size-3.5" />
                        </button>

                        <Link
                          to={projectPath({ id: clip.project_id })}
                          title="Open Parent Project"
                          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SOURCE PROJECTS */}
      {activeTab === 'projects' && (
        <section className="rounded-2xl border border-white/[0.08] bg-vc-surface1/90 shadow-xl overflow-hidden backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter projects..."
                  className="h-10 w-52 rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/60"
                />
              </div>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-vc-surface2 px-3 text-xs sm:text-sm text-zinc-200 focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
              </select>

              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-vc-surface2 px-3 text-xs sm:text-sm text-zinc-200 focus:outline-none"
              >
                <option value="all">All sources</option>
                <option value="upload">Upload</option>
                <option value="url">URL</option>
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-vc-surface2 px-3 text-xs sm:text-sm text-zinc-200 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>

            {(search || status !== 'all' || source !== 'all' || sort !== 'newest') && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setSource('all');
                  setSort('newest');
                }}
                className="h-10 px-3 text-xs font-semibold text-violet-400 hover:text-white cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>

          {errorMsg && (
            <p role="alert" className="m-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
              {errorMsg}{' '}
              <button onClick={loadProjectsAndClips} className="font-semibold underline hover:text-white">
                Retry
              </button>
            </p>
          )}

          {isLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.06]" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-14 text-center">
              <Video className="mx-auto size-8 text-zinc-500" />
              <h3 className="mt-3 font-semibold text-white font-['Sora',sans-serif]">
                {projects.length ? 'No matching projects' : 'No projects yet'}
              </h3>
              <p className="mt-1 text-sm text-vc-text-secondary">
                {projects.length ? 'Try a different search or filter.' : 'Upload your first video to get started.'}
              </p>
              {!projects.length && (
                <Link
                  to="/projects/new"
                  className={`mt-4 inline-block px-4 py-2 text-sm font-semibold ${BTN_PILL_BRAND}`}
                >
                  New Project
                </Link>
              )}
            </div>
          ) : (
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.02] text-xs text-zinc-400 border-b border-white/[0.08]">
                  <tr>
                    <th className="px-5 py-4 font-semibold font-['Sora',sans-serif]">Project</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Source</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Status</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Created</th>
                    <th className="px-4 py-4 text-right font-semibold font-['Sora',sans-serif]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredProjects.map((p) => {
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="max-w-[340px] px-5 py-3.5">
                          <Link to={projectPath(p)} className="flex items-center gap-3.5 group">
                            <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0">
                              <ProjectThumbImage
                                project={p}
                                alt={p.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                fallback={
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-white/40">
                                  <Video className="size-4" />
                                </div>
                                }
                              />
                            </div>
                            <span className="block truncate font-semibold text-white group-hover:text-violet-300 transition-colors">
                              {p.title}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-400">{p.source_type === 'url' ? 'URL' : 'Upload'}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={statusOf(p)} />
                        </td>
                        <td className="px-4 py-3.5 text-zinc-400 font-mono text-xs">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={projectPath(p)}
                              aria-label={`Open ${p.title}`}
                              className="rounded-lg p-2 text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                              <ArrowUpRight className="size-4" />
                            </Link>
                            <button
                              onClick={() => openDelete(p)}
                              aria-label={`Delete ${p.title}`}
                              className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Video Preview Modal */}
      {activePreviewClip && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center glass-scrim glass-scrim-deep p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActivePreviewClip(null);
          }}
        >
          <div className="relative w-full max-w-lg rounded-3xl glass-float p-5 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-violet-400 font-bold block">
                  Clip Preview
                </span>
                <h3 className="text-base font-bold text-white truncate max-w-sm">
                  {activePreviewClip.title || 'Preview'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewClip(null)}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-[9/16] max-h-[65vh] w-full mx-auto rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
              {previewSignedUrl ? (
                <video
                  src={previewSignedUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400 space-y-2">
                  <Film className="size-8 text-violet-400 animate-pulse" />
                  <span className="text-xs">Loading video preview...</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
              <Link
                to={`/clips/${activePreviewClip.id}/edit`}
                onClick={() => setActivePreviewClip(null)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-xs font-bold text-white transition-all shadow"
              >
                <Scissors className="size-4" />
                <span>Open in Studio Editor</span>
              </Link>
              <button
                type="button"
                onClick={() => handleDownload(activePreviewClip)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all cursor-pointer"
              >
                <Download className="size-4" />
                <span>Download MP4</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Delete Modal */}
      {projectToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center glass-scrim p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDelete();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-md rounded-3xl glass-float p-7 text-white"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <Trash2 className="size-5" />
            </span>
            <h2 id="delete-title" className="mt-4 font-['Sora',sans-serif] text-xl font-bold text-white">
              Delete this project?
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              “{projectToDelete.title}” and its associated records will be permanently removed.
            </p>
            <div className="mt-7 flex justify-end gap-3">
              <button
                ref={cancelRef}
                onClick={closeDelete}
                className={`px-4 py-2 text-sm font-semibold cursor-pointer ${BTN_PILL_SECONDARY}`}
              >
                Cancel
              </button>
              <button
                ref={deleteRef}
                disabled={isDeleting}
                onClick={() => handleDelete(projectToDelete.id)}
                className={`px-4 py-2 text-sm font-semibold cursor-pointer ${BTN_PILL_DESTRUCTIVE}`}
              >
                {isDeleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
