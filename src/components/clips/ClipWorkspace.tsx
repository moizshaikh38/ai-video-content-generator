import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  Lightbulb,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../Button';
import { SpotlightCard } from '../react-bits/SpotlightCard';
import { ClipCandidate, ClipCandidateStatus, Transcript } from '../../types';
import { clipService } from '../../services/clipService';

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
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'selected'>('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load existing clip candidates on mount
  useEffect(() => {
    let active = true;
    const loadCandidates = async () => {
      setIsLoading(true);
      try {
        const data = await clipService.getClipCandidates(projectId);
        if (active) {
          setCandidates(data);
          if (data.length > 0) {
            setSelectedCandidateId(data[0].id);
          }
        }
      } catch (err: any) {
        // Table or candidates might not exist yet before first run
        if (active) setCandidates([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadCandidates();
    return () => {
      active = false;
    };
  }, [projectId]);

  // Handle Find Clips analysis call (triggers POST /api/projects/:id/analyze-clips ONCE)
  const handleFindClips = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await clipService.analyzeClips(projectId);
      setCandidates(response.candidates);
      if (response.candidates.length > 0) {
        setSelectedCandidateId(response.candidates[0].id);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to analyze video clips.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle status update (suggested | selected | dismissed)
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

  // Format seconds into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  // Sync video seek position when selected candidate changes
  useEffect(() => {
    if (videoRef.current && activeCandidate) {
      videoRef.current.currentTime = activeCandidate.start_seconds;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [activeCandidate?.id]);

  // Video timeupdate check to loop / monitor segment bounds
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    // Optional subtle pause if past end of candidate clip
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
      if (activeCandidate && (videoRef.current.currentTime < activeCandidate.start_seconds || videoRef.current.currentTime >= activeCandidate.end_seconds)) {
        videoRef.current.currentTime = activeCandidate.start_seconds;
      }
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    if (filter === 'selected') return c.status === 'selected';
    return c.status !== 'dismissed';
  });

  const selectedCount = candidates.filter((c) => c.status === 'selected').length;

  // 1. Loading Initial Data State
  if (isLoading) {
    return (
      <div className="card-soft p-12 text-center space-y-4">
        <Loader2 className="size-8 text-clay animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Loading clip candidates...</p>
      </div>
    );
  }

  // 2. Analysis In-Progress State (Section 27)
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
            Vireo is analyzing your video transcript to detect high-engagement standalone clips.
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

  // 3. Empty State (Section 26: Before Analysis)
  if (candidates.length === 0) {
    return (
      <SpotlightCard
        spotlightColor="rgba(192, 98, 62, 0.12)"
        className="p-8 md:p-12 text-center border-border/80 bg-card space-y-6"
      >
        <div className="size-14 rounded-2xl bg-clay/10 text-clay mx-auto flex items-center justify-center">
          <Film className="size-7" />
        </div>

        <div className="space-y-2 max-w-lg mx-auto">
          <h3 className="text-xl md:text-2xl font-semibold font-display text-foreground">
            Find your best moments
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vireo analyzes your transcript to surface strong standalone moments for Shorts, Reels, and TikTok.
          </p>
          <p className="text-xs text-muted-foreground/80 font-mono">
            Usually finds 5–10 strong moments based on hook strength, clarity, and pacing.
          </p>
        </div>

        {analysisError && (
          <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs max-w-md mx-auto flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}

        <div className="pt-2">
          <Button
            variant="clay"
            size="lg"
            onClick={handleFindClips}
            disabled={isAnalyzing || !transcript}
            className="shadow-clay px-8"
          >
            <Sparkles className="size-4 mr-2" />
            Find Clips
          </Button>
        </div>
      </SpotlightCard>
    );
  }

  // 4. Clip Candidate Workspace (Sections 28, 29, 30, 31, 32, 33)
  return (
    <div className="space-y-6">
      {/* Workspace Sub-header with Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-cream/70 p-1 border border-border/80 text-xs font-medium">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Clips ({candidates.filter((c) => c.status !== 'dismissed').length})
            </button>
            <button
              onClick={() => setFilter('selected')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                filter === 'selected'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="size-3.5 text-vireo-green" />
              <span>Selected ({selectedCount})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFindClips}
            disabled={isAnalyzing}
            className="text-xs"
          >
            <Sparkles className="size-3.5 mr-1.5 text-clay" />
            Regenerate Clips
          </Button>
        </div>
      </div>

      {analysisError && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{analysisError}</span>
        </div>
      )}

      {/* 3-Column Desktop Layout (Stacked on Mobile <= 768px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Candidate List (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 font-mono">
            <span>RECOMMENDED CLIPS</span>
            <span>SORTED BY SCORE</span>
          </div>

          <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {filteredCandidates.map((candidate, index) => {
              const isSelected = candidate.id === activeCandidate?.id;
              const isChosen = candidate.status === 'selected';

              return (
                <div
                  key={candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  className={`group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 text-left ${
                    isSelected
                      ? 'border-clay/50 bg-cream/70 shadow-sm ring-1 ring-clay/20'
                      : 'border-border/80 bg-card hover:bg-cream/30 hover:border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="rounded-md bg-clay/10 px-2 py-0.5 text-xs font-bold text-clay font-mono">
                        {candidate.engagement_score} Clip Score
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

                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1 italic">
                    "{candidate.hook}"
                  </p>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground font-mono border-t border-border/50 pt-2.5">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatTime(candidate.start_seconds)} – {formatTime(candidate.end_seconds)}
                    </span>
                    <span>{Math.round(candidate.duration_seconds)}s</span>
                  </div>
                </div>
              );
            })}

            {filteredCandidates.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground card-soft">
                No clips in this view.
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Source Video Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-soft overflow-hidden border-border/80 bg-black/95 rounded-2xl relative shadow-lg">
            {videoPreviewUrl ? (
              <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoPreviewUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />

                {/* Overlay Play Controls */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl text-white text-xs">
                  <button
                    onClick={togglePlay}
                    className="flex items-center gap-1.5 font-semibold hover:text-clay transition-colors"
                  >
                    {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-white" />}
                    <span>{isPlaying ? 'Pause' : 'Preview'}</span>
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
                  Source video preview timestamp: {activeCandidate ? `${formatTime(activeCandidate.start_seconds)} – ${formatTime(activeCandidate.end_seconds)}` : 'N/A'}
                </p>
              </div>
            )}
          </div>

          {activeCandidate && (
            <div className="rounded-xl border border-border/60 bg-cream/40 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-vireo-green animate-pulse" />
                <span className="font-medium text-foreground">Active Segment Bounds:</span>
                <span className="font-mono text-muted-foreground">
                  {formatTime(activeCandidate.start_seconds)} – {formatTime(activeCandidate.end_seconds)}
                </span>
              </div>
              <span className="font-mono text-muted-foreground font-semibold">
                {Math.round(activeCandidate.duration_seconds)} sec
              </span>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Candidate Details & Actions (3 cols) */}
        {activeCandidate && (
          <div className="lg:col-span-3 space-y-4">
            <div className="card-soft p-5 border-border/80 bg-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-clay" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                    CANDIDATE DETAILS
                  </span>
                </div>
                <span className="rounded-md bg-clay/10 px-2.5 py-0.5 text-xs font-bold text-clay font-mono">
                  {activeCandidate.engagement_score} Clip Score
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold font-display text-foreground leading-snug">
                  {activeCandidate.title}
                </h3>
              </div>

              <div className="space-y-1.5 rounded-xl bg-cream/50 p-3 border border-border/50 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-clay" />
                  Hook Angle
                </span>
                <p className="text-muted-foreground leading-relaxed italic">
                  "{activeCandidate.hook}"
                </p>
              </div>

              {activeCandidate.reason && (
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Lightbulb className="size-3.5 text-sage" />
                    Why Vireo picked it
                  </span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {activeCandidate.reason}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-border/50 pt-3">
                <div className="rounded-lg bg-cream/40 p-2 border border-border/40">
                  <span className="text-muted-foreground block">Category</span>
                  <span className="font-semibold text-foreground capitalize">
                    {activeCandidate.category}
                  </span>
                </div>
                <div className="rounded-lg bg-cream/40 p-2 border border-border/40">
                  <span className="text-muted-foreground block">Duration</span>
                  <span className="font-semibold text-foreground font-mono">
                    {Math.round(activeCandidate.duration_seconds)}s
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2 border-t border-border/50">
                {activeCandidate.status === 'selected' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-vireo-green border-vireo-green/40 hover:bg-vireo-green/5"
                    onClick={() => handleUpdateStatus(activeCandidate.id, 'suggested')}
                  >
                    <Check className="size-3.5 mr-1.5" />
                    Selected (Click to unselect)
                  </Button>
                ) : (
                  <Button
                    variant="clay"
                    size="sm"
                    className="w-full text-xs shadow-clay"
                    onClick={() => handleUpdateStatus(activeCandidate.id, 'selected')}
                  >
                    <CheckCircle2 className="size-3.5 mr-1.5" />
                    Select Clip
                  </Button>
                )}

                {activeCandidate.status !== 'dismissed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleUpdateStatus(activeCandidate.id, 'dismissed')}
                  >
                    <XCircle className="size-3.5 mr-1.5" />
                    Dismiss Candidate
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
