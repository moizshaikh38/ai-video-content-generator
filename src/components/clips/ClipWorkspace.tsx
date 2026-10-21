import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Film,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  Check,
  Loader2,
  AlertCircle,
  Download,
  RefreshCw,
  Video,
  Sliders,
  Share2,
  Trash2,
  Search,
  Zap,
  Activity,
  X,
  Wand2,
  Layers,
  Flame,
} from 'lucide-react';

import { Button } from '../Button';
import { SpotlightCard } from '../react-bits/SpotlightCard';
import { ClipCandidate, ClipCandidateStatus, Transcript, RenderedClip, MomentSearchResult } from '../../types';
import { clipService } from '../../services/clipService';
import { clipRenderService } from '../../services/clipRenderService';
import { triggerBrowserDownload } from '../../utils/downloadUtils';
import { PublishModal } from '../PublishModal';
import { ContentPackWorkspace } from '../contentPack/ContentPackWorkspace';
import { WhyThisClipSection } from './WhyThisClipSection';

export interface ClipWorkspaceProps {
  projectId: string;
  transcript: Transcript | null;
  videoPreviewUrl: string | null;
}

export const ClipWorkspace: React.FC<ClipWorkspaceProps> = ({
  projectId,
  transcript,
  videoPreviewUrl,
}) => {
  // Navigation Tabs: 'suggestions' (AI Clip Candidates) vs 'my_clips' (Real Rendered MP4s)
  const [activeTab, setActiveTab] = useState<'suggestions' | 'my_clips'>('suggestions');

  // AI Suggestions state
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'selected'>('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Phase 16: Multimodal Moment Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMoments, setSearchMoments] = useState<MomentSearchResult[]>([]);

  // Rendered Clips state
  const [myClips, setMyClips] = useState<RenderedClip[]>([]);
  const [isCreatingClip, setIsCreatingClip] = useState<string | null>(null); // candidateId currently creating
  const [clipActionError, setClipActionError] = useState<string | null>(null);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [retryingClipId, setRetryingClipId] = useState<string | null>(null);
  const [publishingClip, setPublishingClip] = useState<RenderedClip | null>(null);
  const [contentPackClip, setContentPackClip] = useState<RenderedClip | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSearchMoments = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await clipService.findMoments(projectId, searchQuery.trim());
      setSearchMoments(results);
      if (results.length === 0) {
        setSearchError('No matching moments found for that query. Try broader keywords.');
      }
    } catch (err: any) {
      setSearchError(err.message || 'Failed to search video moments.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchMoments([]);
    setSearchError(null);
  };

  const handlePreviewMoment = (moment: MomentSearchResult) => {
    if (videoRef.current) {
      videoRef.current.currentTime = moment.start_seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Load existing clip candidates and rendered clips on mount
  const refreshClipsData = async () => {
    try {
      const [candData, clipsData] = await Promise.all([
        clipService.getClipCandidates(projectId).catch(() => []),
        clipRenderService.getProjectClips(projectId).catch(() => []),
      ]);

      setCandidates(candData);
      const initialFiltered = candData.filter((c) => c.status !== 'dismissed');
      if (initialFiltered.length > 0 && !selectedCandidateId) {
        setSelectedCandidateId(initialFiltered[0].id);
      }

      setMyClips(clipsData);
    } catch (err) {
      // Ignored for initial fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshClipsData();
  }, [projectId]);

  // Polling loop for active rendering jobs in 'my_clips'
  useEffect(() => {
    const hasActiveRenders = myClips.some((c) =>
      ['draft', 'queued', 'rendering', 'uploading'].includes(c.render_status)
    );

    if (!hasActiveRenders) return;

    const interval = setInterval(async () => {
      try {
        const updated = await clipRenderService.getProjectClips(projectId);
        setMyClips(updated);
      } catch (e) {
        // Polling failure ignored
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [projectId, myClips]);

  // Handle Find Clips analysis call (triggers POST /api/projects/:id/analyze-clips ONCE)
  const handleFindClips = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await clipService.analyzeClips(projectId);
      setCandidates(response.candidates);
      const initialFiltered = (response.candidates || []).filter((c: any) => c.status !== 'dismissed');
      if (initialFiltered.length > 0) {
        setSelectedCandidateId(initialFiltered[0].id);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to analyze video clips.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle candidate status update (suggested | selected | dismissed)
  const handleUpdateStatus = async (candidateId: string, newStatus: ClipCandidateStatus) => {
    try {
      const updated = await clipService.updateClipCandidateStatus(projectId, candidateId, newStatus);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: updated.status } : c))
      );
    } catch (err: any) {
      console.error('Failed to update clip status:', err);
    }
  };

  // Create real 9:16 clip from candidate
  const handleCreateClip = async (candidateId: string) => {
    if (isCreatingClip) return;
    setIsCreatingClip(candidateId);
    setClipActionError(null);

    try {
      const res = await clipRenderService.createClipFromCandidate(projectId, candidateId, '9:16');
      // Mark candidate selected in local UI
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: 'selected' } : c))
      );
      // Prepend to myClips
      setMyClips((prev) => [res.clip, ...prev.filter((c) => c.id !== res.clip.id)]);
      // Automatically switch to My Clips tab so user sees active rendering
      setActiveTab('my_clips');
    } catch (err: any) {
      setClipActionError(err.message || 'Failed to create clip.');
    } finally {
      setIsCreatingClip(null);
    }
  };

  // Retry rendering for a failed clip
  const handleRetryRender = async (clipId: string) => {
    if (retryingClipId) return;
    setRetryingClipId(clipId);
    setClipActionError(null);

    try {
      await clipRenderService.renderClip(clipId);
      // Immediately refresh clips
      const updated = await clipRenderService.getProjectClips(projectId);
      setMyClips(updated);
    } catch (err: any) {
      setClipActionError(err.message || 'Failed to retry render.');
    } finally {
      setRetryingClipId(null);
    }
  };

  // Delete clip
  const handleDeleteClip = async (clipId: string) => {
    if (!window.confirm('Are you sure you want to delete this rendered clip?')) return;
    try {
      await clipRenderService.deleteClip(clipId);
      setMyClips((prev) => prev.filter((c) => c.id !== clipId));
      if (previewClipId === clipId) {
        setPreviewClipId(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete clip.');
    }
  };

  // Preview clip (obtain signed URL)
  const handleTogglePreview = async (clipId: string) => {
    if (previewClipId === clipId) {
      setPreviewClipId(null);
      return;
    }

    try {
      if (!previewUrls[clipId]) {
        const url = await clipRenderService.getPreviewUrl(clipId);
        setPreviewUrls((prev) => ({ ...prev, [clipId]: url }));
      }
      setPreviewClipId(clipId);
    } catch (err: any) {
      alert(err.message || 'Failed to load preview URL.');
    }
  };

  // Download clip (obtain signed download URL)
  const handleDownloadClip = async (clipId: string) => {
    setIsDownloading(clipId);
    try {
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(clipId);
      await triggerBrowserDownload(signedUrl, filename || `clip-${clipId.slice(0, 8)}.mp4`);
    } catch (err: any) {
      alert(err.message || 'Failed to download clip.');
    } finally {
      setIsDownloading(null);
    }
  };

  // Format seconds into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredCandidates = useMemo<ClipCandidate[]>(() => {
    return candidates.filter((c: ClipCandidate) => {
      if (filter === 'selected') return c.status === 'selected';
      return c.status !== 'dismissed';
    });
  }, [candidates, filter]);

  const activeCandidate = useMemo<ClipCandidate | undefined>(() => {
    return (
      filteredCandidates.find((c: ClipCandidate) => c.id === selectedCandidateId) ||
      filteredCandidates[0] ||
      candidates[0]
    );
  }, [filteredCandidates, selectedCandidateId, candidates]);

  // Keep selectedCandidateId pointing to an available candidate in filteredCandidates
  useEffect(() => {
    if (filteredCandidates.length > 0) {
      const match = filteredCandidates.some((c: ClipCandidate) => c.id === selectedCandidateId);
      if (!match) {
        setSelectedCandidateId(filteredCandidates[0].id);
      }
    }
  }, [filteredCandidates, selectedCandidateId]);

  // Sync video seek position when selected candidate changes
  useEffect(() => {
    if (videoRef.current && activeCandidate) {
      videoRef.current.currentTime = activeCandidate.start_seconds;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [activeCandidate?.id]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    if (activeCandidate && curr >= activeCandidate.end_seconds) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = activeCandidate.start_seconds;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (
        activeCandidate &&
        (videoRef.current.currentTime < activeCandidate.start_seconds ||
          videoRef.current.currentTime >= activeCandidate.end_seconds)
      ) {
        videoRef.current.currentTime = activeCandidate.start_seconds;
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const selectedCount = candidates.filter((c) => c.status === 'selected').length;

  // 1. Initial Loading State
  if (isLoading) {
    return (
      <div className="card-soft p-12 text-center space-y-4">
        <Loader2 className="size-8 text-clay animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Loading clips workspace...</p>
      </div>
    );
  }

  // 2. AI Analysis In-Progress State
  if (isAnalyzing) {
    return (
      <SpotlightCard
        spotlightColor="rgba(192, 98, 62, 0.14)"
        className="p-8 md:p-12 text-center border-clay/30 bg-card/90 space-y-6 animate-in fade-in duration-300"
      >
        <div className="size-14 rounded-2xl bg-clay/15 text-clay mx-auto flex items-center justify-center animate-pulse">
          <Film className="size-7" />
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-xl font-semibold font-display text-foreground">
            Finding your strongest moments...
          </h3>
          <p className="text-sm text-muted-foreground">
            VireoClip is analyzing your video transcript to detect high-engagement standalone clips.
          </p>
        </div>

        <div className="max-w-md mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          {[
            'Reading transcript',
            'Evaluating hooks',
            'Checking standalone context',
            'Ranking moments',
          ].map((step) => (
            <div
              key={step}
              className="rounded-xl border border-border/80 bg-cream/50 p-2.5 text-center text-xs font-medium text-foreground flex flex-col items-center justify-center gap-1.5"
            >
              <div className="size-2 rounded-full bg-clay animate-ping" />
              <span className="text-[11px] text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      </SpotlightCard>
    );
  }

  // 3. Main Workspace with Top Sub-Tabs: AI Suggestions vs My Clips
  return (
    <div className="space-y-6">
      {/* Primary Workspace Nav (AI Suggestions vs My Clips) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-white/[0.04] p-1 border border-white/[0.08] text-xs font-medium">
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'suggestions'
                  ? 'bg-gradient-to-r from-violet-600/30 to-purple-600/20 text-white font-bold border border-violet-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sparkles className="size-3.5 text-violet-400" />
              <span>AI Suggestions</span>
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-mono text-violet-300 font-bold border border-violet-500/30">
                {candidates.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('my_clips')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'my_clips'
                  ? 'bg-gradient-to-r from-emerald-600/30 to-teal-600/20 text-white font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Video className="size-3.5 text-emerald-400" />
              <span>My Clips</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-bold border border-emerald-500/30">
                {myClips.length}
              </span>
            </button>
          </div>
        </div>

        {activeTab === 'suggestions' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFindClips}
              disabled={isAnalyzing}
              className="text-xs border-white/10 hover:border-violet-500/40 hover:bg-violet-500/10"
            >
              <Sparkles className="size-3.5 mr-1.5 text-violet-400" />
              Regenerate Suggestions
            </Button>
          </div>
        )}
      </div>

      {clipActionError && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{clipActionError}</span>
          </div>
          <button
            onClick={() => setClipActionError(null)}
            className="text-[11px] font-semibold underline hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: AI SUGGESTIONS VIEW                                */}
      {/* ======================================================== */}
      {activeTab === 'suggestions' && (
        <>
          {candidates.length === 0 ? (
            <div className="p-8 md:p-14 text-center rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 space-y-5 shadow-xl backdrop-blur-xl">
              <div className="size-16 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/25 mx-auto flex items-center justify-center shadow-lg">
                <Sparkles className="size-8" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h3 className="text-xl sm:text-2xl font-bold font-['Sora',sans-serif] text-white">
                  Discover Viral Moments
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  VireoClip analyzes transcript hooks, speech cadences, and visual cues to surface high-retention short clips for TikTok, Reels, and YouTube Shorts.
                </p>
                <p className="text-xs text-violet-300 font-mono">
                  Identifies 5–10 viral moments with calculated hook scores, retention forecast, and auto-generated titles.
                </p>
              </div>

              {analysisError && (
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs max-w-md mx-auto flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0 text-rose-400" />
                  <span>{analysisError}</span>
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleFindClips}
                  disabled={isAnalyzing || !transcript}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold px-8 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  <Sparkles className="size-4 mr-2" />
                  Analyze & Find Viral Clips
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Natural Language Moment Search Bar */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 p-3 shadow-lg">
                <form onSubmit={handleSearchMoments} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ask AI to find a moment... (e.g. 'part about product pricing' or 'funny hook about startup')"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSearching || !searchQuery.trim()}
                    className="text-xs shrink-0 bg-violet-600 hover:bg-violet-500 text-white font-semibold"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 mr-1.5" />
                        Find Moment
                      </>
                    )}
                  </Button>
                </form>

                {searchError && (
                  <p className="text-[11px] text-destructive mt-2 px-1 flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />
                    <span>{searchError}</span>
                  </p>
                )}

                {/* Found Moments List */}
                {searchMoments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="font-semibold text-foreground flex items-center gap-1.5 font-mono">
                        <Sparkles className="size-3.5 text-clay" />
                        Found {searchMoments.length} Moment{searchMoments.length > 1 ? 's' : ''} for "{searchQuery}"
                      </span>
                      <button
                        onClick={handleClearSearch}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {searchMoments.map((moment, mIdx) => (
                        <div
                          key={mIdx}
                          onClick={() => handlePreviewMoment(moment)}
                          className="rounded-xl border border-clay/30 bg-cream/40 p-2.5 cursor-pointer hover:bg-cream/70 transition-all text-left flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-foreground line-clamp-1">{moment.title}</span>
                              <span className="rounded bg-clay/10 px-1.5 py-0.2 font-mono text-clay font-bold text-[10px]">
                                {moment.vireo_score} Score
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 italic">
                              "{moment.hook}"
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
                            <span>{formatTime(moment.start_seconds)} – {formatTime(moment.end_seconds)}</span>
                            <span className="text-clay font-semibold flex items-center gap-1">
                              <Play className="size-2.5 fill-clay" /> Preview
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Sub-bar */}
              <div className="flex items-center justify-between text-xs pb-1">
                <div className="flex items-center gap-2 font-medium">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      filter === 'all' ? 'bg-cream text-foreground font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    All ({candidates.filter((c) => c.status !== 'dismissed').length})
                  </button>
                  <button
                    onClick={() => setFilter('selected')}
                    className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                      filter === 'selected' ? 'bg-cream text-vireo-green font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    <CheckCircle2 className="size-3 text-vireo-green" />
                    <span>Selected ({selectedCount})</span>
                  </button>
                </div>
              </div>

              {/* 3-Column Layout: Candidates | Video Preview | Details & Create Action */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT: Candidate List */}
                <div className="lg:col-span-4 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {filteredCandidates.map((candidate: ClipCandidate, index: number) => {
                    const isSelected = candidate.id === activeCandidate?.id;
                    const isChosen = candidate.status === 'selected';
                    const score = candidate.metadata?.vireo_score ?? candidate.engagement_score;
                    const visualScore = candidate.metadata?.explanation?.visual_activity_score;
                    const wasSnapped = candidate.metadata?.was_snapped;

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => setSelectedCandidateId(candidate.id)}
                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-clay/50 bg-cream/70 shadow-sm ring-1 ring-white/20'
                            : 'border-border/80 bg-card hover:bg-cream/30 hover:border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              #{index + 1}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-xs font-bold font-mono ${
                                score >= 85
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-clay/10 text-clay'
                              }`}
                            >
                              {score} VireoClip
                            </span>
                          </div>

                          {isChosen ? (
                            <span className="flex items-center gap-1 rounded-full bg-vireo-green/10 text-vireo-green px-2 py-0.5 text-[11px] font-semibold">
                              <Check className="size-3" />
                              Selected
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider capitalize">
                              {candidate.category}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-2 text-sm font-semibold text-foreground font-display line-clamp-2">
                          {candidate.title}
                        </h4>

                        {/* Multimodal & Genre Signal Badges */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {(candidate.genre || candidate.metadata?.genre) && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[10px] font-mono text-purple-600 dark:text-purple-400">
                              {candidate.genre || candidate.metadata?.genre}
                            </span>
                          )}
                          {candidate.content_goal && (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono text-blue-600 dark:text-blue-400">
                              {candidate.content_goal}
                            </span>
                          )}
                          {visualScore !== undefined && (
                            <span className="inline-flex items-center gap-1 rounded bg-cream/70 border border-border/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              <Activity className="size-2.5 text-clay" />
                              {visualScore} Visual
                            </span>
                          )}
                          {wasSnapped && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                              <Zap className="size-2.5" />
                              Snapped
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground font-mono border-t border-border/50 pt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime(candidate.start_seconds)} – {formatTime(candidate.end_seconds)}
                          </span>
                          <span>{Math.round(candidate.duration_seconds)}s</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CENTER: Source Video Player */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="card-soft overflow-hidden border-border/80 bg-black/95 rounded-2xl relative shadow-lg">
                    {videoPreviewUrl ? (
                      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                        <video
                          ref={videoRef}
                          src={videoPreviewUrl}
                          className="w-full h-full object-contain"
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={() => {
                            if (videoRef.current && activeCandidate) {
                              videoRef.current.currentTime = activeCandidate.start_seconds;
                            }
                          }}
                          onEnded={() => setIsPlaying(false)}
                        />

                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl text-white text-xs">
                          <button
                            onClick={togglePlay}
                            className="flex items-center gap-1.5 font-semibold hover:text-clay transition-colors"
                          >
                            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-white" />}
                            <span>{isPlaying ? 'Pause' : 'Preview Cut'}</span>
                          </button>

                          <div className="font-mono text-[11px] text-white/80">
                            {formatTime(currentTime)} / {activeCandidate ? formatTime(activeCandidate.end_seconds) : '00:00'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video w-full flex flex-col items-center justify-center text-center p-6 space-y-2 bg-[#1a1c1a] text-white">
                        <Film className="size-8 text-clay" />
                        <p className="text-xs text-white/70 max-w-xs">
                          {activeCandidate
                            ? `Active Moment: ${formatTime(activeCandidate.start_seconds)} – ${formatTime(activeCandidate.end_seconds)}`
                            : 'No candidate selected'}
                        </p>
                      </div>
                    )}
                  </div>

                  {activeCandidate && (
                    <div className="rounded-xl border border-border/60 bg-cream/40 p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-vireo-green animate-pulse" />
                        <span className="font-medium text-foreground">Active Segment:</span>
                        <span className="font-mono text-muted-foreground">
                          {formatTime(activeCandidate.start_seconds)} – {formatTime(activeCandidate.end_seconds)}
                        </span>
                      </div>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {Math.round(activeCandidate.duration_seconds)}s duration
                      </span>
                    </div>
                  )}
                </div>

                {/* RIGHT: Candidate Actions & Phase 16 Explainable Intelligence */}
                {activeCandidate && (
                  <div className="lg:col-span-3 space-y-4">
                    <div className="card-soft p-5 border-border/80 bg-card space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                          MOMENT DETAILS
                        </span>
                        <span
                          className={`rounded-md px-2.5 py-0.5 text-xs font-bold font-mono ${
                            (activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score) >= 85
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-clay/10 text-clay'
                          }`}
                        >
                          {activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score} Score
                        </span>
                      </div>

                      <h3 className="text-base font-bold font-display text-foreground leading-snug">
                        {activeCandidate.title}
                      </h3>

                      <div className="space-y-1.5 rounded-xl bg-cream/50 p-3 border border-border/50 text-xs">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-clay" />
                          Hook
                        </span>
                        <p className="text-muted-foreground leading-relaxed italic">
                          "{activeCandidate.hook}"
                        </p>
                      </div>

                      {/* Explainable Intelligence: Sub-scores, reasons, and platform suitability */}
                      <WhyThisClipSection candidate={activeCandidate} defaultExpanded={true} />

                      {/* PHASE 11 PRIMARY ACTION: Create Clip */}
                      <div className="pt-2 space-y-2 border-t border-border/60">
                        <Button
                          variant="clay"
                          size="sm"
                          className="w-full text-xs shadow-black/40 py-2.5"
                          disabled={isCreatingClip === activeCandidate.id}
                          onClick={() => handleCreateClip(activeCandidate.id)}
                        >
                          {isCreatingClip === activeCandidate.id ? (
                            <>
                              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                              Creating Clip...
                            </>
                          ) : (
                            <>
                              <Video className="size-3.5 mr-1.5" />
                              Create Clip (Render 9:16)
                            </>
                          )}
                        </Button>

                        {/* Select / Dismiss Toggle */}
                        <div className="flex items-center gap-2 pt-1">
                          {activeCandidate.status === 'selected' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'suggested')}
                            >
                              Unselect
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-vireo-green hover:bg-vireo-green/5"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'selected')}
                            >
                              <CheckCircle2 className="size-3.5 mr-1 text-vireo-green" />
                              Select
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-destructive px-2"
                            onClick={() => handleUpdateStatus(activeCandidate.id, 'dismissed')}
                            title="Dismiss moment"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MY CLIPS (RENDERED MP4 WORKSPACE)                 */}
      {/* ======================================================== */}
      {activeTab === 'my_clips' && (
        <div className="space-y-6">
          {myClips.length === 0 ? (
            <div className="p-8 md:p-14 text-center rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 space-y-4 shadow-xl backdrop-blur-xl">
              <div className="size-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 mx-auto flex items-center justify-center shadow-lg">
                <Video className="size-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-xl font-bold font-['Sora',sans-serif] text-white">
                  No rendered clips yet
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Go to <strong className="text-white">AI Suggestions</strong>, pick a high-retention viral moment, and click <strong className="text-white">Create Clip</strong> to render your first 9:16 MP4.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveTab('suggestions')}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold"
                >
                  <Sparkles className="size-3.5 mr-1.5" />
                  View AI Suggestions
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myClips.map((clip) => {
                const matchingCand = candidates.find((c) => c.id === clip.candidate_id);
                const title = matchingCand?.title || `Clip (${clip.aspect_ratio})`;
                const isReady = clip.render_status === 'ready';
                const isFailed = clip.render_status === 'failed';
                const isRendering = ['queued', 'rendering', 'uploading', 'draft'].includes(clip.render_status);
                const progress = clip.latest_job?.progress ?? (isReady ? 100 : 0);
                const stage = clip.latest_job?.stage || clip.render_status;
                const score = matchingCand?.metadata?.vireo_score ?? matchingCand?.engagement_score ?? 94;

                return (
                  <div
                    key={clip.id}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 flex flex-col justify-between shadow-xl backdrop-blur-xl transition-all hover:border-violet-500/40 group"
                  >
                    <div className="p-4 space-y-3.5">
                      {/* Vertical 9:16 Video Preview Card Area */}
                      <div className="relative aspect-[9/16] max-h-72 w-full overflow-hidden rounded-xl bg-black border border-white/10 flex items-center justify-center group/vid">
                        {previewClipId === clip.id && previewUrls[clip.id] ? (
                          <video
                            src={previewUrls[clip.id]}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                          />
                        ) : clip.thumbnail_url ? (
                          <img
                            src={clip.thumbnail_url}
                            alt={title}
                            className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <div className="flex items-center gap-1 opacity-25 mb-2">
                              {[25, 60, 40, 80, 65, 35, 75, 50, 90, 45].map((h, i) => (
                                <span
                                  key={i}
                                  style={{ height: `${h * 0.4}px` }}
                                  className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400"
                                />
                              ))}
                            </div>
                            <span className="text-[11px] font-mono text-slate-500">9:16 Clip Preview</span>
                          </div>
                        )}

                        {/* Top Overlay Badges */}
                        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10 pointer-events-none">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold font-mono shadow-sm flex items-center gap-1 backdrop-blur-md">
                            <Flame className="size-3 text-emerald-400 fill-emerald-400" />
                            {score} VIRAL
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-black/75 border border-white/10 text-white text-[10px] font-mono font-bold backdrop-blur-md">
                            {clip.aspect_ratio}
                          </span>
                        </div>

                        {/* Play preview hover button */}
                        {isReady && previewClipId !== clip.id && (
                          <button
                            type="button"
                            onClick={() => handleTogglePreview(clip.id)}
                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/vid:opacity-100 transition-opacity cursor-pointer"
                          >
                            <div className="size-11 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform">
                              <Play className="size-5 ml-0.5 fill-white" />
                            </div>
                          </button>
                        )}

                        {/* Duration pill at bottom right */}
                        <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
                          <span className="px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono font-bold border border-white/10 backdrop-blur-sm">
                            {Math.round(clip.duration_seconds)}s
                          </span>
                        </div>
                      </div>

                      {/* Title & Timing Info */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                            <Clock className="size-3 text-violet-400" />
                            {formatTime(clip.start_seconds)} – {formatTime(clip.end_seconds)}
                          </span>

                          <div>
                            {isReady && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
                                <Check className="size-2.5" />
                                Ready
                              </span>
                            )}
                            {isRendering && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 px-2 py-0.5 text-[10px] font-semibold animate-pulse">
                                <Loader2 className="size-2.5 animate-spin" />
                                {progress}% {stage}
                              </span>
                            )}
                            {isFailed && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[10px] font-semibold">
                                <AlertCircle className="size-2.5" />
                                Failed
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="font-semibold text-sm font-['Sora',sans-serif] text-white line-clamp-2 leading-snug">
                          {title}
                        </h4>
                      </div>

                      {/* Active Rendering Progress Bar */}
                      {isRendering && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                            <span className="capitalize">{stage}…</span>
                            <span className="text-violet-300 font-bold">{progress}%</span>
                          </div>
                          <div className="w-full bg-white/[0.08] rounded-full h-2 overflow-hidden border border-white/10">
                            <div
                              className="bg-gradient-to-r from-violet-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Failure Message */}
                      {isFailed && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                          {clip.render_error_message || 'Video rendering failed. Please try again.'}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="p-3.5 bg-black/40 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isReady && (
                          <>
                            <Link to={`/clips/${clip.id}/edit?tab=producer`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-semibold border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-600 hover:text-white transition-all"
                                title="Open VireoClip Producer AI Director (auto dead air cuts, kinetic captions, punch-ins)"
                              >
                                <Wand2 className="size-3.5 mr-1 text-violet-400" />
                                Produce
                              </Button>
                            </Link>

                            <Link to={`/clips/${clip.id}/edit`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-semibold border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white hover:text-black transition-all"
                                title="Open full multi-track Timeline Editor"
                              >
                                <Sliders className="size-3.5 mr-1" />
                                Edit Video
                              </Button>
                            </Link>

                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs font-semibold border-white/10 bg-white/[0.04] text-slate-200 hover:text-white hover:bg-white/[0.08]"
                              onClick={() => setContentPackClip(clip)}
                              title="Generate multi-platform Content Pack (titles, hooks, captions)"
                            >
                              <Layers className="size-3.5 mr-1 text-cyan-400" />
                              Kit
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-600 hover:text-white"
                              onClick={() => setPublishingClip(clip)}
                              title="Publish or schedule clip to social channels"
                            >
                              <Share2 className="size-3 mr-1" />
                              Publish
                            </Button>

                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs bg-white text-black hover:bg-slate-200 font-bold"
                              disabled={isDownloading === clip.id}
                              onClick={() => handleDownloadClip(clip.id)}
                            >
                              {isDownloading === clip.id ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : (
                                <Download className="size-3 mr-1" />
                              )}
                              MP4
                            </Button>
                          </>
                        )}

                        {isFailed && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                            disabled={retryingClipId === clip.id}
                            onClick={() => handleRetryRender(clip.id)}
                          >
                            {retryingClipId === clip.id ? (
                              <Loader2 className="size-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="size-3 mr-1" />
                            )}
                            Retry Render
                          </Button>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-rose-400 px-2 cursor-pointer"
                        onClick={() => handleDeleteClip(clip.id)}
                        title="Delete clip"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Phase 10: Publishing Composer Modal */}
      {publishingClip && (
        <PublishModal
          isOpen={Boolean(publishingClip)}
          onClose={() => setPublishingClip(null)}
          projectId={projectId}
          clipId={publishingClip.id}
          initialTitle={`Clip: ${Math.round(publishingClip.duration_seconds)}s Highlight`}
          initialCaption="Check out this highlight clip generated with VireoClip! #ai #video #shorts"
        />
      )}

      {/* Phase 23: Content Pack Workspace Modal */}
      {contentPackClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-5xl">
            <ContentPackWorkspace
              projectId={projectId}
              clipId={contentPackClip.id}
              clipTitle={contentPackClip.title || `Clip: ${Math.round(contentPackClip.duration_seconds)}s Highlight`}
              clipDurationSeconds={contentPackClip.duration_seconds}
              onClose={() => setContentPackClip(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
