import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Clock, Play } from 'lucide-react';
import { HomeClippingWorkflow } from '../components/dashboard/HomeClippingWorkflow';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { useCinematicScrollReveal } from '../hooks/useCinematicScrollReveal';
import { Project } from '../types';

const activeStatuses = [
  'uploading',
  'uploaded',
  'queued',
  'processing',
  'transcribing',
  'analyzing',
  'generating',
];
const completeStatuses = ['completed', 'complete', 'transcribed'];
const failedStatuses = ['failed', 'error'];

export function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (isNaN(diffInSeconds) || diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return diffInMinutes === 1 ? '1m ago' : `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return diffInHours === 1 ? '1h ago' : `${diffInHours}h ago`;
  if (diffInHours < 48) return 'Yesterday';
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getProgressInfo(status: string, numericProgress?: number | null): { stageText: string; isIndeterminate: boolean; percentValue: number | null } {
  if (typeof numericProgress === 'number' && !isNaN(numericProgress) && numericProgress >= 0 && numericProgress <= 100) {
    const rounded = Math.round(numericProgress);
    return {
      stageText: `${rounded}%`,
      isIndeterminate: false,
      percentValue: rounded,
    };
  }

  const s = status.toLowerCase();
  let stageName = 'Processing';
  if (s === 'uploading') stageName = 'Uploading video';
  else if (s === 'uploaded' || s === 'queued') stageName = 'Queued for AI';
  else if (s === 'processing' || s === 'transcribing') stageName = 'Transcribing speech';
  else if (s === 'analyzing' || s === 'generating') stageName = 'Finding viral clips';

  return {
    stageText: stageName,
    isIndeterminate: true,
    percentValue: null,
  };
}

export function getProjectThumbnail(p: Project): string | null {
  if ((p as any).thumbnail_url) return (p as any).thumbnail_url;
  if ((p as any).thumbnail) return (p as any).thumbnail;
  if ((p as any).cover_url) return (p as any).cover_url;
  if ((p as any).poster_url) return (p as any).poster_url;

  const url = p.source_url || (p as any).url || (p as any).source_path;
  if (url && typeof url === 'string') {
    // Regex covers:
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - https://www.youtube.com/shorts/VIDEO_ID
    // - https://www.youtube.com/embed/VIDEO_ID
    // - https://www.youtube.com/live/VIDEO_ID
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    if (ytMatch && ytMatch[1]) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
  }
  return null;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const recentProjectsRef = useRef<HTMLElement>(null);
  useCinematicScrollReveal(pageRef, { threshold: 0.08 });

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectTab, setProjectTab] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadProjects = async () => {
    if (!user) return;
    try {
      setError('');
      let data = await projectService.fetchProjects(user.id);

      // Auto-cleanup failed projects so they don't clutter recent projects
      const failed = data.filter((p) => failedStatuses.includes(getStatus(p)));
      if (failed.length > 0) {
        failed.forEach((fp) => {
          projectService.deleteProject(fp.id).catch((err) => {
            console.warn('Auto-deleted failed project:', fp.id, err);
          });
        });
        data = data.filter((p) => !failedStatuses.includes(getStatus(p)));
      }

      setProjects(data);
    } catch (err: any) {
      const msg = err?.message || '';
      if (!msg.toLowerCase().includes('token') && !msg.toLowerCase().includes('jwt')) {
        setError(msg || 'Unable to load projects.');
      } else {
        const cached = projectService.getProjects().filter((p) => !failedStatuses.includes(getStatus(p)));
        setProjects(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const update = () => setProjects(projectService.getProjects());
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  // Polling loop when any project is in an active processing status
  useEffect(() => {
    const hasActive = projects.some((p) => activeStatuses.includes(getStatus(p)));
    if (!hasActive || !user) return;
    const interval = setInterval(() => {
      loadProjects();
    }, 4000);
    return () => clearInterval(interval);
  }, [projects, user?.id]);

  const scrollToRecentProjects = () => {
    recentProjectsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getStatus = (p: Project) => p.video_status || p.status;

  const filteredProjects = projects.filter((p) => {
    const s = getStatus(p);
    let matchesTab = true;
    if (projectTab === 'processing') matchesTab = activeStatuses.includes(s);
    else if (projectTab === 'completed') matchesTab = completeStatuses.includes(s);
    else if (projectTab === 'failed') matchesTab = failedStatuses.includes(s);
    if (!matchesTab) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const titleMatch = (p.title || '').toLowerCase().includes(q);
      const genreMatch = (p.clip_preferences?.genre || '').toLowerCase().includes(q);
      return titleMatch || genreMatch;
    }
    return true;
  });

  const processingCount = projects.filter((p) => activeStatuses.includes(getStatus(p))).length;
  const completedCount = projects.filter((p) => completeStatuses.includes(getStatus(p))).length;
  const failedCount = projects.filter((p) => failedStatuses.includes(getStatus(p))).length;

  return (
    <div ref={pageRef} className="space-y-12 sm:space-y-16">
      {/* 1. MAIN HERO & COMPLETE VIDEO CLIPPING WORKFLOW */}
      <HomeClippingWorkflow
        existingProjects={projects}
        onRefreshProjects={loadProjects}
        onScrollToProjects={scrollToRecentProjects}
      />

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            onClick={loadProjects}
            className="font-semibold underline hover:text-white ml-3 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. RECENT PROJECTS SECTION */}
      <section ref={recentProjectsRef} aria-label="Recent projects" className="space-y-4 pt-4 sm:pt-6">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold font-['Sora',sans-serif] text-[#F4F6FB]">
            Recent projects
          </h2>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Quick Search Input */}
            <div className="relative">
              <Search className="size-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 text-xs rounded-full bg-white/[0.05] border border-white/[0.09] text-[#F4F6FB] placeholder:text-slate-500 focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 w-32 sm:w-44 transition-all"
              />
            </div>

            {/* Status Tabs with Live Counts */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs">
              <button
                type="button"
                onClick={() => setProjectTab('all')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'all'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                All ({projects.length})
              </button>
              <button
                type="button"
                onClick={() => setProjectTab('processing')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'processing'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                Processing ({processingCount})
              </button>
              <button
                type="button"
                onClick={() => setProjectTab('completed')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'completed'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                Completed ({completedCount})
              </button>
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setProjectTab('failed')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    projectTab === 'failed'
                      ? 'bg-rose-500/25 text-rose-200 font-semibold border border-rose-500/40'
                      : 'text-[#8E9AB4] hover:text-rose-300'
                  }`}
                >
                  Failed ({failedCount})
                </button>
              )}
            </div>

            <Link
              to="/history"
              className="text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-[#C4B5FD] transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
        </div>

        {/* Projects Grid or Honest Empty State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredProjects.slice(0, 8).map((p, idx) => {
              const statusStr = getStatus(p);
              const isComp = completeStatuses.includes(statusStr);
              const isProc = activeStatuses.includes(statusStr);
              const isFail = failedStatuses.includes(statusStr);
              const thumbUrl = getProjectThumbnail(p);
              const durationFormatted = formatDuration(p.duration_seconds);
              const genreBadge = p.clip_preferences?.genre;
              const { stageText, isIndeterminate, percentValue } = getProgressInfo(statusStr, (p as any).progress);

              const gradientClass =
                idx % 4 === 0
                  ? 'from-[#4C2FB8] to-[#0F1B2D]'
                  : idx % 4 === 1
                  ? 'from-[#0E6F86] to-[#0F1B2D]'
                  : idx % 4 === 2
                  ? 'from-[#2A3350] to-[#0F1B2D]'
                  : 'from-[#6B2B3A] to-[#0F1B2D]';

              return (
                <article
                  key={p.id}
                  className="vireo-dash-glass overflow-hidden rounded-2xl flex flex-col justify-between hover:border-[#8B5CF6]/50 hover:-translate-y-1 transition-all group"
                >
                  {/* Thumbnail / Header Area - Clickable to project */}
                  <Link
                    to={`/projects/${p.id}`}
                    aria-label={`Open project ${p.title || 'Untitled'}`}
                    className={`block h-[132px] p-2.5 relative flex items-end justify-between overflow-hidden cursor-pointer ${
                      !thumbUrl ? `bg-gradient-to-br ${gradientClass}` : 'bg-black'
                    }`}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={p.title || 'Project thumbnail'}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none overflow-hidden">
                        {/* High-tech audio waveform backdrop */}
                        <div className="flex items-center gap-1 opacity-25 mb-1">
                          {[30, 65, 45, 90, 75, 40, 85, 60, 95, 50, 70, 35, 80, 55, 40, 65].map((h, i) => (
                            <span
                              key={i}
                              style={{ height: `${h * 0.45}px` }}
                              className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400"
                            />
                          ))}
                        </div>
                        <div className="size-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 shadow-lg group-hover:scale-110 group-hover:bg-white/20 transition-all">
                          <Play className="size-4 ml-0.5 fill-white/80" />
                        </div>
                      </div>
                    )}

                    {/* Dark gradient overlay for badge readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

                    {/* Top Overlay Badges: Duration & Genre */}
                    <div className="absolute top-2 inset-x-2.5 flex items-center justify-between z-10 pointer-events-none">
                      {durationFormatted ? (
                        <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-black/70 text-slate-200 border border-white/10 flex items-center gap-1 backdrop-blur-sm">
                          <Clock className="size-2.5 text-slate-400" />
                          <span>{durationFormatted}</span>
                        </span>
                      ) : <span />}

                      {genreBadge ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-violet-950/70 text-violet-200 border border-violet-500/30 backdrop-blur-sm truncate max-w-[110px]">
                          {genreBadge}
                        </span>
                      ) : null}
                    </div>

                    {/* Bottom Status Badge */}
                    <span
                      className={`relative z-10 text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md ${
                        isComp
                          ? 'bg-[#34D399]/20 text-[#6EE7B7] border border-[#34D399]/30'
                          : isProc
                          ? 'bg-[#22D3EE]/20 text-[#67E8F9] border border-[#22D3EE]/30 animate-pulse'
                          : isFail
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-white/10 text-[#C9D2E6] border border-white/15'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          isComp
                            ? 'bg-[#34D399]'
                            : isProc
                            ? 'bg-[#22D3EE]'
                            : isFail
                            ? 'bg-rose-400'
                            : 'bg-white/50'
                        }`}
                      />
                      <span className="capitalize">{statusStr}</span>
                    </span>

                    {/* Source / Format Badge */}
                    <span className="relative z-10 text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-black/60 text-[#C9D2E6] border border-white/10">
                      {p.source_type === 'url' ? 'URL' : 'MP4'}
                    </span>
                  </Link>

                  {/* Body Info */}
                  <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <Link
                        to={`/projects/${p.id}`}
                        className="font-semibold text-sm text-[#F4F6FB] truncate group-hover:text-white block hover:underline"
                      >
                        {p.title || 'Untitled Project'}
                      </Link>
                      <p className="text-[12px] text-[#8E9AB4] mt-1">
                        Updated {formatTimeAgo(p.updated_at || p.created_at)}
                      </p>
                    </div>

                    {/* Honest processing progress bar */}
                    {isProc && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-[#8E9AB4] mb-1 font-mono">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="size-1.5 rounded-full bg-[#22D3EE] animate-ping" />
                            {stageText}
                          </span>
                          {percentValue !== null && (
                            <span className="tabular-nums font-semibold text-white">{percentValue}%</span>
                          )}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                          {isIndeterminate ? (
                            <div className="h-full w-full bg-gradient-to-r from-[#8B5CF6] via-[#22D3EE] to-[#8B5CF6] bg-[length:200%_100%] animate-pulse rounded-full" />
                          ) : (
                            <div
                              className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] rounded-full transition-all duration-300"
                              style={{ width: `${percentValue}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <Link
                      to={`/projects/${p.id}`}
                      className="mt-3.5 inline-flex items-center justify-center h-9 w-full rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-xs font-semibold text-[#F4F6FB] transition-all cursor-pointer"
                    >
                      {isComp ? 'Open project' : isProc ? 'View status' : isFail ? 'View error & retry' : 'Continue'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : projects.length > 0 ? (
          <div className="vireo-dash-glass p-8 text-center rounded-2xl border border-white/10">
            <p className="text-sm text-[#8E9AB4]">
              No {projectTab} projects match "{searchQuery}".
            </p>
            <button
              type="button"
              onClick={() => {
                setProjectTab('all');
                setSearchQuery('');
              }}
              className="mt-3 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs text-white font-medium cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};
export default DashboardPage;
