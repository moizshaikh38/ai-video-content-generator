
import type {CandidateCreationInput} from '../../lib/candidateCreationRecovery';
import {candidateRankingDisplay} from '../../../server/src/shared/candidateRankingDisplay';
import { ClipThumbImage } from '../ClipThumbImage';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BTN_PILL_BRAND, BTN_PILL_PRIMARY } from '../../lib/buttonStyles';
import {
  UploadCloud,
  Link2,
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Play,
  Pause,
  Film,
  Sparkles,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Download,
  Share2,
  Loader2,
  RotateCcw,
  Search,
  Coins,
  ClipboardPaste,
} from 'lucide-react';
import { backendRequest } from '../../services/backendClient';
import { projectService } from '../../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../../services/storageService';
import { clipService } from '../../services/clipService';
import { clipRenderService } from '../../services/clipRenderService';
import { CreditService, CreditBalanceSummary, CreditEstimate } from '../../services/creditService';
import { CostTransparencySummary } from '../credits/CostTransparencySummary';
import { clippingStartErrorMessage, projectClippingFailure, transcriptReviewRequired, type ClippingFailure } from '../../lib/clippingRecovery';
import { waitForClipReady } from '../../lib/clipRenderReadiness';
import { triggerBrowserDownload } from '../../utils/downloadUtils';
import { useAuth } from '../../context/AuthContext';
import { Project, ClipCandidate, RenderedClip, ClipPreferences } from '../../types';
import { PublishModal } from '../PublishModal';
import {
  loadSavedClipPreferences,
  saveClipPreferencesToStorage,
  ASPECT_RATIO_OPTIONS,
} from '../clips/ClipPreferencesControl';
import { WhyThisClipSection } from '../clips/WhyThisClipSection';
import { ConfigureClipsPanel } from './ConfigureClipsPanel';

export type WorkflowState =
  | 'no_source'
  | 'source_selected'
  | 'processing'
  | 'clips_ready'
  | 'exporting'
  | 'error';

export type AspectRatioOption = '9:16' | '1:1' | '16:9';
export type DurationPref = 'auto' | '0-30' | '15-30' | '30-60' | '60-90' | '60-120' | '120-180';
export type CaptionLang = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'hi';
export type ClipCountPref = 'auto' | '3' | '5';

interface SelectedSource {
  type: 'file' | 'url' | 'project';
  file?: File;
  url?: string;
  projectId?: string;
  title: string;
  duration?: number;
  thumbnailUrl?: string | null;
  fileSizeFormatted?: string;
}

interface HomeClippingWorkflowProps {
  existingProjects: Project[];
  onRefreshProjects: () => void;
  onScrollToProjects?: () => void;
}


const STORAGE_KEY = 'vireo_home_active_workflow';

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function getYouTubeThumbnail(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId = '';
    if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v') || '';
    } else if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1);
    }
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    return null;
  }
  return null;
}


// Compact supported-source symbol row (mobile): logos stand in for names; each keeps an accessible label.
const YouTubeMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="YouTube">
    <rect x="1" y="4.5" width="22" height="15" rx="4" fill="#ff0033" />
    <polygon points="10,8.8 16,12 10,15.2" fill="#fff" />
  </svg>
);
const TwitchMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Twitch">
    <path fill="#a970ff" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.429l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);
const VimeoMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Vimeo">
    <rect x="1" y="4.5" width="22" height="15" rx="7.5" fill="#17b3e8" />
    <polygon points="10,8.8 16,12 10,15.2" fill="#fff" />
  </svg>
);

// Official current Kick mark (blocky K, simple-icons geometry) in brand green.
const KickMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Kick">
    <path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#53FC18" />
  </svg>
);
// Official Google Drive mark geometry (2020), brand strip colors.
const DriveMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Google Drive">
    <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574z" fill="#4285F4" />
    <path d="M7.25 3.214a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214z" fill="#FBBC04" />
    <path d="M9.509 15.867l-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z" fill="#34A853" />
  </svg>
);
const DropboxMark = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Dropbox">
    <path d="M6 2.5 1.2 5.6 6 8.7 10.8 5.6z" fill="#0061FF" />
    <path d="M18 2.5 13.2 5.6 18 8.7 22.8 5.6z" fill="#0061FF" />
    <path d="M6 15.3 1.2 12.2 6 9.1 10.8 12.2z" fill="#0061FF" />
    <path d="M18 15.3 13.2 12.2 18 9.1 22.8 12.2z" fill="#0061FF" />
    <path d="M6.3 16.4l5.7 3.6 5.7-3.6v1.5L12 21.5l-5.7-3.6z" fill="#0061FF" />
  </svg>
);

// Mobile hero: small cycling platform icons at the link-icon position (the sources URL import actually supports).
// Reduced-motion users get a static link icon instead of the animation.
const PlatformIconCycle = () => (
  <span className="relative size-5 shrink-0 block" aria-hidden="true">
    <YouTubeMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-1" />
    <TwitchMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-2" />
    <VimeoMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-3" />
    <KickMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-4" />
    <DriveMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-5" />
    <DropboxMark className="absolute inset-0 size-5 vireo-hero-logo vireo-hero-logo-6" />
    <Link2 className="absolute inset-0 size-5 text-vc-text-secondary vireo-hero-logo-static" />
  </span>
);

export const HomeClippingWorkflow: React.FC<HomeClippingWorkflowProps> = ({
  existingProjects,
  onRefreshProjects,
  onScrollToProjects,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Workflow State Machine
  const [workflowState, setWorkflowState] = useState<WorkflowState>('no_source');

  // Source selection state
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  // Thumbnail URLs can expire or 404: fall back to the Film icon instead of a broken image.
  const [thumbLoadFailed, setThumbLoadFailed] = useState(false);
  useEffect(() => {
    setThumbLoadFailed(false);
  }, [selectedSource?.thumbnailUrl]);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState('');
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isBrowseModalOpen, setIsBrowseModalOpen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');

  // Configuration options state
  const [clipPreferences, setClipPreferences] = useState<ClipPreferences>(() => loadSavedClipPreferences());
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(
    () => (loadSavedClipPreferences().aspectRatio as AspectRatioOption) || '9:16'
  );
  const [durationPref, setDurationPref] = useState<DurationPref>(
    () => (loadSavedClipPreferences().preferredDurations as DurationPref) || 'auto'
  );
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const captionLang = clipPreferences.sourceLanguage || 'auto';
  const setCaptionLang = (value:string) => setClipPreferences(prev => {const next={...prev,sourceLanguage:value};saveClipPreferencesToStorage(next);return next;});
  const [estimateRetry, setEstimateRetry] = useState(0);
  const [clipCount, setClipCount] = useState<ClipCountPref>(() => {
    const count = loadSavedClipPreferences().targetClipCount;
    return count === 3 || count === 5 ? String(count) as ClipCountPref : 'auto';
  });
  const handleClipCountChange = (value: ClipCountPref) => {
    setClipCount(value);
    setClipPreferences(previous => {
      const next = { ...previous, targetClipCount: value === 'auto' ? undefined : Number(value) };
      saveClipPreferencesToStorage(next);
      return next;
    });
  };
  const [customInstructions, setCustomInstructions] = useState(
    () => loadSavedClipPreferences().customInstructions || ''
  );

  const handlePreferencesChange = (newPrefs: ClipPreferences) => {
    setClipPreferences(newPrefs);
    setAspectRatio(newPrefs.aspectRatio as AspectRatioOption);
    setDurationPref(newPrefs.preferredDurations as DurationPref);
    setCustomInstructions(newPrefs.customInstructions || '');
    setClipCount(newPrefs.targetClipCount === 3 || newPrefs.targetClipCount === 5 ? String(newPrefs.targetClipCount) as ClipCountPref : 'auto');
    saveClipPreferencesToStorage(newPrefs);
  };

  // Processing & Job state
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const setActiveProjectId = (projectId: string | null) => {
    if (projectId !== activeProjectIdRef.current) {
      resultReadSequenceRef.current++;
      workflowSessionRef.current++;
      exportRequestRef.current?.abort();
      setCreationRecoveryTarget(null);
    }
    activeProjectIdRef.current = projectId;
    setActiveProjectIdState(projectId);
  };
  const [activeProjectStatus, setActiveProjectStatus] = useState<string>('idle');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [processingStageMessage, setProcessingStageMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessageValue] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const setErrorMessage = (message: string | null) => {
    setErrorMessageValue(message);
    setErrorCode(null);
  };
  const setClippingFailure = (failure: ClippingFailure) => {
    setErrorMessageValue(clippingStartErrorMessage(failure));
    setErrorCode(failure.code || null);
  };
  const needsTranscriptReview = transcriptReviewRequired({ code: errorCode });

  // Recovery help must match the actual failure cause, not assume one source.
  // Upload formats mirror storageService.validateVideoFile; no size promise here.
  const uploadFallbackHelp = errorCode === 'CLOUD_FILE_LINK_REQUIRED'
    ? 'This link points to a folder or document, not a video file. Open the video in your cloud drive, share the video file itself, and paste that file link. You can also upload the video file directly (MP4, MOV or WebM) to continue clipping with AI transcription.'
    : errorCode?.startsWith('YOUTUBE_')
      ? 'If YouTube restricts automated downloads for this video, you can upload the video file directly (MP4, MOV or WebM) to continue clipping with full AI transcription.'
      : 'You can upload the video file directly (MP4, MOV or WebM) to continue clipping with AI transcription.';

  // Results state
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [renderedClips, setRenderedClips] = useState<RenderedClip[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  // Simplified results design (user-approved 2026-11-20): filter chips + conditional bottom bar
  const [resultsFilter, setResultsFilter] = useState<'all' | 'potential' | 'short' | 'long'>('all');
  const renderedClipScore = (clip: { candidate_id?: string | null }): number | null => {
    const cand = candidates.find((c) => c.id === clip.candidate_id);
    return cand ? candidateRankingDisplay(cand) : null;
  };
  const resultsFilterMatches = (dur: number, score: number | null): boolean => {
    if (resultsFilter === 'potential') return score !== null && score >= 80;
    if (resultsFilter === 'short') return dur < 45;
    if (resultsFilter === 'long') return dur >= 45;
    return true;
  };
  const resultsFilterCounts = {
    all: candidates.length + renderedClips.length,
    potential:
      candidates.filter((c) => { const s = candidateRankingDisplay(c); return s !== null && s >= 80; }).length +
      renderedClips.filter((cl) => { const s = renderedClipScore(cl); return s !== null && s >= 80; }).length,
    short: candidates.filter((c) => c.duration_seconds < 45).length + renderedClips.filter((cl) => cl.duration_seconds < 45).length,
    long: candidates.filter((c) => c.duration_seconds >= 45).length + renderedClips.filter((cl) => cl.duration_seconds >= 45).length,
  };
  const filteredRenderedClips = renderedClips.filter((cl) => resultsFilterMatches(cl.duration_seconds, renderedClipScore(cl)));
  const filteredCandidates = candidates.filter((c) => resultsFilterMatches(c.duration_seconds, candidateRankingDisplay(c)));
  const firstSelectedId = selectedClipIds.size > 0 ? Array.from(selectedClipIds)[0] : null;
  const selectedTotalSeconds = [...candidates, ...renderedClips]
    .filter((x) => selectedClipIds.has(x.id))
    .reduce((a, x) => a + (x.duration_seconds || 0), 0);
  const [activePreviewClipId, setActivePreviewClipId] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [sourceVideoStreamingUrl, setSourceVideoStreamingUrl] = useState<string | null>(null);
  const [clipSignedPreviewUrls, setClipSignedPreviewUrls] = useState<Record<string, string>>({});

  // Export & Publish modal state
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [isExportingClipId, setIsExportingClipId] = useState<string | null>(null);
  const [publishingClip, setPublishingClip] = useState<RenderedClip | null>(null);

  // Credit state
  const [walletBalance, setWalletBalance] = useState<CreditBalanceSummary | null>(null);
  const [creditEstimate, setCreditEstimate] = useState<CreditEstimate | null>(null);
  const [isCreditEstimateLoading, setIsCreditEstimateLoading] = useState(false);

  const loadWalletBalance = async () => {
    if (!user) return;
    try {
      const summary = await CreditService.getWalletBalance();
      setWalletBalance(summary);
    } catch {
      // Best-effort
    }
  };

  useEffect(() => {
    loadWalletBalance();
    const handleUpdate = () => loadWalletBalance();
    window.addEventListener('vireo_credit_updated', handleUpdate);
    window.addEventListener('vireo_project_updated', handleUpdate);
    return () => {
      window.removeEventListener('vireo_credit_updated', handleUpdate);
      window.removeEventListener('vireo_project_updated', handleUpdate);
    };
  }, [user]);

  // A late estimate for a replaced source must never unlock the new source.
  useEffect(() => {
    let cancelled = false;
    setCreditEstimate(null);
    if (!selectedSource || !user) {
      setIsCreditEstimateLoading(false);
      return;
    }
    const duration = selectedSource.duration && selectedSource.duration > 0 ? selectedSource.duration : 60;
    const isReused = selectedSource.type === 'project' && (activeProjectStatus === 'transcribed' || activeProjectStatus === 'completed');
    setIsCreditEstimateLoading(true);
    CreditService.estimateOperation('core_video_processing', duration, isReused)
      .then(est => { if (!cancelled) setCreditEstimate(est); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setIsCreditEstimateLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSource, user, activeProjectStatus, estimateRetry]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsSubmitting(false);
  };
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const pendingPreviewStartRef = useRef<number | null>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const exportRequestRef = useRef<AbortController | null>(null);
  const [creationRecoveryTarget,setCreationRecoveryTarget]=useState<{projectId:string;input:CandidateCreationInput}|null>(null);
  const candidateExportsRef = useRef(new Map<string, string>());
  const postProcessingProjectsRef = useRef(new Set<string>());
  const resultReadSequenceRef = useRef(0);
  const workflowSessionRef = useRef(0);
  useEffect(() => () => { resultReadSequenceRef.current++; workflowSessionRef.current++; abortControllerRef.current?.abort(); abortControllerRef.current = null; }, []);
  useEffect(() => () => { exportRequestRef.current?.abort(); }, [activeProjectId, workflowState]);

  // Reload only looks up a saved creation identity, never prepares or admits.
  useEffect(()=>{candidateExportsRef.current.clear();setCreationRecoveryTarget(null);},[user?.id]);
  useEffect(()=>{
    let cancelled=false;
    if(!activeProjectId||!user?.id)return;
    const projectId=activeProjectId,session=workflowSessionRef.current;
    void(async()=>{try{let recovered=false;
      const inputs=await clipRenderService.listCandidateCreations(projectId);
      for(const input of inputs){
        if(cancelled||session!==workflowSessionRef.current)return;
        try{const result=await clipRenderService.recoverCandidateCreation(projectId,input);if(result)recovered=true;}
        catch(error:any){if(!cancelled&&session===workflowSessionRef.current){setCreationRecoveryTarget({projectId,input});setErrorMessage(error.message||'Saved creation recovery is unavailable. No clip was created on reload.');setWorkflowState('error');}return;}
      }
      if(recovered&&!cancelled&&session===workflowSessionRef.current)await loadResults(projectId,true);
    }catch(error:any){if(!cancelled&&session===workflowSessionRef.current){setErrorMessage(error.message||'Saved creation requests could not be listed.');setWorkflowState('error');}}})();
    return()=>{cancelled=true;};
  },[activeProjectId,user?.id]);
  const handleResolveCreation=async()=>{
    const target=creationRecoveryTarget;if(!target||target.projectId!==activeProjectId||exportRequestRef.current)return;
    const request=new AbortController();exportRequestRef.current=request;
    try{const result=await clipRenderService.closeCandidateCreation(target.projectId,target.input);
      if(request.signal.aborted)return;
      setCreationRecoveryTarget(null);
      if(result)navigate(`/clips/${result.clip.id}/edit`);
      else{setErrorMessage(null);setWorkflowState('clips_ready');}
    }catch(error:any){if(!request.signal.aborted)setErrorMessage(error.message||'Saved creation could not be resolved. Its identity was kept.');}
    finally{if(exportRequestRef.current===request)exportRequestRef.current=null;}
  };

  // 1. Persistence Recovery: Check localStorage on Mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (!savedRaw) return;
      const saved = JSON.parse(savedRaw);
      if (saved && saved.projectId && Date.now() - (saved.timestamp || 0) < 24 * 60 * 60 * 1000) {
        setActiveProjectId(saved.projectId);
        if (saved.aspectRatio) setAspectRatio(saved.aspectRatio);
        if (saved.durationPref) setDurationPref(saved.durationPref);
        if (saved.captionsEnabled !== undefined) setCaptionsEnabled(saved.captionsEnabled);
        if (saved.captionLang && !loadSavedClipPreferences().sourceLanguage) setCaptionLang(saved.captionLang);
        if (saved.customInstructions) setCustomInstructions(saved.customInstructions);

        // Fetch project and restore state only while this saved selection is current.
        const session = workflowSessionRef.current;
        projectService.fetchProject(saved.projectId).then((proj) => {
          if (!proj || session !== workflowSessionRef.current) return;
          if (proj.clip_preferences) handlePreferencesChange(proj.clip_preferences);
          const captionMode = proj.notes?.match(/\[Captions:\s*([^\]]+)\]/i)?.[1]?.trim();
          if (captionMode) setCaptionsEnabled(captionMode !== 'off');
          const status = proj.video_status || proj.status;
          setSelectedSource({
            type: 'project',
            projectId: proj.id,
            title: proj.title,
            thumbnailUrl: null,
          });

          if (!proj.source_url && status === 'uploading') {
            setSelectedSource(null);
            setWorkflowState('error');
            setErrorMessage('The previous upload did not finish. Select the video file again to continue.');
          } else if (status === 'uploaded') {
            setActiveProjectStatus(status);
            setWorkflowState('source_selected');
          } else if (['queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(status)) {
            setWorkflowState('processing');
            setActiveProjectStatus(status);
          } else if (['completed', 'transcribed'].includes(status)) {
            const isReview = searchParams.get('view') === 'review';
            loadResults(proj.id, isReview);
          } else if (status === 'failed') {
            setWorkflowState('error');
            setClippingFailure(projectClippingFailure(proj));
          }
        }).catch(() => {
          if (session !== workflowSessionRef.current) return;
          localStorage.removeItem(STORAGE_KEY);
        });
      }
    } catch {
      // Local storage parse error ignored
    }
  }, []);

  // Update local storage when active project ID changes
  useEffect(() => {
    if (activeProjectId && workflowState !== 'no_source') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          projectId: activeProjectId,
          aspectRatio,
          durationPref,
          captionsEnabled,
          captionLang,
          customInstructions,
          timestamp: Date.now(),
        })
      );
    } else if (workflowState === 'no_source') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeProjectId, workflowState, aspectRatio, durationPref, captionsEnabled, captionLang, customInstructions]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (localVideoPreviewUrl) {
        URL.revokeObjectURL(localVideoPreviewUrl);
      }
    };
  }, [localVideoPreviewUrl]);

  // 2. Fetch project source preview URL whenever active project changes
  useEffect(() => {
    let isMounted = true;
    setSourceVideoStreamingUrl(null);
    if (!activeProjectId) {
      setSourceVideoStreamingUrl(null);
      return;
    }
    backendRequest<{ signedUrl: string }>(`/projects/${activeProjectId}/source-preview-url`)
      .then((data) => {
        if (isMounted && data?.signedUrl) {
          setSourceVideoStreamingUrl(data.signedUrl);
        }
      })
      .catch(() => {
        if (isMounted) setSourceVideoStreamingUrl(null);
      });
    return () => {
      isMounted = false;
    };
  }, [activeProjectId]);

  // 3. Polling Loop while in 'processing' state
  useEffect(() => {
    if (workflowState !== 'processing' || !activeProjectId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const proj = await projectService.fetchProject(activeProjectId);
        if (!proj || !isMounted) return;

        const status = proj.video_status || proj.status;
        setActiveProjectStatus(status);

        if (status === 'queued') {
          setProcessingStageMessage('Job queued in processing pipeline...');
        } else if (status === 'processing' || status === 'transcribing') {
          setProcessingStageMessage('Transcribing the video speech...');
        } else if (status === 'analyzing') {
          setProcessingStageMessage('Analyzing transcript and ranking viral hooks...');
        } else if (status === 'generating') {
          setProcessingStageMessage('Generating clips and applying smart aspect framing...');
        } else if (status === 'completed' || status === 'transcribed') {
          // If transcribed, automatically run AI clip analysis if candidates don't exist yet
          clearInterval(interval);
          setProcessingStageMessage('Finishing clip generation...');
          await handlePostProcessingReady(activeProjectId);
        } else if (status === 'failed') {
          clearInterval(interval);
          setWorkflowState('error');
          setClippingFailure(projectClippingFailure(proj));
        }
      } catch (err: any) {
        // Polling failure, will retry next interval
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [workflowState, activeProjectId]);

  const handleBackToHome = () => {
    cancelGeneration();
    resultReadSequenceRef.current++;
    workflowSessionRef.current++;
    exportRequestRef.current?.abort();
    navigate('/dashboard', { replace: false });
    setWorkflowState('no_source');
  };

  const handleOpenReview = (projectId?: string | null) => {
    const targetId = projectId || activeProjectId;
    if (!targetId) return;
    navigate(`/dashboard?view=review&project=${targetId}`, { replace: false });
    setWorkflowState('clips_ready');
  };

  // Listen for Home sidebar/logo click to return cleanly to Home view
  useEffect(() => {
    const handleNavigateHome = () => {
      cancelGeneration();
      resultReadSequenceRef.current++;
      workflowSessionRef.current++;
      exportRequestRef.current?.abort();
      navigate('/dashboard', { replace: false });
      setWorkflowState('no_source');
    };
    window.addEventListener('vireo_navigate_home', handleNavigateHome);
    return () => window.removeEventListener('vireo_navigate_home', handleNavigateHome);
  }, [navigate]);

  // Handle browser Back and Forward navigation between Review and Home views
  useEffect(() => {
    const isReview = searchParams.get('view') === 'review';
    const projId = searchParams.get('project');

    if (isReview) {
      const targetId = projId || activeProjectId;
      if (targetId) {
        if (targetId !== activeProjectId) {
          setActiveProjectId(targetId);
        }
        loadResults(targetId, true);
      }
    } else {
      if (workflowState === 'clips_ready') {
        resultReadSequenceRef.current++;
        workflowSessionRef.current++;
        exportRequestRef.current?.abort();
        setWorkflowState('no_source');
      }
    }
  }, [searchParams]);

  const loadResults = async (projectId: string, forceShowReview = false) => {
    const sequence = ++resultReadSequenceRef.current;
    try {
      const [candData, clipsData] = await Promise.all([
        clipService.getClipCandidates(projectId),
        clipRenderService.getProjectClips(projectId),
      ]);

      if (sequence !== resultReadSequenceRef.current) return;
      setCandidates(candData || []);
      setRenderedClips(clipsData || []);

      const hasResults = (candData && candData.length > 0) || (clipsData && clipsData.length > 0);
      const isReviewUrl = searchParams.get('view') === 'review';

      if (hasResults && (forceShowReview || isReviewUrl)) {
        setWorkflowState('clips_ready');
        // Pre-select the top clip for preview
        const firstId = clipsData?.[0]?.id || candData?.[0]?.id || null;
        if (firstId) {
          setActivePreviewClipId(firstId);
        }
      } else if (!hasResults && forceShowReview) {
        // A completed analysis can legitimately return nothing. Make that
        // outcome explicit rather than quietly inviting another paid run.
        setErrorMessage('No suitable standalone moment was found in this video. Your source is saved. Try a longer video with a complete thought, or choose another source.');
        setWorkflowState('error');
      }
    } catch {
      if (sequence !== resultReadSequenceRef.current) return;
      // A failed read says nothing about whether saved results exist.
      // Do not send the user back to generation or claim an empty analysis.
      setErrorMessage('Could not load your saved clips. Your project is saved. Reopen its review to try loading again; no new generation was started.');
      setWorkflowState('error');
    }
  };

  const handlePostProcessingReady = async (projectId: string) => {
    if (postProcessingProjectsRef.current.has(projectId)) return;
    postProcessingProjectsRef.current.add(projectId);
    const session = workflowSessionRef.current;
    try {
      // Check if candidates already exist
      const existingCandidates = await clipService.getClipCandidates(projectId);
      if (session !== workflowSessionRef.current) return;
      if (existingCandidates.length === 0) {
        // Trigger clip analysis
        setProcessingStageMessage('Extracting viral clip moments...');
        const promptText = [
          durationPref !== 'auto' ? `Duration preference: ${durationPref} seconds.` : '',
          customInstructions.trim(),
        ].filter(Boolean).join(' ');

        await clipService.analyzeClips(projectId, promptText || undefined, clipPreferences);
      }
      if (session !== workflowSessionRef.current) return;
      navigate(`/dashboard?view=review&project=${projectId}`, { replace: false });
      await loadResults(projectId, true);
      onRefreshProjects();
      loadWalletBalance();
      window.dispatchEvent(new CustomEvent('vireo_credit_updated'));
    } catch (err: any) {
      if (session !== workflowSessionRef.current) return;
      setWorkflowState('error');
      setClippingFailure(err);
    } finally {
      postProcessingProjectsRef.current.delete(projectId);
    }
  };

  // -------------------------------------------------------------
  // SOURCE SELECTION HANDLERS
  // -------------------------------------------------------------

  const handlePickFile = (file?: File) => {
    if (!file) return;

    // Validate using storageService rules
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please select a valid video file.');
      setWorkflowState('error');
      return;
    }

    if (localVideoPreviewUrl) {
      URL.revokeObjectURL(localVideoPreviewUrl);
    }

    resultReadSequenceRef.current++;
    workflowSessionRef.current++;
    setActiveProjectId(null);
    cancelGeneration();
    const objectUrl = URL.createObjectURL(file);
    setLocalVideoPreviewUrl(objectUrl);
    setErrorMessage(null);
    setUrlValidationError(null);

    const source: SelectedSource = {
      type: 'file',
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      fileSizeFormatted: formatBytes(file.size),
      thumbnailUrl: null,
    };

    // Load duration from offscreen video element
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      // Metadata may arrive after upload has started. Keep its project ID,
      // and never resurrect an old selection after replacement/cancellation.
      setSelectedSource((current) => current?.type === 'file' && current.file === file
        ? { ...current, duration }
        : current);
    };
    tempVideo.src = objectUrl;

    setSelectedSource(source);
    setWorkflowState('source_selected');
  };

  const selectUrlSource = (trimmed: string): boolean => {
    setUrlValidationError(null);
    setErrorMessage(null);

    if (!trimmed) {
      setUrlValidationError('Please paste a supported video URL.');
      return false;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported.');
      }
    } catch {
      setUrlValidationError('Please enter a valid HTTP or HTTPS video URL.');
      return false;
    }

    resultReadSequenceRef.current++;
    workflowSessionRef.current++;
    setActiveProjectId(null);
    cancelGeneration();
    // Determine title and thumbnail
    const ytThumb = getYouTubeThumbnail(trimmed);
    let title = 'Imported Video';
    if (parsedUrl.hostname.includes('youtube') || parsedUrl.hostname.includes('youtu.be')) {
      title = 'YouTube Video';
    } else {
      const pathName = parsedUrl.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
      if (pathName) title = decodeURIComponent(pathName);
    }

    setSelectedSource({
      type: 'url',
      url: trimmed,
      title,
      thumbnailUrl: ytThumb,
    });
    setWorkflowState('source_selected');
    return true;
  };

  const handleUrlSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    selectUrlSource(inputUrl.trim());
  };

  // Static tools-pages handoff: /dashboard?url=<video-url>&tool=<captions|reframe|gaming-clips>.
  // Opens the same Configure state as pressing Continue with URL. The link is kept in
  // memory only (no storage/history writes), no processing starts and Generate stays manual.
  // tool only preselects matching Configure settings for this session; it does not open a
  // separate tool experience.
  const toolHandoffRef = useRef(false);
  useEffect(() => {
    if (toolHandoffRef.current) return;
    const incoming = (searchParams.get('url') || '').trim();
    if (!incoming) return;
    if (searchParams.get('project') || searchParams.get('view')) return;
    toolHandoffRef.current = true;
    if (!selectUrlSource(incoming)) return;
    setInputUrl(incoming);
    const tool = searchParams.get('tool');
    if (tool === 'gaming-clips') {
      setClipPreferences((prefs) => ({ ...prefs, genre: 'gaming', genreSelectionMode: 'manual' }));
    } else if (tool === 'captions') {
      setCaptionsEnabled(true);
    } else if (tool === 'reframe') {
      setClipPreferences((prefs) => ({
        ...prefs,
        framingDefaults: { version: 1, layout: 'auto', autoReframe: true },
      }));
    }
  }, [searchParams]);


  const handleSelectExistingProject = (proj: Project) => {
    cancelGeneration();
    setIsBrowseModalOpen(false);
    setErrorMessage(null);
    setActiveProjectId(proj.id);

    if (proj.clip_preferences) handlePreferencesChange(proj.clip_preferences);

    // If previous job has an audio language configured in its notes, restore it
    const notesText = (proj.notes || (proj as any).description || '') as string;
    const savedCaptionMode = notesText.match(/\[Captions:\s*([^\]]+)\]/i)?.[1]?.trim();
    if (savedCaptionMode) setCaptionsEnabled(savedCaptionMode !== 'off');
    if (notesText && !proj.clip_preferences?.sourceLanguage) {
      const match = notesText.match(/\[Captions:\s*([^\]]+)\]/i);
      if (match && match[1]) {
        const lang = match[1].trim();
        if (['auto', 'en', 'es', 'fr', 'de', 'hi'].includes(lang)) {
          setCaptionLang(lang as CaptionLang);
        }
      }
    }

    const status = proj.video_status || proj.status;
    setSelectedSource({
      type: 'project',
      projectId: proj.id,
      title: proj.title,
      thumbnailUrl: null,
    });

    if (['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(status)) {
      setWorkflowState('processing');
      setActiveProjectStatus(status);
    } else if (['completed', 'transcribed'].includes(status)) {
      loadResults(proj.id);
    } else {
      setWorkflowState('source_selected');
    }
  };

  const handleReplaceSource = () => {
    cancelGeneration();
    if (localVideoPreviewUrl) {
      URL.revokeObjectURL(localVideoPreviewUrl);
      setLocalVideoPreviewUrl(null);
    }
    setSelectedSource(null);
    setActiveProjectId(null);
    setInputUrl('');
    setErrorMessage(null);
    setUrlValidationError(null);
    setCandidates([]);
    setRenderedClips([]);
    setSelectedClipIds(new Set());
    setActivePreviewClipId(null);
    setIsPlayingPreview(false);
    setWorkflowState('no_source');
    localStorage.removeItem(STORAGE_KEY);
  };

  // -------------------------------------------------------------
  // GENERATE CLIPS PIPELINE EXECUTION
  // -------------------------------------------------------------

  const handleGenerateClips = async () => {
    if (needsTranscriptReview || isSubmitting || abortControllerRef.current || !selectedSource || isCreditEstimateLoading || !creditEstimate?.has_sufficient_credits) return;

    if (!user) {
      setErrorMessage('Please sign in to generate clips with AI.');
      setWorkflowState('error');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const isCurrentRequest = () => abortControllerRef.current === abortController && !abortController.signal.aborted;

    try {
      let projectId = selectedSource.projectId;

      // 1. Direct File Upload Flow
      if (selectedSource.type === 'file' && selectedSource.file) {
        projectId = selectedSource.projectId || crypto.randomUUID();
        setActiveProjectId(projectId);
        setWorkflowState('processing');
        setActiveProjectStatus('uploading');
        setUploadProgress(0);
        setProcessingStageMessage('Uploading video to high-speed storage...');

        const notes = [
          `[Aspect: ${clipPreferences.aspectRatio}]`,
          `[Duration: ${clipPreferences.preferredDurations}]`,
          `[Genre: ${clipPreferences.genre}]`,
          `[Goal: ${clipPreferences.contentGoal}]`,
          clipPreferences.topicKeywords?.length ? `[Topics: ${clipPreferences.topicKeywords.join(', ')}]` : '',
          `[Captions: ${captionsEnabled ? captionLang : 'off'}]`,
          `[Clips: ${clipCount}]`,
          clipPreferences.customInstructions?.trim() || '',
        ].filter(Boolean).join(' ');

        // Reuse a created upload session after transfer failure, rather than
        // consuming another project slot on every retry.
        if (!selectedSource.projectId) {
          await projectService.createProjectAsync({
            id: projectId,
            userId: user.id,
            title: selectedSource.title,
            sourceType: 'upload',
            videoStatus: 'uploading',
            notes,
            clip_preferences: clipPreferences,
          });
          if (!isCurrentRequest()) return;
          setSelectedSource({ ...selectedSource, projectId });
        }

        // Upload to storage with byte progress
        await uploadVideoFile({
          file: selectedSource.file,
          projectId,
          onProgress: (pct) => { if (isCurrentRequest()) setUploadProgress(pct); },
          signal: abortController.signal,
        });

        if (!isCurrentRequest()) return;
        setUploadProgress(100);
        // Confirmation makes this a reusable project source. A later processing
        // failure must not create another project or upload these bytes again.
        setSelectedSource({ ...selectedSource, type: 'project', projectId, file: undefined });
        setActiveProjectStatus('uploaded');
        onRefreshProjects();
        setProcessingStageMessage('Starting AI transcription & video analysis...');

        // Start backend processing
        await projectService.startProcessing(projectId);
        if (!isCurrentRequest()) return;
        setActiveProjectStatus('processing');
        onRefreshProjects();
      }
      // 2. URL Ingestion Flow
      else if (selectedSource.type === 'url' && selectedSource.url) {
        setWorkflowState('processing');
        setActiveProjectStatus('uploading');
        setProcessingStageMessage('Ingesting and analyzing media from URL...');

        const notes = [
          `[Aspect: ${clipPreferences.aspectRatio}]`,
          `[Duration: ${clipPreferences.preferredDurations}]`,
          `[Genre: ${clipPreferences.genre}]`,
          `[Goal: ${clipPreferences.contentGoal}]`,
          clipPreferences.topicKeywords?.length ? `[Topics: ${clipPreferences.topicKeywords.join(', ')}]` : '',
          `[Captions: ${captionsEnabled ? captionLang : 'off'}]`,
          `[Clips: ${clipCount}]`,
          clipPreferences.customInstructions?.trim() || '',
        ].filter(Boolean).join(' ');

        const proj = await projectService.ingestProjectUrlAsync({
          url: selectedSource.url,
          title: selectedSource.title,
          notes,
          clip_preferences: clipPreferences,
        });

        if (!isCurrentRequest()) return;
        projectId = proj.id;
        setActiveProjectId(projectId);
        setSelectedSource({ ...selectedSource, type: 'project', projectId });
        setActiveProjectStatus('uploaded');
        onRefreshProjects();
        setProcessingStageMessage('Queuing video for AI transcription...');

        await projectService.startProcessing(projectId);
        if (!isCurrentRequest()) return;
        setActiveProjectStatus('processing');
        onRefreshProjects();
      }
      // 3. Existing Project Flow
      else if (selectedSource.type === 'project' && projectId) {
        setWorkflowState('processing');
        const proj = await projectService.fetchProject(projectId);
        if (!isCurrentRequest()) return;
        if (!proj) throw new Error('This saved project could not be loaded. Reopen it before starting processing.');
        const notes = (proj?.notes || '').replace(/\[Captions:\s*[^\]]+\]/gi, '').trim();
        await projectService.updateProjectAsync(projectId, {clip_preferences:clipPreferences, notes:`${notes} [Captions: ${captionsEnabled ? captionLang : 'off'}]`});
        if (!isCurrentRequest()) return;
        const currentStatus = proj?.video_status || proj?.status || 'idle';

        if (['completed', 'transcribed'].includes(currentStatus)) {
          // Project already transcribed, directly trigger AI clip analysis
          setProcessingStageMessage('Analyzing speech patterns and finding viral moments...');
          await handlePostProcessingReady(projectId);
        } else {
          // Start or resume processing
          setProcessingStageMessage('Processing video with AI...');
          await projectService.startProcessing(projectId);
          if (!isCurrentRequest()) return;
          setActiveProjectStatus('processing');
        }
      }
    } catch (err: any) {
      if (!isCurrentRequest()) return;
      loadWalletBalance();
      setClippingFailure(err);
      setWorkflowState('error');
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        if (!abortController.signal.aborted) setIsSubmitting(false);
      }
    }
  };

  // -------------------------------------------------------------
  // CLIPS ACTIONS: PLAYBACK, SELECTION, EDIT & EXPORT
  // -------------------------------------------------------------

  const handleSelectClip = (id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllClips = () => {
    const allIds = [
      ...renderedClips.map((c) => c.id),
      ...candidates.map((c) => c.id),
    ];
    if (selectedClipIds.size === allIds.length) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(allIds));
    }
  };

  const handlePlayClipPreview = async (clipId: string, startSeconds: number) => {
    setActivePreviewClipId(clipId);
    setPreviewUnavailable(false);

    // If rendered clip with ready status, fetch its signed preview URL
    const rendered = renderedClips.find((c) => c.id === clipId);
    let hasClipUrl = Boolean(clipSignedPreviewUrls[clipId]);
    let freshClipUrl: string | undefined;
    if (rendered && rendered.render_status === 'ready' && !clipSignedPreviewUrls[clipId]) {
      try {
        const url = await clipRenderService.getPreviewUrl(clipId);
        setClipSignedPreviewUrls((prev) => ({ ...prev, [clipId]: url }));
        freshClipUrl = url;
        hasClipUrl = true;
      } catch {
        // Fall back to source video seeking
      }
    }
    if (!hasClipUrl && !sourceVideoStreamingUrl && !localVideoPreviewUrl) {
      setPreviewUnavailable(true);
      return;
    }

    // A rendered clip file starts at 0. The full source needs the clip's source time.
    const clipUrl = clipSignedPreviewUrls[clipId] || (hasClipUrl ? freshClipUrl : undefined);
    const targetSrc = clipUrl || sourceVideoStreamingUrl || localVideoPreviewUrl || '';
    const targetStart = clipUrl ? 0 : startSeconds;
    const video = videoPlayerRef.current;
    if (video && video.getAttribute('src') === targetSrc && video.readyState >= 1) {
      pendingPreviewStartRef.current = null;
      video.currentTime = targetStart;
      video.play().then(() => setIsPlayingPreview(true)).catch(() => setIsPlayingPreview(false));
    } else {
      // The source is about to change, which resets the element. Start once it has loaded.
      pendingPreviewStartRef.current = targetStart;
    }
  };

  const handlePreviewLoadedMetadata = () => {
    const video = videoPlayerRef.current;
    const start = pendingPreviewStartRef.current;
    if (!video || start === null) return;
    pendingPreviewStartRef.current = null;
    video.currentTime = start;
    video.play().then(() => setIsPlayingPreview(true)).catch(() => setIsPlayingPreview(false));
  };

  const handlePreviewError = () => {
    // The rendered clip file failed to load: fall back to the source at the clip's start time.
    const id = activePreviewClipId;
    if (!id || !clipSignedPreviewUrls[id]) {
      if (activePreviewClipId) setPreviewUnavailable(true);
      return;
    }
    const clipStart = renderedClips.find((c) => c.id === id)?.start_seconds ?? candidates.find((c) => c.id === id)?.start_seconds ?? 0;
    setClipSignedPreviewUrls((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (sourceVideoStreamingUrl || localVideoPreviewUrl) pendingPreviewStartRef.current = clipStart;
    else setPreviewUnavailable(true);
  };

  const handleTogglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (isPlayingPreview) {
      videoPlayerRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      videoPlayerRef.current.play().then(() => {
        setIsPlayingPreview(true);
      }).catch(() => {});
    }
  };

  // Edit clip: Navigates to existing Clip Editor with real clip ID
  const handleEditClip = async (clipId: string, isCandidate: boolean) => {
    if (!activeProjectId) return;

    if (!isCandidate) {
      navigate(`/clips/${clipId}/edit`);
      return;
    }
    if (exportRequestRef.current) return;
    const request = new AbortController();
    exportRequestRef.current = request;
    try {
      setExportStatusMessage('Opening editor for clip...');
      const key = JSON.stringify([activeProjectId, clipId, aspectRatio, captionsEnabled, clipPreferences.captionStyle]);
      let targetClipId = candidateExportsRef.current.get(key);
      if (!targetClipId) {
        const input:CandidateCreationInput={candidateId:clipId,aspectRatio,cropMode:'smart',caption_enabled:captionsEnabled,caption_style:clipPreferences.captionStyle,caption_config:clipPreferences.captionStyle?{presetId:clipPreferences.captionStyle}:undefined};
        setCreationRecoveryTarget({projectId:activeProjectId,input});
        const res = await clipRenderService.createClipFromCandidate(activeProjectId, clipId, aspectRatio, 'smart', {caption_enabled:captionsEnabled,caption_style:clipPreferences.captionStyle,caption_config:clipPreferences.captionStyle?{presetId:clipPreferences.captionStyle}:undefined});
        if(!request.signal.aborted)setCreationRecoveryTarget(null);
        targetClipId = res.clip.id;
        candidateExportsRef.current.set(key, targetClipId);
      }
      if (!request.signal.aborted) navigate(`/clips/${targetClipId}/edit`);
    } catch (err: any) {
      if (!request.signal.aborted) {
        setErrorMessage(err.message || 'Failed to prepare clip for editor.');
        setWorkflowState('error');
      }
    } finally {
      if (exportRequestRef.current === request) {
        exportRequestRef.current = null;
        setExportStatusMessage(null);
      }
    }
  };

  // Export clip: Triggers signed download via clipRenderService
  const handleExportClip = async (clipId: string, isCandidate: boolean): Promise<boolean> => {
    if (!activeProjectId || exportRequestRef.current) return false;
    const request = new AbortController();
    exportRequestRef.current = request;
    setIsExportingClipId(clipId);
    setExportStatusMessage('Preparing high-quality export...');

    try {
      let targetClipId = clipId;
      if (isCandidate) {
        // Keep the same queued render on a wait timeout or download failure.
        // A changed generation configuration gets its own render instead.
        const key = JSON.stringify([activeProjectId, clipId, aspectRatio, captionsEnabled, clipPreferences.captionStyle]);
        const existing = candidateExportsRef.current.get(key);
        if (existing) targetClipId = existing;
        else {
          const input:CandidateCreationInput={candidateId:clipId,aspectRatio,cropMode:'smart',caption_enabled:captionsEnabled,caption_style:clipPreferences.captionStyle,caption_config:clipPreferences.captionStyle?{presetId:clipPreferences.captionStyle}:undefined};
          setCreationRecoveryTarget({projectId:activeProjectId,input});
          const created = await clipRenderService.createClipFromCandidate(activeProjectId, clipId, aspectRatio, 'smart', {caption_enabled:captionsEnabled,caption_style:clipPreferences.captionStyle,caption_config:clipPreferences.captionStyle?{presetId:clipPreferences.captionStyle}:undefined});
          if(!request.signal.aborted)setCreationRecoveryTarget(null);
          targetClipId = created.clip.id;
          candidateExportsRef.current.set(key, targetClipId);
        }
      }
      await waitForClipReady(targetClipId, {
        signal: request.signal,
        readClip: (id, signal) => clipRenderService.getClip(id, signal),
        onProgress: (clip) => setExportStatusMessage(clip.render_status === 'ready' ? 'Preparing download...' : `Rendering clip: ${clip.render_status}...`),
      });
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(targetClipId);
      if (request.signal.aborted) return false;
      if (!signedUrl) throw new Error('The download is not available yet. Your clip is saved.');
      await triggerBrowserDownload(signedUrl, filename || `vireoclip-${targetClipId.slice(0, 8)}.mp4`);
      setExportStatusMessage(`Download initiated: ${filename || 'Clip exported'}`);
      setTimeout(() => { if (!exportRequestRef.current) setExportStatusMessage(null); }, 4000);
      return true;
    } catch (err: any) {
      if (!request.signal.aborted) {
        setErrorMessage(err.message || 'Failed to export clip. Your clip is saved.');
        setWorkflowState('error');
      }
      return false;
    } finally {
      if (exportRequestRef.current === request) exportRequestRef.current = null;
      setIsExportingClipId(null);
    }
  };

  // Batch Export selected clips
  const handleBatchExport = async () => {
    if (selectedClipIds.size === 0) return;
    for (const id of Array.from(selectedClipIds)) {
      const isCandidate = candidates.some((c) => c.id === id);
      if (!await handleExportClip(id, isCandidate)) break;
    }
  };

  // -------------------------------------------------------------
  // RENDER SECTIONS BASED ON WORKFLOW STATE
  // -------------------------------------------------------------

  return (
    <div className="w-full">
      {/* Hidden file input for Upload Video */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePickFile(file);
          if (e.target) e.target.value = '';
        }}
      />

      {/* Offscreen video element for reading metadata/duration */}
      <video ref={offscreenVideoRef} className="hidden" />

      {/* Active Generated Clips Resume Banner when on Home Dashboard */}
      {workflowState === 'no_source' && activeProjectId && (candidates.length > 0 || renderedClips.length > 0) && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-violet-950/60 via-purple-900/30 to-zinc-900/60 border border-violet-500/30 shadow-[0_8px_30px_rgba(124,58,237,0.15)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center shrink-0">
              <Film className="size-5 text-violet-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Ready
                </span>
                <span className="text-xs text-vc-text-secondary">
                  {candidates.length + renderedClips.length} Viral Clips Ready
                </span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {selectedSource?.title || 'Generated Clips Project'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => handleOpenReview(activeProjectId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <span>Review Generated Clips</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE 1: NO SOURCE SELECTED (HERO & 3 INPUT CHANNELS)
          ========================================================================= */}
      {workflowState === 'no_source' && (
        <section
          aria-label="Create clips"
          className="p-4 sm:p-8 lg:p-10 xl:p-12 2xl:py-14 text-center relative transition-all duration-300 flex flex-col justify-between lg:min-h-[clamp(520px,calc(100vh-170px),740px)]"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handlePickFile(dropped);
          }}
        >
          {/* Main Hero Header */}
          <div className="relative z-10 max-w-2xl mx-auto flex-1 flex flex-col justify-center min-w-0">
            <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.04] text-violet-300 text-xs font-semibold tracking-wide self-center">
              <span className="size-1.5 rounded-full bg-white animate-pulse" />
              <span>AI video clipping journey</span>
            </div>

            <h1 className="mt-4 sm:mt-5 text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-tight font-['Sora',sans-serif] text-vc-text-primary leading-[1.14]">
              Find the moments in{' '}
              <span className="text-violet-300">
                your recording
              </span>
            </h1>

            <p className="mt-3 sm:mt-3.5 text-sm sm:text-base text-vc-text-secondary leading-relaxed max-w-lg mx-auto">
              Add a recording, choose your preferences, then review the suggested clips.
            </p>

            {/* URL Validation error notice */}
            {urlValidationError && (
              <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium flex items-center justify-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{urlValidationError}</span>
              </div>
            )}

            {/* URL Ingestion Input Form Bar */}
            <form
              onSubmit={handleUrlSubmit}
              className={`mt-4 sm:mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 sm:p-2.5 min-w-0 max-w-full rounded-2xl sm:rounded-full bg-vc-canvas/80 border shadow-[0_20px_50px_rgba(0,0,0,0.4)] focus-within:ring-4 focus-within:ring-violet-500/20 transition-all text-left ${
                isDragOver ? 'border-white/60 ring-4 ring-white/15' : 'border-white/[0.14] focus-within:border-violet-500/80'
              }`}
            >
              <div className="relative flex items-center gap-2.5 flex-1 min-w-0 max-w-full px-2 sm:px-3 py-2 sm:py-0">
                <PlatformIconCycle />
                <button
                  type="button"
                  aria-label="Paste URL from clipboard"
                  onClick={async () => {
                    try {
                      const t = await navigator.clipboard.readText();
                      if (t) setInputUrl(t.trim());
                    } catch {
                      /* clipboard unavailable; user can paste manually */
                    }
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-b from-white/[0.14] to-white/[0.06] border border-white/[0.16] shadow-[0_2px_10px_rgba(0,0,0,0.35)] text-[11px] font-semibold text-zinc-100 hover:from-white/[0.2] hover:to-white/[0.1] hover:border-violet-400/40 active:scale-[0.97] transition-all cursor-pointer"
                >
                  <ClipboardPaste className="size-3.5 text-violet-300" />
                  <span>Paste</span>
                </button>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="YouTube, your Twitch clip, or a direct video file URL"
                  aria-label="Video URL"
                  className="flex-1 min-w-0 w-0 min-h-[40px] sm:min-h-[28px] bg-transparent border-0 outline-none pr-16 sm:pr-20 text-base sm:text-[15px] text-vc-text-primary placeholder:text-vc-text-secondary placeholder:truncate"
                />
              </div>
              <button
                type="submit"
                className={`h-10 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm font-semibold shrink-0 cursor-pointer w-full sm:w-auto text-center ${BTN_PILL_BRAND}`}
              >
                Continue with URL
              </button>
            </form>

            {/* Twitch import lives as a secondary entry below Recent Projects (see DashboardPage) so the hero stays clean on every viewport. */}
            {/* Source Action Buttons Row */}
            <div className="mt-3 sm:mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 h-10 sm:h-11 px-5 sm:px-6 rounded-full bg-white/[0.06] border border-white/[0.14] hover:bg-white/[0.12] hover:border-white/[0.22] text-xs sm:text-[13px] font-semibold text-zinc-100 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <UploadCloud className="size-4 text-violet-400" />
                <span>Upload Video (MP4, MOV, WebM)</span>
              </button>


            </div>


            {/* Supported Formats & Guidelines */}
            {/* Compact supported-source symbols (names removed per user direction). */}
            <div className="mt-2.5 flex items-center justify-center gap-3.5" role="list" aria-label="Supported sources: YouTube, Twitch, Vimeo, Kick clips, public Google Drive or Dropbox file links, or a direct video link">
              <span role="listitem" title="YouTube"><YouTubeMark /></span>
              <span role="listitem" title="Twitch"><TwitchMark /></span>
              <span role="listitem" title="Vimeo"><VimeoMark /></span>
              <span role="listitem" title="Kick (completed public clips)"><KickMark /></span>
              <span role="listitem" title="Google Drive (public file link)"><DriveMark /></span>
              <span role="listitem" title="Dropbox (public file link)"><DropboxMark /></span>
              <span role="listitem" title="Direct video link"><Link2 className="size-4 text-zinc-300" aria-label="Direct video link" /></span>
            </div>

          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 2: SOURCE SELECTED & CONFIGURATION PANEL
          ========================================================================= */}
      {workflowState === 'source_selected' && selectedSource && (
        <section
          aria-label="Clipping configuration"
          className="vireo-dash-glass p-4 sm:p-4 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] relative space-y-3 clean-configure-panel"
        >
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
                <Film className="size-5 text-violet-400" />
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider text-violet-400 uppercase">Step 2 of 4</span>
                <h2 className="text-xl sm:text-2xl font-bold text-vc-text-primary font-['Sora',sans-serif]">
                  Configure your clips
                </h2>
                <p className="text-xs text-vc-text-secondary">Choose how Vireo finds your best moments.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReplaceSource}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/10 text-xs text-zinc-200 transition-all cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="size-3.5 text-vc-text-secondary" />
              <span>Replace video</span>
            </button>
          </div>

          {/* Selected Source Overview Card — prominent thumbnail on mobile, compact row on desktop */}
          <div className="p-2 rounded-2xl bg-vc-canvas/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0 w-full">
              {/* Thumbnail or Video Preview Frame */}
              <div className="relative w-full aspect-video sm:w-44 sm:h-auto sm:aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/15 shrink-0 flex items-center justify-center">
                {localVideoPreviewUrl ? (
                  <video
                    src={localVideoPreviewUrl}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : selectedSource.thumbnailUrl && !thumbLoadFailed ? (
                  <img
                    src={selectedSource.thumbnailUrl}
                    alt={selectedSource.title}
                    className="w-full h-full object-cover"
                    onError={() => setThumbLoadFailed(true)}
                  />
                ) : (
                  <Film className="size-8 text-violet-500" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                {selectedSource.duration ? (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[9px] text-white">
                    {formatDuration(selectedSource.duration)}
                  </span>
                ) : null}
              </div>

              {/* Source Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-violet-500/20 text-violet-200 ">
                    {selectedSource.type === 'file' ? 'Local Video' : selectedSource.type === 'url' ? 'Web URL' : 'Existing Project'}
                  </span>
                  {selectedSource.fileSizeFormatted && (
                    <span className="text-[11px] text-vc-text-secondary font-mono">
                      {selectedSource.fileSizeFormatted}
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-base font-semibold text-vc-text-primary truncate">
                  {selectedSource.title}
                </h3>
                <p className="text-xs text-vc-text-secondary truncate max-w-md">
                  {selectedSource.url || selectedSource.file?.name || 'Ready for AI processing'}
                </p>
              </div>
            </div>

            {/* Source Status Badge */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 shrink-0">
              <Check className="size-3.5" />
              <span>Source selected</span>
            </div>
          </div>

          <ConfigureClipsPanel
            preferences={clipPreferences}
            onChange={handlePreferencesChange}
            disabled={isSubmitting}
            captionsEnabled={captionsEnabled}
            onCaptionsEnabledChange={setCaptionsEnabled}
            clipCount={clipCount}
            onClipCountChange={handleClipCountChange}
          />

          {/* Credit Pre-Flight Cost Transparency */}
          {(creditEstimate || isCreditEstimateLoading) && (
            <CostTransparencySummary
              compact
              estimate={creditEstimate}
              wallet={walletBalance}
              durationSeconds={selectedSource?.duration || 0}
              isReusedTranscript={Boolean(creditEstimate?.details?.is_reused_transcript)}
              isLoading={isCreditEstimateLoading}
              operationLabel="AI Video Clipping"
              className=""
            />
          )}

          {!creditEstimate && !isCreditEstimateLoading && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/20 p-3 text-xs text-amber-100">
            <span>Credit estimate unavailable. Refresh it to confirm the cost before generating.</span>
            <button type="button" className="rounded-full border border-amber-200/30 px-3 py-1.5" onClick={()=>setEstimateRetry(n=>n+1)}>Refresh estimate</button>
          </div>}
          {/* Primary Action Button: Generate Clips */}
          <div className="cfg-actions pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="cfg-ready-text text-xs text-vc-text-secondary">
              Ready to process. We will transcribe the audio and suggest clips in {aspectRatio}. Review framing and context before exporting.
            </p>

            {creditEstimate?.estimated_credits != null && (
              <span className="cfg-cost text-[11px] font-mono text-vc-text-secondary whitespace-nowrap">
                Est. {creditEstimate.estimated_credits} credits
              </span>
            )}
            <button
              type="button"
              onClick={handleGenerateClips}
              disabled={isSubmitting || isCreditEstimateLoading || !creditEstimate?.has_sufficient_credits}
              className={`h-12 px-8 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed w-full sm:w-auto ${BTN_PILL_BRAND}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Preparing Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4 text-zinc-200" />
                  <span>Generate Clips</span>
                  {creditEstimate?.estimated_credits != null && (
                    <span className="cfg-btn-cost text-[11px] font-mono font-medium text-white/75">
                      · {creditEstimate.estimated_credits} credits
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 3: UPLOADING OR PROCESSING (REAL BACKEND STAGE TRACKING)
          ========================================================================= */}
      {workflowState === 'processing' && (
        <section
          aria-label="Processing job"
          className="relative space-y-5 text-center"
        >
          {/* Large source thumbnail hero (approved design: prominent video, flat background) */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/15 flex items-center justify-center">
            {localVideoPreviewUrl ? (
              <video
                src={localVideoPreviewUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
            ) : selectedSource?.thumbnailUrl && !thumbLoadFailed ? (
              <img
                src={selectedSource.thumbnailUrl}
                alt={selectedSource.title || 'Processing video'}
                className="w-full h-full object-cover"
                onError={() => setThumbLoadFailed(true)}
              />
            ) : (
              <Film className="size-10 text-violet-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            {selectedSource?.duration ? (
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] text-white">
                {formatDuration(selectedSource.duration)}
              </span>
            ) : null}
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-vc-text-primary font-['Sora',sans-serif] truncate">
              {selectedSource?.title || 'Processing Video'}
            </h2>
            <p className="text-[11px] text-vc-text-secondary">
              {[
                ASPECT_RATIO_OPTIONS.find((a) => a.id === clipPreferences.aspectRatio)?.label || '9:16 Vertical',
                captionsEnabled ? 'Captions on' : 'Captions off',
                clipCount === 'auto' ? 'Auto clips' : `Top ${clipCount} clips`,
              ].join(' \u00b7 ')}
            </p>
          </div>

          {/* Compact progress ring + current stage */}
          <div className="flex items-center justify-center gap-3">
            <div className="size-12 rounded-full border-2 border-white/10 border-t-violet-500 animate-spin flex items-center justify-center shrink-0">
              <Film className="size-4 text-violet-400" />
            </div>
            <div className="text-left min-w-0">
              <span className="inline-block px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 text-[10px] font-semibold tracking-wide uppercase">
                {activeProjectStatus === 'uploading' ? 'Ingest'
                  : ['transcribing', 'processing', 'queued'].includes(activeProjectStatus) ? 'Transcription'
                  : activeProjectStatus === 'analyzing' ? 'Analysis'
                  : ['generating', 'completed', 'transcribed'].includes(activeProjectStatus) ? 'Framing'
                  : 'Processing'}
              </span>
              <p className="mt-1 text-xs text-vc-text-secondary">
                {processingStageMessage || 'Analyzing video frames and speech transcript with AI...'}
              </p>
            </div>
          </div>

          {/* Credit reservation note */}
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
            <Coins className="size-3.5 text-violet-400" />
            <span>
              {creditEstimate?.estimated_credits ? `${creditEstimate.estimated_credits} credits reserved` : 'Credits reserved'}. Charged only on success, released back if processing fails.
            </span>
          </div>

          {/* Byte Upload Progress Bar (Only shown during actual file upload) */}
          {activeProjectStatus === 'uploading' && uploadProgress !== null && (
            <div className="max-w-md mx-auto space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-vc-text-secondary">
                <span>Upload Progress</span>
                <span className="text-zinc-200 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Slim pipeline step list; active step derived from the live status so it never contradicts the message */}
          <div className="max-w-lg mx-auto pt-3 border-t border-white/[0.08] flex items-center justify-center gap-4 sm:gap-6 text-left">
            {(() => {
              const stageIndex = activeProjectStatus === 'uploading' ? 0
                : ['transcribing', 'processing', 'queued'].includes(activeProjectStatus) ? 1
                : activeProjectStatus === 'analyzing' ? 2
                : ['generating', 'completed', 'transcribed'].includes(activeProjectStatus) ? 3
                : 1;
              return [
                { id: 'upload', label: 'Ingest' },
                { id: 'transcribe', label: 'Transcription' },
                { id: 'analyze', label: 'Analysis' },
                { id: 'render', label: 'Framing' },
              ].map((st, i) => (
                <div key={st.id} className="flex items-center gap-1.5">
                  {i < stageIndex ? (
                    <Check className="size-3 text-violet-400" />
                  ) : i === stageIndex ? (
                    <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-white/25" />
                  )}
                  <span className={`text-[11px] ${i <= stageIndex ? 'text-zinc-100' : 'text-vc-text-secondary'}`}>
                    {st.label}
                  </span>
                </div>
              ));
            })()}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={handleReplaceSource}
              className="text-xs text-vc-text-secondary hover:text-violet-300 transition-colors cursor-pointer"
            >
              Cancel & Start Over
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 4: CLIPS READY FOR REVIEW
          ========================================================================= */}
      {workflowState === 'clips_ready' && (
        <section
          aria-label="Generated clips review"
          className="relative space-y-5"
        >
          {/* Compact results header (approved simplified design) */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-vc-text-primary font-['Sora',sans-serif] truncate">
                Your clips
              </h2>
              <p className="text-[11px] text-vc-text-secondary mt-0.5 leading-snug">
                {candidates.length + renderedClips.length} clips · <span className="text-violet-200 font-medium">{selectedSource?.title}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleBackToHome}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all cursor-pointer"
              >
                <ArrowLeft className="size-3.5 text-zinc-400" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleReplaceSource}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 text-xs text-zinc-200 transition-all cursor-pointer"
              >
                <RotateCcw className="size-3.5 text-vc-text-secondary" />
                <span>New Video</span>
              </button>
            </div>
          </div>

          {/* Credits settlement: small accessible disclosure instead of a large block */}
          <details className="text-[11px] text-violet-200/90 bg-violet-950/30 border border-violet-500/20 rounded-xl px-3 py-2">
            <summary className="cursor-pointer select-none font-semibold flex items-center gap-1.5 list-none">
              <Check className="size-3.5 text-emerald-400 shrink-0" />
              <span>Credits settled for this video</span>
              <span className="text-violet-300/70 font-normal">· details</span>
            </summary>
            <div className="pt-1.5 pl-5 flex items-center justify-between gap-3">
              <span className="text-violet-200/80">
                Credits were measured and settled atomically. Available balance has been updated in your wallet.
              </span>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="text-violet-300 hover:text-white underline font-semibold whitespace-nowrap cursor-pointer"
              >
                View Ledger &rarr;
              </button>
            </div>
          </details>

          {/* Export Status Toast Banner */}
          {exportStatusMessage && (
            <div className="p-3 rounded-xl bg-violet-500/20 text-white text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-zinc-200" />
                <span>{exportStatusMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setExportStatusMessage(null)}
                className="text-white/60 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {previewUnavailable && (
            <div role="alert" className="rounded-xl border border-amber-400/30 px-4 py-3 text-xs text-amber-100">
              Preview isn't available for this clip. You can still open it in the editor.
            </div>
          )}

          {/* Active Preview Player Section (Seeked to selected clip timestamp) */}
          {(sourceVideoStreamingUrl || localVideoPreviewUrl || (activePreviewClipId && clipSignedPreviewUrls[activePreviewClipId])) && (
            <div className="p-4 rounded-2xl bg-vc-canvas/80 flex flex-col md:flex-row items-center gap-6">
              <div className="relative w-full md:w-72 aspect-[9/16] rounded-xl overflow-hidden bg-black/90 border border-white/15 shadow-xl shrink-0 flex items-center justify-center">
                <video
                  ref={videoPlayerRef}
                  src={
                    (activePreviewClipId && clipSignedPreviewUrls[activePreviewClipId]) ||
                    sourceVideoStreamingUrl ||
                    localVideoPreviewUrl ||
                    undefined
                  }
                  className="w-full h-full object-cover"
                  playsInline
                  onPlay={() => setIsPlayingPreview(true)}
                  onPause={() => setIsPlayingPreview(false)}
                  onLoadedMetadata={handlePreviewLoadedMetadata}
                  onError={handlePreviewError}
                />

                {/* Video Play/Pause Overlay Control */}
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group cursor-pointer"
                  aria-label={isPlayingPreview ? 'Pause preview' : 'Play preview'}
                >
                  <div className="size-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isPlayingPreview ? (
                      <Pause className="size-5 text-white" />
                    ) : (
                      <Play className="size-5 text-white ml-0.5" />
                    )}
                  </div>
                </button>
              </div>

              {/* Player Details & Clip Info */}
              <div className="flex-1 space-y-3 text-left w-full">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-500/20 text-violet-200 ">
                    Live Player
                  </span>
                  <span className="text-xs text-vc-text-secondary">
                    Aspect: {aspectRatio}
                  </span>
                  {renderedClips.find((c) => c.id === activePreviewClipId)?.is_watermarked === true && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Watermarked (Free Plan)
                    </span>
                  )}
                  {renderedClips.find((c) => c.id === activePreviewClipId)?.is_watermarked === false && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Clean Export (Creator+)
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-vc-text-primary">
                  {renderedClips.find((c) => c.id === activePreviewClipId)?.title ||
                    candidates.find((c) => c.id === activePreviewClipId)?.title ||
                    (activePreviewClipId ? 'Untitled clip' : 'Select a clip below to preview')}
                </h3>

                <p className="text-xs text-vc-text-secondary leading-relaxed line-clamp-3">
                  {candidates.find((c) => c.id === activePreviewClipId)?.hook ||
                    'Preview the exact start timestamp and AI hook extracted for this segment.'}
                </p>

                {activePreviewClipId && (
                  <div className="pt-2 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const isCand = candidates.some((c) => c.id === activePreviewClipId);
                        handleEditClip(activePreviewClipId, isCand);
                      }}
                      className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${BTN_PILL_PRIMARY}`}
                    >
                      <Film className="size-3.5" />
                      <span>Open in Timeline Editor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const isCand = candidates.some((c) => c.id === activePreviewClipId);
                        handleExportClip(activePreviewClipId, isCand);
                      }}
                      disabled={isExportingClipId !== null}
                      className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-xs font-semibold text-zinc-100 flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      {isExportingClipId === activePreviewClipId ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5 text-zinc-200" />
                      )}
                      <span>Export MP4</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Filter chips (approved simplified results design) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {([
              ['all', 'All'],
              ['potential', 'High potential'],
              ['short', 'Short'],
              ['long', 'Long'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setResultsFilter(key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  resultsFilter === key
                    ? 'bg-violet-600 border-transparent text-white shadow-lg shadow-violet-900/40'
                    : 'bg-white/[0.04] border-white/[0.12] text-zinc-300 hover:border-violet-500/40 hover:text-white'
                }`}
              >
                {label} ({resultsFilterCounts[key]})
              </button>
            ))}
          </div>

          {/* Select all row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAllClips}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <span
                className={`w-[18px] h-[18px] p-0 rounded-[5px] border flex items-center justify-center transition-all ${
                  selectedClipIds.size > 0 && selectedClipIds.size === candidates.length + renderedClips.length
                    ? 'bg-violet-600 border-transparent'
                    : 'border-white/25 group-hover:border-violet-400'
                }`}
              >
                {selectedClipIds.size > 0 && selectedClipIds.size === candidates.length + renderedClips.length && (
                  <Check className="size-3 text-white" />
                )}
              </span>
              <span className="text-xs font-semibold text-zinc-200">Select all</span>
            </button>
            {selectedClipIds.size > 0 && (
              <span className="text-[11px] text-zinc-400 font-mono">
                {selectedClipIds.size} of {candidates.length + renderedClips.length} selected
              </span>
            )}
          </div>

          {/* Generated Clips: thumbnail-card grid (Media Library pattern, mobile + desktop) */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Rendered Clips (if any) */}
            {filteredRenderedClips.map((clip) => {
              const isSelected = selectedClipIds.has(clip.id);
              const isActive = activePreviewClipId === clip.id;
              const clipScore = renderedClipScore(clip);

              return (
                <div
                  key={clip.id}
                  className={`group relative overflow-hidden rounded-2xl border transition-all flex flex-col ${
                    isSelected
                      ? 'bg-vc-canvas/80 border-violet-500/70 ring-1 ring-violet-500/50'
                      : isActive
                        ? 'bg-white/[0.05] border-white/25'
                        : 'bg-vc-canvas/80 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {/* Vertical thumbnail poster */}
                  <div className="relative aspect-[9/12] w-full bg-black group/vid">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ClipThumbImage
                        clip={clip}
                        alt={clip.title || 'Viral Clip'}
                        className="w-full h-full object-cover"
                        fallback={
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[10px] font-mono text-zinc-500">9:16</span>
                          </div>
                        }
                      />
                    </div>

                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => handleSelectClip(clip.id)}
                      aria-label={isSelected ? 'Deselect clip' : 'Select clip'}
                      className={`absolute top-2 left-2 z-20 w-5 h-5 p-0 rounded-[6px] border flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600 border-transparent'
                          : 'bg-black/60 border-white/40 hover:border-violet-400'
                      }`}
                    >
                      {isSelected && <Check className="size-3.5 text-white" />}
                    </button>

                    {/* Tap to preview in the player */}
                    <button
                      type="button"
                      onClick={() => handlePlayClipPreview(clip.id, clip.start_seconds)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/vid:opacity-100 transition-opacity cursor-pointer"
                      aria-label="Preview clip"
                    >
                      <div className="size-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xl">
                        <Play className="size-4 ml-0.5 fill-white" />
                      </div>
                    </button>

                    <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono font-bold">
                        {formatDuration(clip.duration_seconds)}
                      </span>
                    </div>
                  </div>

                  {/* Info + actions */}
                  <div className="flex-1 min-w-0 p-2.5 sm:p-3 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {clipScore !== null && (
                        <span className="px-2 py-0.5 rounded-md bg-violet-500/30 text-violet-200 text-[10px] font-bold flex items-center gap-1">
                          <Sparkles className="size-2.5" />
                          <span>{Math.round(clipScore)}</span>
                        </span>
                      )}
                      {clipScore !== null && clipScore >= 80 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-bold uppercase tracking-wide">
                          High potential
                        </span>
                      )}
                      <span className="ml-auto">
                        {clip.is_watermarked === true ? (
                          <span
                            className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold"
                            title="Permanent VireoClip watermark on Free Plan"
                          >
                            Watermarked
                          </span>
                        ) : clip.is_watermarked === false ? (
                          <span
                            className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                            title="Clean export without watermark"
                          >
                            Clean Export
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-white/[0.10] text-zinc-200 text-[10px] font-bold">
                            Rendered
                          </span>
                        )}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-[15px] font-bold text-vc-text-primary line-clamp-2 leading-snug">
                        {clip.title || 'Viral Clip'}
                      </h4>
                      <p className="text-[11px] text-vc-text-secondary font-mono mt-0.5">
                        {formatDuration(clip.start_seconds)} – {formatDuration(clip.end_seconds)}
                      </p>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="mt-auto pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditClip(clip.id, false)}
                        className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-600 hover:bg-violet-500 text-[10px] font-bold text-white transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        <Film className="size-3.5" />
                        <span>Open Editor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePlayClipPreview(clip.id, clip.start_seconds)}
                        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-semibold text-zinc-100 transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        <Play className="size-3 text-zinc-200" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportClip(clip.id, false)}
                        disabled={isExportingClipId !== null}
                        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-semibold text-zinc-100 transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        {isExportingClipId === clip.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        <span>Export</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPublishingClip(clip)}
                        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-semibold text-zinc-100 transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                        title="Publish clip"
                      >
                        <Share2 className="size-3" />
                        <span>Publish</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 2. AI Clip Candidates */}
            {filteredCandidates.map((cand) => {
              const isSelected = selectedClipIds.has(cand.id);
              const isActive = activePreviewClipId === cand.id;
              const candScore = candidateRankingDisplay(cand);

              return (
                <div
                  key={cand.id}
                  className={`group relative overflow-hidden rounded-2xl border transition-all flex flex-col ${
                    isSelected
                      ? 'bg-vc-canvas/80 border-violet-500/70 ring-1 ring-violet-500/50'
                      : isActive
                        ? 'bg-white/[0.05] border-white/25'
                        : 'bg-vc-canvas/80 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {/* Poster placeholder (candidate not yet rendered) */}
                  <div className="relative aspect-[9/12] w-full bg-zinc-950 group/vid">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="size-6 text-zinc-700" />
                    </div>

                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => handleSelectClip(cand.id)}
                      aria-label={isSelected ? 'Deselect clip' : 'Select clip'}
                      className={`absolute top-2 left-2 z-20 w-5 h-5 p-0 rounded-[6px] border flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600 border-transparent'
                          : 'bg-black/60 border-white/40 hover:border-violet-400'
                      }`}
                    >
                      {isSelected && <Check className="size-3.5 text-white" />}
                    </button>

                    {/* Tap to preview in the player */}
                    <button
                      type="button"
                      onClick={() => handlePlayClipPreview(cand.id, cand.start_seconds)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/vid:opacity-100 transition-opacity cursor-pointer"
                      aria-label="Preview candidate"
                    >
                      <div className="size-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xl">
                        <Play className="size-4 ml-0.5 fill-white" />
                      </div>
                    </button>

                    <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono font-bold">
                        {formatDuration(cand.duration_seconds)}
                      </span>
                    </div>
                  </div>

                  {/* Info + actions */}
                  <div className="flex-1 min-w-0 p-2.5 sm:p-3 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {candScore !== null && (
                        <span className="px-2 py-0.5 rounded-md bg-violet-500/30 text-violet-200 text-[10px] font-bold flex items-center gap-1">
                          <Sparkles className="size-2.5" />
                          <span>{Math.round(candScore)}</span>
                        </span>
                      )}
                      {candScore !== null && candScore >= 80 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-bold uppercase tracking-wide">
                          High potential
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-[15px] font-bold text-vc-text-primary line-clamp-2 leading-snug">
                        {cand.title}
                      </h4>
                      <p className="text-[11px] text-vc-text-secondary font-mono mt-0.5">
                        {formatDuration(cand.start_seconds)} – {formatDuration(cand.end_seconds)}
                      </p>
                      <p className="text-xs text-zinc-200 line-clamp-2 mt-1.5 leading-relaxed">
                        {cand.hook || cand.reason}
                      </p>
                    </div>

                    {/* Why This Clip: Multi-signal breakdown, reasons & suitability */}
                    <WhyThisClipSection candidate={cand} className="mt-1" />

                    {/* Action Buttons Row */}
                    <div className="mt-auto pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditClip(cand.id, true)}
                        className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-600 hover:bg-violet-500 text-[10px] font-bold text-white transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        <Film className="size-3.5" />
                        <span>Open Editor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePlayClipPreview(cand.id, cand.start_seconds)}
                        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-semibold text-zinc-100 transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        <Play className="size-3 text-zinc-200" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportClip(cand.id, true)}
                        disabled={isExportingClipId !== null}
                        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-semibold text-zinc-100 transition-colors cursor-pointer after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
                      >
                        {isExportingClipId === cand.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        <span>Export</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom selection bar: visible only when clips are selected */}
          {selectedClipIds.size > 0 && (
            <div className="sticky bottom-4 z-20 w-full max-w-3xl pb-[env(safe-area-inset-bottom)]">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-2xl border border-white/[0.12] bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
                <span className="w-[18px] h-[18px] p-0 rounded-[5px] bg-violet-600 flex items-center justify-center shrink-0">
                  <Check className="size-3 text-white" />
                </span>
                <span className="text-xs text-zinc-300 whitespace-nowrap">
                  <b className="text-white">{selectedClipIds.size} selected</b>
                  {' · '}
                  {Math.floor(selectedTotalSeconds / 60)}m {Math.round(selectedTotalSeconds % 60)}s
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleBatchExport}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-[11px] font-semibold text-zinc-100 transition-colors cursor-pointer"
                >
                  <Download className="size-3.5" />
                  <span>Export ({selectedClipIds.size})</span>
                </button>
                {firstSelectedId && (
                  <button
                    type="button"
                    onClick={() => handleEditClip(firstSelectedId, candidates.some((c) => c.id === firstSelectedId))}
                    title={selectedClipIds.size > 1 ? 'Opens the first selected clip in the editor' : 'Open this clip in the editor'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold cursor-pointer rounded-full ${BTN_PILL_PRIMARY}`}
                  >
                    <Film className="size-3.5" />
                    <span>{selectedClipIds.size > 1 ? 'Edit first selected' : 'Open Editor'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          STATE 6: RECOVERABLE ERROR STATE
          ========================================================================= */}
      {workflowState === 'error' && (
        <section
          aria-label="Error recovery"
          className="vireo-dash-glass p-6 sm:p-8 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-destructive/40 relative space-y-5"
        >
          <div className="flex items-start gap-4">
            <div className="size-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
              <AlertCircle className="size-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-vc-text-primary">
                {needsTranscriptReview ? 'Review the transcript before continuing' : 'Unable to complete video clipping'}
              </h2>
              <p className="text-xs sm:text-sm text-destructive leading-relaxed">
                {errorMessage || 'An unexpected error occurred during processing.'}
              </p>
            </div>
          </div>

          {creationRecoveryTarget&&<div className="space-y-2 text-xs text-vc-text-secondary">
            <p>Resolve recovers an already created clip or closes an unadmitted request. It does not create, delete or cancel a rendered clip.</p>
            <button type="button" onClick={handleResolveCreation} className="px-3 py-2 rounded-full border border-white/20 text-zinc-200">Resolve saved creation</button>
          </div>}

          {/* Direct upload is a recovery only while URL ingestion is unresolved. */}
          {!needsTranscriptReview && selectedSource?.type === 'url' && <div className="p-3.5 rounded-xl bg-white/[0.03] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-vc-text-secondary">
            <div className="space-y-0.5">
              <div className="font-semibold text-vc-text-primary flex items-center gap-1.5">
                <UploadCloud className="size-3.5 text-zinc-200" />
                <span>Supported Alternative: Direct Video Upload</span>
              </div>
              <p className="text-[11px] text-vc-text-secondary">
                {uploadFallbackHelp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] border border-white/20 text-xs font-semibold text-zinc-200 transition-all cursor-pointer shrink-0"
            >
              Upload Video File
            </button>
          </div>}

          {!needsTranscriptReview && selectedSource?.type === 'project' && activeProjectStatus === 'uploaded' && (
            <p className="text-xs text-vc-text-secondary">
              Your source upload is saved. Retry processing without uploading the video again.
            </p>
          )}

          {needsTranscriptReview && <p className="text-xs text-vc-text-secondary" role="status">
            No automatic retry will run from this screen. Opening the project does not approve its transcript or start a new transcription.
          </p>}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            {activeProjectId&&(creationRecoveryTarget||candidates.length>0||renderedClips.length>0)&&<button type="button" onClick={()=>setWorkflowState('clips_ready')} className="px-4 py-2 rounded-full border border-white/20 text-xs">Back to saved clips</button>}
            {needsTranscriptReview && activeProjectId && <button type="button"
              onClick={() => navigate(`/projects/${encodeURIComponent(activeProjectId)}?review=transcript`)}
              className={`px-5 py-2.5 text-xs font-semibold cursor-pointer ${BTN_PILL_BRAND}`}>
              Open Project for Review
            </button>}
            {selectedSource && !needsTranscriptReview && !creationRecoveryTarget && candidates.length===0 && renderedClips.length===0 && (
              <button
                type="button"
                onClick={handleGenerateClips}
                disabled={isSubmitting}
                className={`px-5 py-2.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5 ${BTN_PILL_BRAND}`}
              >
                {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                <span>{isSubmitting ? 'Retrying...' : 'Retry Generation'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReplaceSource}
              className="px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-100 cursor-pointer transition-colors"
            >
              Select Another Source
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          BROWSE PROJECTS MODAL PICKER
          ========================================================================= */}
      {isBrowseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-scrim">
          <div className="w-full max-w-lg rounded-3xl glass-float p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-base font-bold text-vc-text-primary">
                <FolderOpen className="size-5 text-zinc-200" />
                <span>Select a Video Project</span>
              </div>
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(false)}
                className="text-vc-text-secondary hover:text-white p-1"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="size-4 text-vc-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                placeholder="Search projects by title..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-vc-text-primary placeholder:text-vc-text-secondary outline-none focus:border-violet-500"
              />
            </div>

            {/* Project list */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {existingProjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-vc-text-secondary">
                  No existing projects found. Upload a video to start your first project.
                </div>
              ) : (
                existingProjects
                  .filter((p) => p.title.toLowerCase().includes(projectSearchTerm.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectExistingProject(p)}
                      className="w-full p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20 transition-all flex items-center justify-between gap-3 text-left cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-vc-text-primary group-hover:text-zinc-200 transition-colors truncate">
                          {p.title}
                        </div>
                        <div className="text-[10px] text-vc-text-secondary mt-0.5">
                          Status: {p.video_status || p.status}
                        </div>
                      </div>
                      <span className="text-xs text-violet-400 font-medium shrink-0">
                        Select →
                      </span>
                    </button>
                  ))
              )}
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-vc-text-secondary">
              {onScrollToProjects && (
                <button
                  type="button"
                  onClick={() => {
                    setIsBrowseModalOpen(false);
                    onScrollToProjects();
                  }}
                  className="hover:text-white underline cursor-pointer"
                >
                  View full projects list below
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium cursor-pointer ml-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PUBLISH MODAL INTEGRATION
          ========================================================================= */}
      {publishingClip && activeProjectId && (
        <PublishModal
          isOpen={Boolean(publishingClip)}
          onClose={() => setPublishingClip(null)}
          projectId={activeProjectId}
          clipId={publishingClip.id}
          initialTitle={publishingClip.title || 'My Viral Clip'}
        />
      )}
    </div>
  );
};
