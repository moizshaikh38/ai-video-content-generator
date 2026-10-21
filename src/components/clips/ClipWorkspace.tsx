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
  Smartphone,
  Monitor,
  Square,
  Eye,
  EyeOff,
} from 'lucide-react';

import { Button } from '../Button';
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

  // Aspect Ratio & Phone Framing Studio state
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [captionPreset, setCaptionPreset] = useState<'hormozi' | 'neon' | 'beast' | 'karaoke' | 'clean'>('hormozi');

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
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 p-12 text-center space-y-4 shadow-xl">
        <Loader2 className="size-8 text-violet-400 animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-400">Loading clips studio...</p>
      </div>
    );
  }

  // 2. AI Analysis In-Progress State
  if (isAnalyzing) {
    return (
      <div className="rounded-2xl border border-violet-500/30 bg-[#0E1017]/90 p-8 md:p-12 text-center space-y-6 shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
        <div className="size-16 rounded-2xl bg-violet-500/15 text-violet-400 border border-violet-500/30 mx-auto flex items-center justify-center animate-pulse">
          <Film className="size-8" />
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-xl font-bold font-['Sora',sans-serif] text-white">
            Finding your strongest viral moments...
          </h3>
          <p className="text-xs sm:text-sm text-slate-400">
            VireoClip is scanning multimodal audio, transcript sentiment, and visual peaks to detect high-retention standalone clips.
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
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-center text-xs font-medium text-white flex flex-col items-center justify-center gap-1.5"
            >
              <div className="size-2 rounded-full bg-violet-400 animate-ping" />
              <span className="text-[11px] text-slate-400">{step}</span>
            </div>
          ))}
        </div>
      </div>
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
                  <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2">
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
                        <Sparkles className="size-3.5 text-violet-400" />
                        Found {searchMoments.length} Moment{searchMoments.length > 1 ? 's' : ''} for "{searchQuery}"
                      </span>
                      <button
                        onClick={handleClearSearch}
                        className="text-[11px] text-slate-400 hover:text-white underline"
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {searchMoments.map((moment, mIdx) => (
                        <div
                          key={mIdx}
                          onClick={() => handlePreviewMoment(moment)}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 cursor-pointer hover:bg-white/[0.08] hover:border-violet-500/30 transition-all text-left flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-white line-clamp-1">{moment.title}</span>
                              <span className="rounded bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.2 font-mono text-violet-300 font-bold text-[10px]">
                                {moment.vireo_score} Score
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 line-clamp-2 mt-1 italic">
                              "{moment.hook}"
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-white/[0.06] pt-1.5">
                            <span>{formatTime(moment.start_seconds)} – {formatTime(moment.end_seconds)}</span>
                            <span className="text-violet-400 font-semibold flex items-center gap-1">
                              <Play className="size-2.5 fill-violet-400" /> Preview
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
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                      filter === 'all' ? 'bg-white/[0.08] text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({candidates.filter((c) => c.status !== 'dismissed').length})
                  </button>
                  <button
                    onClick={() => setFilter('selected')}
                    className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      filter === 'selected' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="size-3 text-emerald-400" />
                    <span>Selected ({selectedCount})</span>
                  </button>
                </div>
              </div>

              {/* 3-Column Studio Layout: Viral Moments Stream | Center Video Studio | Moment Intelligence */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* LEFT: Candidate List (Ranked Viral Moments) */}
                <div className="lg:col-span-4 space-y-2.5 max-h-[660px] overflow-y-auto pr-1">
                  {filteredCandidates.map((candidate: ClipCandidate, index: number) => {
                    const isSelected = candidate.id === activeCandidate?.id;
                    const isChosen = candidate.status === 'selected';
                    const score = candidate.metadata?.vireo_score ?? candidate.engagement_score ?? 94;
                    const visualScore = candidate.metadata?.explanation?.visual_activity_score;
                    const wasSnapped = candidate.metadata?.was_snapped;

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => setSelectedCandidateId(candidate.id)}
                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-violet-500/50 bg-[#121522] shadow-xl ring-1 ring-violet-500/30'
                            : 'border-white/[0.08] bg-[#0E1017]/90 hover:bg-[#121520] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{index + 1}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold font-mono border flex items-center gap-1 ${
                                score >= 85
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                  : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                              }`}
                            >
                              <Flame className="size-3 text-emerald-400" />
                              {score} Viral
                            </span>
                          </div>

                          {isChosen ? (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold">
                              <Check className="size-3" />
                              Selected
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider capitalize">
                              {candidate.category}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-2 text-sm font-bold text-white font-['Sora',sans-serif] line-clamp-2 leading-snug group-hover:text-violet-300 transition-colors">
                          {candidate.title}
                        </h4>

                        {/* Multimodal & Genre Signal Badges */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {(candidate.genre || candidate.metadata?.genre) && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/25 px-1.5 py-0.5 text-[10px] font-mono text-purple-300">
                              {candidate.genre || candidate.metadata?.genre}
                            </span>
                          )}
                          {candidate.content_goal && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 border border-blue-500/25 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
                              {candidate.content_goal}
                            </span>
                          )}
                          {visualScore !== undefined && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                              <Activity className="size-2.5 text-violet-400" />
                              {visualScore} Visual
                            </span>
                          )}
                          {wasSnapped && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-mono text-amber-300">
                              <Zap className="size-2.5" />
                              Snapped
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400 font-mono border-t border-white/[0.06] pt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3 text-violet-400" />
                            {formatTime(candidate.start_seconds)} – {formatTime(candidate.end_seconds)}
                          </span>
                          <span>{Math.round(candidate.duration_seconds)}s</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CENTER: High-Fidelity Video Player Studio */}
                <div className="lg:col-span-5 space-y-3.5">
                  {/* Top Aspect Ratio & Safe Zone Toolbar */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#0E1017] border border-white/[0.08] shadow-md">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAspectRatio('9:16')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          aspectRatio === '9:16'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <Smartphone className="size-3.5" />
                        <span>9:16</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAspectRatio('1:1')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          aspectRatio === '1:1'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <Square className="size-3.5" />
                        <span>1:1</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAspectRatio('16:9')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          aspectRatio === '16:9'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <Monitor className="size-3.5" />
                        <span>16:9</span>
                      </button>
                    </div>

                    {aspectRatio === '9:16' && (
                      <button
                        type="button"
                        onClick={() => setShowSafeZones((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                          showSafeZones
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                        }`}
                        title="Toggle TikTok / Shorts UI Safe Zones overlay"
                      >
                        {showSafeZones ? <Eye className="size-3 text-emerald-400" /> : <EyeOff className="size-3" />}
                        <span>Safe Zones</span>
                      </button>
                    )}
                  </div>

                  {/* Main Player Display Box */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0A0D14] p-3 shadow-2xl relative flex flex-col items-center justify-center min-h-[440px]">
                    {videoPreviewUrl ? (
                      <div
                        className={`relative overflow-hidden bg-black flex items-center justify-center transition-all duration-300 ${
                          aspectRatio === '9:16'
                            ? 'w-full max-w-[270px] aspect-[9/16] rounded-[36px] border-[4px] border-white/20 shadow-2xl ring-1 ring-white/10'
                            : aspectRatio === '1:1'
                            ? 'w-full max-w-[360px] aspect-square rounded-2xl border border-white/15 shadow-xl'
                            : 'w-full aspect-video rounded-2xl border border-white/15 shadow-xl'
                        }`}
                      >
                        <video
                          ref={videoRef}
                          src={videoPreviewUrl}
                          className="w-full h-full object-cover"
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={() => {
                            if (videoRef.current && activeCandidate) {
                              videoRef.current.currentTime = activeCandidate.start_seconds;
                            }
                          }}
                          onEnded={() => setIsPlaying(false)}
                        />

                        {/* Live Kinetic Caption Preview Overlay */}
                        {activeCandidate && (
                          <div className="absolute top-[62%] inset-x-3 z-20 pointer-events-none text-center flex justify-center">
                            {captionPreset === 'hormozi' && (
                              <span className="font-black text-amber-300 uppercase tracking-wider text-xs sm:text-sm px-3 py-1 bg-black/75 rounded-lg border border-amber-400/40 drop-shadow-[0_2px_0_rgba(0,0,0,1)] shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                {activeCandidate.hook || activeCandidate.title}
                              </span>
                            )}
                            {captionPreset === 'neon' && (
                              <span className="font-extrabold text-emerald-300 text-xs sm:text-sm px-3 py-1 bg-black/75 rounded-lg border border-emerald-400/40 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)] shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                {activeCandidate.hook || activeCandidate.title}
                              </span>
                            )}
                            {captionPreset === 'beast' && (
                              <span className="font-black text-white uppercase text-xs sm:text-sm px-3 py-1 bg-red-600 rounded drop-shadow-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                {activeCandidate.hook || activeCandidate.title}
                              </span>
                            )}
                            {captionPreset === 'karaoke' && (
                              <span className="font-bold text-white text-xs sm:text-sm px-3 py-1 bg-black/75 rounded-lg border border-cyan-400/40 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                <span className="text-cyan-400 font-extrabold mr-1">WATCH:</span>
                                {activeCandidate.hook || activeCandidate.title}
                              </span>
                            )}
                            {captionPreset === 'clean' && (
                              <span className="font-semibold text-white text-xs sm:text-sm px-3 py-1 bg-black/60 rounded-lg backdrop-blur-sm drop-shadow shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                {activeCandidate.hook || activeCandidate.title}
                              </span>
                            )}
                          </div>
                        )}

                        {/* TikTok / Reels UI Safe Zone Overlay */}
                        {aspectRatio === '9:16' && showSafeZones && (
                          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 border-2 border-dashed border-cyan-400/30">
                            {/* Top info */}
                            <div className="flex items-center justify-between text-[9px] font-mono text-cyan-300/80 bg-black/40 px-2 py-0.5 rounded">
                              <span>Safe Header (120px)</span>
                              <span>Following | For You</span>
                            </div>

                            {/* Right Action Rail */}
                            <div className="self-end space-y-3 pr-1 text-center text-white/90">
                              <div className="size-7 rounded-full bg-violet-600 border border-white flex items-center justify-center text-[10px] font-bold">
                                +
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-xs">❤️</span>
                                <span className="text-[8px] font-bold">48.2K</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-xs">💬</span>
                                <span className="text-[8px] font-bold">814</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-xs">🔖</span>
                                <span className="text-[8px] font-bold">3.2K</span>
                              </div>
                              <div className="size-6 rounded-full bg-slate-800 border border-slate-600 animate-spin mx-auto text-[8px] flex items-center justify-center">
                                🎵
                              </div>
                            </div>

                            {/* Bottom Caption Area */}
                            <div className="space-y-0.5 text-left text-white/80 bg-black/40 p-2 rounded">
                              <p className="text-[10px] font-bold">@creator</p>
                              <p className="text-[9px] text-slate-300 line-clamp-1">
                                #viral #podcast #vireoclip
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Play / Pause Big Center Overlay Button on Hover */}
                        <div
                          onClick={togglePlay}
                          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity cursor-pointer z-30"
                        >
                          <div className="size-12 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 fill-white ml-0.5" />}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video w-full flex flex-col items-center justify-center text-center p-6 space-y-2 bg-[#0E1017] text-white">
                        <Film className="size-8 text-violet-400" />
                        <p className="text-xs text-slate-400 max-w-xs">
                          {activeCandidate
                            ? `Active Moment: ${formatTime(activeCandidate.start_seconds)} – ${formatTime(activeCandidate.end_seconds)}`
                            : 'No candidate selected'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Caption Preset Quick Selector Ribbon */}
                  <div className="rounded-xl border border-white/[0.08] bg-[#0E1017] p-2.5 space-y-1.5 shadow-md">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Live Caption Preset:</span>
                      <span className="text-violet-400 font-bold uppercase">{captionPreset}</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {[
                        { id: 'hormozi', label: '🔥 Hormozi' },
                        { id: 'neon', label: '⚡ Neon Glow' },
                        { id: 'beast', label: '💥 Beast Red' },
                        { id: 'karaoke', label: '🎤 Karaoke' },
                        { id: 'clean', label: '✨ Minimal' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setCaptionPreset(p.id as any)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            captionPreset === p.id
                              ? 'bg-violet-600 text-white shadow-sm'
                              : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Transport & Seeker Bar */}
                  {activeCandidate && (
                    <div className="rounded-xl border border-white/[0.08] bg-[#0E1017] p-3 flex items-center justify-between text-xs shadow-md">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="flex items-center gap-1.5 font-bold text-white hover:text-violet-300 transition-colors cursor-pointer"
                        >
                          {isPlaying ? <Pause className="size-4 text-violet-400" /> : <Play className="size-4 fill-white text-violet-400" />}
                          <span>{isPlaying ? 'Pause' : 'Play Cut'}</span>
                        </button>
                        <span className="text-slate-500">•</span>
                        <div className="font-mono text-[11px] text-slate-300">
                          {formatTime(currentTime)} / {formatTime(activeCandidate.end_seconds)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{Math.round(activeCandidate.duration_seconds)}s</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT: Candidate Actions & Phase 16 Explainable Intelligence */}
                {activeCandidate && (
                  <div className="lg:col-span-3 space-y-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0E1017] p-5 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                          MOMENT INTELLIGENCE
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold font-mono border flex items-center gap-1 ${
                            (activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score) >= 85
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                          }`}
                        >
                          <Flame className="size-3 text-emerald-400" />
                          {activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score} Score
                        </span>
                      </div>

                      <h3 className="text-base font-bold font-['Sora',sans-serif] text-white leading-snug">
                        {activeCandidate.title}
                      </h3>

                      <div className="space-y-1.5 rounded-xl bg-white/[0.04] p-3 border border-white/[0.08] text-xs">
                        <span className="font-bold text-violet-300 flex items-center gap-1.5 font-mono">
                          <Sparkles className="size-3.5 text-violet-400" />
                          HOOK
                        </span>
                        <p className="text-slate-300 leading-relaxed italic">
                          "{activeCandidate.hook}"
                        </p>
                      </div>

                      {/* Explainable Intelligence: Sub-scores, reasons, and platform suitability */}
                      <WhyThisClipSection candidate={activeCandidate} defaultExpanded={true} />

                      {/* PRIMARY ACTION: Create Clip */}
                      <div className="pt-2 space-y-2 border-t border-white/[0.08]">
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold shadow-lg shadow-violet-900/30 cursor-pointer"
                          disabled={isCreatingClip === activeCandidate.id}
                          onClick={() => handleCreateClip(activeCandidate.id)}
                        >
                          {isCreatingClip === activeCandidate.id ? (
                            <>
                              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                              Rendering 9:16 Clip...
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
                              className="flex-1 text-xs text-slate-300 hover:text-white border-white/10"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'suggested')}
                            >
                              Unselect
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'selected')}
                            >
                              <CheckCircle2 className="size-3.5 mr-1 text-emerald-400" />
                              Select
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-slate-400 hover:text-rose-400 px-2"
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
