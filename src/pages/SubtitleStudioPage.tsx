import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  Link2,
  ClipboardPaste,
  FileVideo,
  Sparkles,
  Captions,
  ArrowRight,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  Film,
  Zap,
} from 'lucide-react';
import { SubtitleProject } from '../types';
import { SubtitleService } from '../services/subtitleService';
import { uploadVideoFile, validateVideoFile, UploadProgressStats } from '../services/storageService';
import { backendRequest } from '../services/backendClient';
import { CreditService, CreditBalanceSummary, CreditEstimate } from '../services/creditService';
import { SubtitleEditor } from '../components/subtitles/SubtitleEditor';
import { CostTransparencySummary } from '../components/credits/CostTransparencySummary';
import { Button } from '../components/Button';

export const SubtitleStudioPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // Projects list state
  const [projects, setProjects] = useState<SubtitleProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Active Project state
  const [currentProject, setCurrentProject] = useState<SubtitleProject | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Source tabs: upload vs URL import
  const [sourceTab, setSourceTab] = useState<'upload' | 'url'>('upload');
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestTitle, setIngestTitle] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState<UploadProgressStats | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // Credit wallet & pre-flight estimate state
  const [wallet, setWallet] = useState<CreditBalanceSummary | null>(null);
  const [creditEstimate, setCreditEstimate] = useState<CreditEstimate | null>(null);
  const [isCreditEstimateLoading, setIsCreditEstimateLoading] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const summary = await CreditService.getWalletBalance();
      setWallet(summary);
    } catch (err) {
      console.warn('Failed to load wallet balance:', err);
    }
  }, []);

  useEffect(() => {
    loadWallet();
    const handleCreditUpdate = () => { loadWallet(); };
    window.addEventListener('vireo_credit_updated', handleCreditUpdate);
    return () => window.removeEventListener('vireo_credit_updated', handleCreditUpdate);
  }, [loadWallet]);

  // Pre-flight cost estimation when file or duration changes
  useEffect(() => {
    if (!selectedFile) {
      setCreditEstimate(null);
      return;
    }
    let isCancelled = false;
    const fetchEstimate = async () => {
      setIsCreditEstimateLoading(true);
      try {
        const est = await CreditService.estimateOperation('core_video_processing', fileDuration || 60);
        if (!isCancelled) setCreditEstimate(est);
      } catch (e) {
        console.warn('Failed to estimate credit cost:', e);
      } finally {
        if (!isCancelled) setIsCreditEstimateLoading(false);
      }
    };
    fetchEstimate();
    return () => { isCancelled = true; };
  }, [selectedFile, fileDuration]);

  // Fetch list of subtitle projects
  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const res = await SubtitleService.listProjects();
      setProjects(res.projects || []);
    } catch (err: any) {
      console.warn('Failed to load subtitle projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Fetch single project details
  const loadProjectDetails = useCallback(async (projectId: string) => {
    setIsLoadingProject(true);
    setProjectError(null);
    try {
      const res = await SubtitleService.getProject(projectId);
      setCurrentProject(res.project);
      setPreviewUrl(res.previewUrl || res.project.source_url || '');

      // If project is currently transcribing, poll until ready
      if (res.project.video_status === 'transcribing') {
        setIsTranscribing(true);
      }
    } catch (err: any) {
      setProjectError(err.message || 'Failed to load subtitle project.');
    } finally {
      setIsLoadingProject(false);
    }
  }, []);

  // Load project on mount / id change
  useEffect(() => {
    if (id) {
      loadProjectDetails(id);
    } else {
      setCurrentProject(null);
      setPreviewUrl('');
      loadProjects();
    }
  }, [id, loadProjectDetails, loadProjects]);

  // Polling for transcribing status
  useEffect(() => {
    if (!id || !isTranscribing) return;

    const interval = setInterval(async () => {
      try {
        const res = await SubtitleService.getProject(id);
        if (res.project.video_status === 'transcribed') {
          setIsTranscribing(false);
          setCurrentProject(res.project);
          setPreviewUrl(res.previewUrl || res.project.source_url || '');
          window.dispatchEvent(new CustomEvent('vireo_credit_updated'));
          clearInterval(interval);
        } else if (res.project.video_status === 'failed') {
          setIsTranscribing(false);
          setTranscriptionError('Speech transcription failed for this video.');
          window.dispatchEvent(new CustomEvent('vireo_credit_updated'));
          clearInterval(interval);
        }
      } catch (err) {
        // Keep polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [id, isTranscribing]);

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setUploadError(null);
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid video file format.');
      return;
    }

    setSelectedFile(file);

    // Extract duration from local file metadata
    try {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = URL.createObjectURL(file);
      tempVideo.onloadedmetadata = () => {
        setFileDuration(tempVideo.duration);
        URL.revokeObjectURL(tempVideo.src);
      };
    } catch {
      // Ignored if unable to load local metadata
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStats(null);
  };

  // Import a video by URL via the subtitle ingest endpoint (import-only; no auto-transcription)
  const handleIngestUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = ingestUrl.trim();
    if (!url) {
      setIngestError('Paste a video URL first.');
      return;
    }
    setIsIngesting(true);
    setIngestError(null);
    try {
      const data = await backendRequest<{ status: string; project: SubtitleProject }>(
        '/subtitles/projects/ingest-url',
        {
          method: 'POST',
          body: JSON.stringify({ url, ...(ingestTitle.trim() ? { title: ingestTitle.trim() } : {}) }),
        }
      );
      if (data?.status === 'ok' && data.project?.id) {
        navigate(`/subtitles/${data.project.id}`);
        return;
      }
      setIngestError('The video could not be imported. Check the link and try again.');
    } catch (err: any) {
      setIngestError(err?.message || 'The video could not be imported. Check the link and try again.');
    } finally {
      setIsIngesting(false);
    }
  };

  // Upload video and trigger transcription
  const handleStartUploadAndTranscribe = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadStats(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Step 1: Create subtitle project record
      const cleanTitle = selectedFile.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled Subtitle Project';
      const createRes = await SubtitleService.createProject(cleanTitle);
      const projectId = createRes.project.id;

      // Step 2: Upload file directly to S3 / Cloudflare R2
      await uploadVideoFile({
        file: selectedFile,
        projectId,
        signal: abortController.signal,
        onProgress: (pct, stats) => {
          setUploadProgress(pct);
          if (stats) setUploadStats(stats);
        },
      });

      // Step 3: Confirm upload
      await backendRequest(`/projects/${projectId}/confirm-upload`, {
        method: 'POST',
      });

      setIsUploading(false);
      setSelectedFile(null);

      // Navigate to project studio URL
      navigate(`/subtitles/${projectId}`);

      // Step 4: Trigger transcription
      setIsTranscribing(true);
      await SubtitleService.transcribeProject(projectId);
      window.dispatchEvent(new CustomEvent('vireo_credit_updated'));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setUploadError('Upload was cancelled.');
      } else {
        setUploadError(err.message || 'Failed to upload video.');
      }
      setIsUploading(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Retry transcription
  const handleRetryTranscription = async () => {
    if (!id) return;
    setIsTranscribing(true);
    setTranscriptionError(null);
    try {
      await SubtitleService.transcribeProject(id);
      window.dispatchEvent(new CustomEvent('vireo_credit_updated'));
    } catch (err: any) {
      setTranscriptionError(err.message || 'Transcription retry failed.');
      setIsTranscribing(false);
    }
  };

  // If viewing a specific project
  if (id) {
    if (isLoadingProject) {
      return (
        <div className="py-24 text-center space-y-4">
          <Loader2 className="size-10 mx-auto animate-spin text-violet-400" />
          <p className="text-sm text-zinc-400">Loading Subtitle Studio...</p>
        </div>
      );
    }

    if (projectError) {
      return (
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <div className="size-14 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400 mx-auto">
            <AlertCircle className="size-7" />
          </div>
          <h2 className="text-lg font-bold text-white">Project Not Found</h2>
          <p className="text-xs text-zinc-400">{projectError}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/subtitles')}>
            Return to Subtitle Studio
          </Button>
        </div>
      );
    }

    // Transcription in progress state
    if (isTranscribing || currentProject?.video_status === 'transcribing') {
      return (
        <div className="max-w-xl mx-auto py-20 text-center space-y-6">
          <div className="size-16 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mx-auto animate-pulse">
            <Sparkles className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Generating Speech Subtitles</h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Our AI is extracting audio, detecting spoken words, and aligning microsecond timestamps for{' '}
              <span className="text-violet-300 font-semibold">{currentProject?.title}</span>.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-violet-400" />
                Whisper AI Chunked Transcription
              </span>
              <span className="text-violet-400 font-bold flex items-center gap-1.5">
                <Zap className="size-3" />
                Credits Reserved • Settling on Measured Audio
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-400 h-2 rounded-full w-2/3 animate-pulse" />
            </div>
          </div>

          {transcriptionError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center justify-between">
              <span>{transcriptionError}</span>
              <Button variant="brand" size="sm" onClick={handleRetryTranscription}>
                Retry
              </Button>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => navigate('/subtitles')} className="text-xs">
            Back to Subtitles
          </Button>
        </div>
      );
    }

    // Active Subtitle Editor
    if (currentProject) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Link to="/subtitles" className="hover:text-white transition">
              Subtitles
            </Link>
            <span>/</span>
            <span className="text-white font-medium truncate max-w-xs">{currentProject.title}</span>
          </div>

          <SubtitleEditor
            project={currentProject}
            previewUrl={previewUrl}
            onProjectUpdated={(updated) => setCurrentProject(updated)}
          />
        </div>
      );
    }
  }

  // =========================================================================
  // VIEW: Standalone Subtitle Studio Hub (Upload & Recent Projects)
  // =========================================================================
  return (
    <div className="space-y-10 max-w-6xl mx-auto py-2">
      {/* Hero Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold">
            <Captions className="size-3.5" />
            <span>Standalone Subtitle Studio</span>
          </div>
          {wallet && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <Zap className="size-3.5 text-violet-400" />
              <span className="font-semibold text-white">
                {wallet.is_unlimited ? 'Unlimited Credits' : `${wallet.available_credits.toLocaleString()} Credits`}
              </span>
            </div>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          AI Speech-to-Subtitles & Custom Captions
        </h1>
        <p className="text-sm text-zinc-400 max-w-2xl">
          Upload any video to generate synchronized subtitles, edit cues on an interactive timeline, customize
          presets (Hormozi, Neon, Beast, Clean), and export burned-in MP4 or SRT/VTT.
        </p>
      </div>

      {/* Source Card: Upload or URL import */}
      <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        {/* Source Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] w-fit" role="tablist" aria-label="Subtitle source">
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === 'upload'}
            onClick={() => setSourceTab('upload')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              sourceTab === 'upload'
                ? 'bg-violet-500/25 text-white border border-violet-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === 'url'}
            onClick={() => setSourceTab('url')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              sourceTab === 'url'
                ? 'bg-violet-500/25 text-white border border-violet-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Paste URL
          </button>
        </div>

        {sourceTab === 'url' && (
          <form onSubmit={handleIngestUrl} className="space-y-3">
            <div className="relative flex items-center gap-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-700/80 px-3 py-2 focus-within:border-violet-500/70 transition-colors">
              <Link2 className="size-4 text-zinc-400 shrink-0" />
              <input
                type="url"
                value={ingestUrl}
                onChange={(e) => setIngestUrl(e.target.value)}
                placeholder="YouTube, Vimeo, Kick clip, Drive/Dropbox link, or video file URL"
                aria-label="Video URL"
                className="flex-1 min-w-0 w-0 min-h-[40px] bg-transparent border-0 outline-none pr-14 text-sm text-white placeholder:text-zinc-500 placeholder:truncate"
              />
              <button
                type="button"
                aria-label="Paste URL from clipboard"
                onClick={async () => {
                  try {
                    const t = await navigator.clipboard.readText();
                    if (t) setIngestUrl(t.trim());
                  } catch {
                    /* clipboard unavailable; paste manually */
                  }
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[11px] font-semibold text-zinc-200 hover:bg-white/[0.15] transition-colors cursor-pointer"
              >
                <ClipboardPaste className="size-3.5 text-violet-400" />
                <span>Paste</span>
              </button>
            </div>
            <input
              type="text"
              value={ingestTitle}
              onChange={(e) => setIngestTitle(e.target.value)}
              placeholder="Optional title for this subtitle project"
              aria-label="Optional project title"
              className="w-full rounded-2xl bg-zinc-950/70 border border-zinc-700/80 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/70"
            />
            {ingestError && (
              <p role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{ingestError}</span>
              </p>
            )}
            <Button
              variant="brand"
              type="submit"
              disabled={isIngesting}
              className="w-full sm:w-auto text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            >
              {isIngesting ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArrowRight className="size-3.5 mr-1.5" />
              )}
              {isIngesting ? 'Importing video...' : 'Import video & create project'}
            </Button>
            <p className="text-[11px] text-zinc-500">
              Import only: the video is fetched and a subtitle project is created. Transcription starts separately and uses credits.
            </p>
            <p className="text-[11px] text-zinc-500">
              Kick: completed public clips. Google Drive and Dropbox: public single-file share links. Private, folder, live, and DRM-protected videos cannot be imported.
            </p>
          </form>
        )}

        {sourceTab === 'upload' && (
        <>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-zinc-700/80 hover:border-zinc-500 bg-zinc-950/40 hover:bg-zinc-900/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.webm,.avi,.mkv,video/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />

          <div className="max-w-md mx-auto space-y-4">
            <div className="size-16 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mx-auto shadow-lg">
              <UploadCloud className="size-8" />
            </div>

            <div className="space-y-1">
              <p className="text-sm md:text-base font-bold text-white">
                Drag and drop your video file here, or <span className="text-violet-400 underline">browse</span>
              </p>
              <p className="text-xs text-zinc-500">
                Supports MP4, MOV, WEBM, MKV, and AVI up to 2 GB
              </p>
            </div>
          </div>
        </div>

        {/* Selected File Card & Upload Action */}
        {selectedFile && !isUploading && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center border border-violet-500/30">
                  <FileVideo className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white truncate max-w-sm">{selectedFile.name}</p>
                  <p className="text-[11px] text-zinc-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    {fileDuration ? ` • ${Math.round(fileDuration)} seconds` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Credit Cost Estimate Pill */}
                {isCreditEstimateLoading ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                    <Loader2 className="size-3.5 animate-spin text-violet-400" />
                    <span>Estimating cost...</span>
                  </div>
                ) : creditEstimate ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                    <Zap className="size-3.5 text-violet-400" />
                    <span className="text-zinc-400">Cost:</span>
                    <span className="font-bold text-white">
                      {creditEstimate.estimated_credits === 0
                        ? '0 Credits (Reused)'
                        : `${creditEstimate.estimated_credits} Credits`}
                    </span>
                    <span className="text-[10px] text-zinc-500 hidden sm:inline">
                      ({creditEstimate.rate_description})
                    </span>
                  </div>
                ) : null}

                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="size-4" />
                </button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleStartUploadAndTranscribe}
                  disabled={
                    creditEstimate
                      ? !creditEstimate.has_sufficient_credits && !wallet?.is_unlimited
                      : false
                  }
                  className="text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                >
                  <Sparkles className="size-3.5 mr-1.5" />
                  Upload & Generate Subtitles
                </Button>
              </div>
            </div>

            {/* Cost Transparency Breakdown */}
            <CostTransparencySummary
              estimate={creditEstimate}
              wallet={wallet}
              durationSeconds={fileDuration || 60}
              isReusedTranscript={creditEstimate?.estimated_credits === 0}
              isLoading={isCreditEstimateLoading}
              operationLabel="Subtitle Speech-to-Text"
              className="mt-3"
            />

            {/* Insufficient Credits Alert */}
            {creditEstimate &&
              !creditEstimate.has_sufficient_credits &&
              !wallet?.is_unlimited && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex flex-wrap items-center justify-between gap-3 text-xs text-red-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                    <span>
                      Insufficient Credits: This video requires{' '}
                      <strong>{creditEstimate.estimated_credits} credits</strong>, but your wallet
                      only has <strong>{wallet?.available_credits ?? 0} credits</strong> available.
                    </span>
                  </div>
                  <Link
                    to="/billing"
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-medium transition text-[11px]"
                  >
                    Upgrade Plan
                  </Link>
                </div>
              )}
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-semibold flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-violet-400" />
                Uploading video to secure storage...
              </span>
              <span className="font-mono text-violet-400 font-bold">{uploadProgress}%</span>
            </div>

            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-violet-600 to-indigo-500 h-2.5 rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
              <span>
                {uploadStats
                  ? `${(uploadStats.loaded / (1024 * 1024)).toFixed(1)} MB / ${(uploadStats.total / (1024 * 1024)).toFixed(1)} MB`
                  : 'Preparing upload stream...'}
              </span>
              <button
                onClick={handleCancelUpload}
                className="text-red-400 hover:text-red-300 underline font-sans"
              >
                Cancel Upload
              </button>
            </div>
          </div>
        )}

        {/* Upload Error Banner */}
        {uploadError && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-red-400" />
            <span className="flex-1">{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-zinc-400 hover:text-white">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {/* Recent Subtitle Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Film className="size-5 text-violet-400" />
            <span>Recent Subtitle Projects</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadProjects}
            disabled={isLoadingProjects}
            className="text-xs text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isLoadingProjects ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {isLoadingProjects ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            <Loader2 className="size-6 mx-auto animate-spin text-violet-400 mb-2" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <Captions className="size-10 mx-auto text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-300">No subtitle projects yet</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Upload a video above to generate and edit accurate subtitles with custom presets.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => {
              const cueCount = proj.subtitle_cues?.length || 0;
              return (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/subtitles/${proj.id}`)}
                  className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800/50 transition-all cursor-pointer group shadow-lg flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                        {proj.video_status}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(proj.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white group-hover:text-violet-300 transition truncate">
                      {proj.title}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-zinc-500" />
                        {proj.duration_seconds ? `${Math.round(proj.duration_seconds)}s` : '--'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Captions className="size-3 text-zinc-500" />
                        {cueCount} cues
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-violet-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Open Studio</span>
                    <ArrowRight className="size-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
