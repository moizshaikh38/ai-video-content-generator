import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Upload,
  Link2,
  XCircle,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  FileSearch,
  Download,
  Scissors,
  Clock,
  Zap,
  Wand2,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  FileVideo,
  Sliders,
  ArrowRight,
  RotateCcw,
  Film,
  Clock3,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { projectService } from '../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import {
  ClipPreferencesControl,
  GENRE_OPTIONS,
  GOAL_OPTIONS,
  DURATION_OPTIONS,
  loadSavedClipPreferences,
  saveClipPreferencesToStorage,
} from '../components/clips/ClipPreferencesControl';
import { LivePreviewPanel } from '../components/newProject/LivePreviewPanel';
import { ClipPreferences } from '../types';
import { getGenreLayoutMode } from '../lib/genreLayoutModes';
import {
  extractYouTubeId,
  probeVideoUrl,
  formatDuration,
  MAX_SOURCE_DURATION_SECONDS,
} from '../services/urlProbeService';

const SAMPLE_VIDEOS = [
  {
    label: 'AI keynote — OpenAI DevDay',
    icon: Sparkles,
    url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY',
    title: 'OpenAI DevDay Opening Keynote',
  },
  {
    label: 'Iconic speech — Stanford 2005',
    icon: GraduationCap,
    url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
    title: 'Steve Jobs — Stanford Commencement Address',
  },
];

const URL_INGEST_STAGES = [
  { label: 'Verifying link & safety checks', icon: ShieldCheck },
  { label: 'Reading video metadata', icon: FileSearch },
  { label: 'Downloading HD stream', icon: Download },
  { label: 'Preparing clipping pipeline', icon: Scissors },
];

type ProbeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; title?: string; channel?: string; duration?: number; thumbnail?: string; provider: string; suggestedGenre?: string }
  | { status: 'soft-fail'; error?: string }
  | { status: 'error'; error: string };

const SPEED_SAMPLE_WINDOW = 6;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [clipPreferences, setClipPreferences] = useState<ClipPreferences>(() => loadSavedClipPreferences());
  const [showTune, setShowTune] = useState(false);
  const [probe, setProbe] = useState<ProbeState>({ status: 'idle' });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [upload, setUpload] = useState<{ pct: number; loaded: number; total: number; speedBps: number; etaSec: number } | null>(null);
  const [ingest, setIngest] = useState<{ stage: number; elapsedSec: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);
  const pendingProjectIdRef = useRef<string | null>(null);
  const speedSamplesRef = useRef<Array<{ t: number; loaded: number }>>([]);
  const dragDepthRef = useRef(0);
  const advanceTimerRef = useRef<number | null>(null);

  const ytId = useMemo(() => extractYouTubeId(url.trim()), [url]);
  const isUploading = upload !== null;
  const isIngesting = ingest !== null;
  const isBusy = isUploading || isIngesting;

  // Keep the latest titleTouched for the probe effect without re-triggering it on keystrokes.
  const titleTouchedRef = useRef(titleTouched);
  useEffect(() => {
    titleTouchedRef.current = titleTouched;
  }, [titleTouched]);

  const probeDuration = probe.status === 'ok' ? probe.duration : undefined;
  const durationBlocked = typeof probeDuration === 'number' && probeDuration > MAX_SOURCE_DURATION_SECONDS;
  const durationLong =
    !durationBlocked && typeof probeDuration === 'number' && probeDuration > MAX_SOURCE_DURATION_SECONDS * 0.75;

  // ── Prefill from ?url= query param (shared links / dashboard CTAs) ──────────
  useEffect(() => {
    const prefillUrl = searchParams.get('url');
    if (prefillUrl) {
      setUrl(prefillUrl);
      setMode('url');
    }
  }, [searchParams]);

  // ── Debounced URL probe: metadata + validation before the user commits ──────
  useEffect(() => {
    const trimmed = url.trim();
    if (mode !== 'url' || trimmed.length < 8) {
      setProbe({ status: 'idle' });
      return;
    }

    let plausible = false;
    try {
      const parsed = new URL(trimmed);
      plausible = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      plausible = false;
    }
    if (!plausible || !user) {
      setProbe({ status: 'idle' });
      return;
    }

    setProbe({ status: 'loading' });
    const timer = window.setTimeout(async () => {
      probeAbortRef.current?.abort();
      const controller = new AbortController();
      probeAbortRef.current = controller;
      try {
        const result = await probeVideoUrl(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === 'ok' && result.data) {
          setProbe({
            status: 'ok',
            title: result.data.title,
            channel: result.data.channel,
            duration: result.data.duration,
            thumbnail: result.data.thumbnail,
            provider: result.data.provider,
            suggestedGenre: result.data.suggestedGenre,
          });
          if (!titleTouchedRef.current && result.data.title) {
            setTitle(result.data.title.slice(0, 100));
          }
        } else if (result.status === 'error') {
          setProbe({ status: 'error', error: result.error || 'This link cannot be imported.' });
        } else {
          setProbe({ status: 'soft-fail', error: result.error });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') setProbe({ status: 'soft-fail' });
      }
    }, 650);

    return () => {
      window.clearTimeout(timer);
      probeAbortRef.current?.abort();
    };
  }, [url, mode, user]);

  // ── Ingestion staged timer (time-based stages; server gives no progress) ────
  useEffect(() => {
    if (!ingest) return;
    const id = window.setInterval(() => {
      setIngest((prev) => {
        if (!prev) return prev;
        const elapsed = prev.elapsedSec + 1;
        const stage = elapsed < 2 ? 0 : elapsed < 4 ? 1 : 2;
        return { elapsedSec: elapsed, stage };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [ingest]);

  // ── File preview object URL lifecycle ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      probeAbortRef.current?.abort();
    };
  }, [filePreviewUrl]);

  const handlePickFile = (f?: File, autoAdvance = false) => {
    if (!f) return;
    const validation = validateVideoFile(f);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please select a valid video file.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setFileDuration(null);
    setFile(f);
    setMode('upload');
    if (!titleTouched) {
      setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 100));
    }

    if (autoAdvance) {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => setStep(2), 450);
    }
  };

  // ── Full-page drag & drop ───────────────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => {
    if (isBusy || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    if (isBusy) return;
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    handlePickFile(e.dataTransfer.files[0], true);
  };

  const buildCombinedNotes = () =>
    [
      `[Aspect: ${clipPreferences.aspectRatio}]`,
      `[Duration: ${clipPreferences.preferredDurations}]`,
      `[Genre: ${clipPreferences.genre}]`,
      `[Goal: ${clipPreferences.contentGoal}]`,
      clipPreferences.topicKeywords?.length ? `[Topics: ${clipPreferences.topicKeywords.join(', ')}]` : '',
      notes.trim(),
      clipPreferences.customInstructions?.trim() || '',
    ].filter(Boolean).join(' ');

  // ── Upload flow with speed / ETA telemetry ──────────────────────────────────
  const executeUploadFlow = async () => {
    if (!file) return;

    if (!user) {
      setErrorMsg('You must be signed in to create a project and upload videos.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    speedSamplesRef.current = [];
    setUpload({ pct: 0, loaded: 0, total: file.size, speedBps: 0, etaSec: 0 });

    const projectId = pendingProjectIdRef.current || crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let projectCreated = false;

    try {
      if (!pendingProjectIdRef.current) {
        await projectService.createProjectAsync({
          id: projectId,
          userId: user.id,
          title: title.trim(),
          sourceType: 'upload',
          videoStatus: 'uploading',
          notes: buildCombinedNotes(),
          clip_preferences: clipPreferences,
        });
        pendingProjectIdRef.current = projectId;
      }
      projectCreated = true;

      await uploadVideoFile({
        file,
        projectId,
        onProgress: (pct, stats) => {
          const now = performance.now();
          if (stats) {
            speedSamplesRef.current.push({ t: now, loaded: stats.loaded });
            if (speedSamplesRef.current.length > SPEED_SAMPLE_WINDOW) speedSamplesRef.current.shift();
            const samples = speedSamplesRef.current;
            let speedBps = 0;
            if (samples.length >= 2) {
              const first = samples[0];
              const last = samples[samples.length - 1];
              const dt = (last.t - first.t) / 1000;
              if (dt > 0.4) speedBps = Math.max(0, (last.loaded - first.loaded) / dt);
            }
            const etaSec = speedBps > 0 ? (stats.total - stats.loaded) / speedBps : 0;
            setUpload({ pct, loaded: stats.loaded, total: stats.total, speedBps, etaSec });
          } else {
            setUpload((prev) => (prev ? { ...prev, pct } : prev));
          }
        },
        signal: abortController.signal,
      });

      setUpload(null);
      abortControllerRef.current = null;
      pendingProjectIdRef.current = null;
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('cancelled');
      const message = isAbort ? 'Upload was cancelled.' : err.message || 'Failed to upload video.';

      console.error('[Upload Flow Failed]', err);

      if (projectCreated) await projectService.fetchProject(projectId).catch(() => undefined);

      setErrorMsg(message);
      setUploadFailed(true);
      setUpload(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUpload(null);
    setErrorMsg('Upload was cancelled.');
    setUploadFailed(true);
  };

  // ── URL ingestion flow (staged takeover while the server downloads) ─────────
  const executeIngestFlow = async () => {
    if (!user) {
      setErrorMsg('You must be signed in to create a project.');
      return;
    }

    setErrorMsg(null);
    setIngest({ stage: 0, elapsedSec: 0 });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const proj = await projectService.ingestProjectUrlAsync({
        url: url.trim(),
        title: title.trim(),
        notes: buildCombinedNotes(),
        clip_preferences: clipPreferences,
        signal: controller.signal,
      });
      abortControllerRef.current = null;
      setIngest((prev) => (prev ? { ...prev, stage: 3 } : prev));
      window.setTimeout(() => navigate(`/projects/${proj.id}`), 600);
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      abortControllerRef.current = null;
      setIngest(null);
      setErrorMsg(
        isAbort
          ? 'Import cancelled. If the server already finished downloading, the project will appear on your dashboard.'
          : err.message || 'Failed to import video from URL.'
      );
    }
  };

  const handleContinue = () => {
    setErrorMsg(null);
    if (mode === 'upload' && !file) {
      setErrorMsg('Please choose a video file to upload.');
      return;
    }
    if (mode === 'url') {
      if (!url.trim()) {
        setErrorMsg('Please enter a valid video URL.');
        return;
      }
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
      } catch (err: any) {
        setErrorMsg(err.message || 'Please enter a valid HTTP or HTTPS video URL.');
        return;
      }
      if (probe.status === 'error') {
        setErrorMsg(probe.error);
        return;
      }
      if (durationBlocked) {
        setErrorMsg(`This video is ${formatDuration(probeDuration)} long — the maximum supported length is 2 hours.`);
        return;
      }
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setUploadFailed(false);

    if (!title.trim()) {
      setErrorMsg('Please give your project a title.');
      return;
    }

    if (mode === 'upload') {
      if (!file) {
        setErrorMsg('Please choose a video file to upload.');
        return;
      }
      await executeUploadFlow();
    } else {
      if (!url.trim()) {
        setErrorMsg('Please enter a valid video URL.');
        return;
      }
      await executeIngestFlow();
    }
  };

  // ── Derived preview labels ──────────────────────────────────────────────────
  const genreLabel =
    clipPreferences.genreSelectionMode === 'auto'
      ? 'Auto genre'
      : GENRE_OPTIONS.find((g) => g.id === clipPreferences.genre)?.label || 'Auto genre';
  const goalLabel = GOAL_OPTIONS.find((g) => g.id === clipPreferences.contentGoal)?.label || '';
  const durationLabel = DURATION_OPTIONS.find((d) => d.id === clipPreferences.preferredDurations)?.label || '';
  const previewGenre = clipPreferences.genreSelectionMode === 'auto' ? 'auto' : clipPreferences.genre;
  const previewLayout = clipPreferences.genreSelectionMode === 'auto'
    ? 'face_track' as const
    : (getGenreLayoutMode(clipPreferences.genre)) as any;
  const previewThumbnail = (probe.status === 'ok' && probe.thumbnail) || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

  const sourceSummary = () => {
    if (mode === 'upload' && file) {
      return {
        icon: <FileVideo className="size-5 text-zinc-300" aria-hidden="true" />,
        primary: file.name,
        secondary: [formatBytes(file.size), fileDuration ? formatDuration(fileDuration) : null].filter(Boolean).join(' · '),
      };
    }
    if (probe.status === 'ok') {
      return {
        icon: ytId ? (
          <img
            src={probe.thumbnail || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
            alt=""
            className="size-10 rounded-lg object-cover"
          />
        ) : (
          <Film className="size-5 text-violet-300" aria-hidden="true" />
        ),
        primary: probe.title || url,
        secondary: [probe.channel, probe.duration ? formatDuration(probe.duration) : null].filter(Boolean).join(' · ') || url,
      };
    }
    return {
      icon: <Film className="size-5 text-violet-300" aria-hidden="true" />,
      primary: url,
      secondary: 'Video link',
    };
  };

  const stepper = (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Progress">
      {['Source', 'Mission'].map((label, i) => {
        const index = i + 1;
        const active = step === index;
        const done = step > index;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-violet-500/15 text-violet-200'
                  : done
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-white/[0.04] text-zinc-400'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`grid size-4 place-items-center rounded-full text-[10px] font-bold ${
                  done ? 'bg-emerald-400 text-vc-action-foreground' : active ? 'bg-violet-400 text-vc-action-foreground' : 'bg-white/10 text-zinc-300'
                }`}
              >
                {done ? <CheckCircle2 className="size-3" aria-hidden="true" /> : index}
              </span>
              {label}
            </span>
            {i === 0 && <span className="h-px w-6 sm:w-10 bg-white/10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div
      className="relative max-w-5xl mx-auto pb-12 space-y-6"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Full-page drop overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 grid place-items-center glass-scrim glass-scrim-deep p-6" role="status" aria-label="Drop to upload">
          <div className="rounded-3xl border-2 border-dashed border-white/40 bg-white/[0.04] px-10 py-12 text-center">
            <Upload className="mx-auto size-12 text-zinc-200" aria-hidden="true" />
            <p className="mt-4 text-lg font-bold text-white font-['Sora',sans-serif]">Drop your video anywhere</p>
            <p className="mt-1 text-xs text-zinc-300">MP4, MOV, WEBM or MKV · up to 2 GB · up to 2 hours</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="np-rise flex flex-wrap items-center justify-between gap-3 pt-1">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Dashboard
        </Link>
        {stepper}
      </div>

      {step === 1 ? (
        <>
          {/* Hero */}
          <div className="np-rise text-center space-y-2.5 max-w-2xl mx-auto pt-2" style={{ animationDelay: '60ms' }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-semibold">
              <Sparkles className="size-3.5 text-violet-400" aria-hidden="true" />
              <span>Autonomous AI Clipping Engine</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-vc-text-primary font-['Sora',sans-serif]">
              Turn one video into viral shorts
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Paste a link or drop a file. The AI finds high-retention hooks, cuts dead air, adds kinetic captions and
              reframes to vertical — you review the results.
            </p>
          </div>

          {/* Step 1 card */}
          <div
            className="np-rise space-y-6 rounded-2xl p-5 sm:p-8"
            style={{ animationDelay: '120ms' }}
          >
            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center justify-between gap-3 rounded-xl bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="size-4 shrink-0 text-rose-400" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
                {uploadFailed && file && (
                  <button
                    type="button"
                    onClick={executeUploadFlow}
                    className="font-semibold underline hover:text-white cursor-pointer ml-2"
                  >
                    Retry Upload
                  </button>
                )}
              </div>
            )}

            {/* Mode tabs */}
            <div
              role="tablist"
              aria-label="Video source"
              className="grid grid-cols-2 gap-2 p-1.5 rounded-full bg-white/[0.05] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'url'}
                disabled={isBusy}
                onClick={() => {
                  setMode('url');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-full py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer active:translate-y-px ${
                  mode === 'url'
                    ? 'bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Link2 className="size-4" aria-hidden="true" />
                <span>Paste video URL</span>
                <span className="hidden sm:inline-block px-1.5 py-px rounded-full text-[10px] font-mono bg-white/15 text-white font-bold">
                  Fastest
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'upload'}
                disabled={isBusy}
                onClick={() => {
                  setMode('upload');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-full py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer active:translate-y-px ${
                  mode === 'upload'
                    ? 'bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Upload className="size-4" aria-hidden="true" />
                <span>Upload file</span>
                <span className="hidden sm:inline-block px-1.5 py-px rounded-full text-[10px] font-mono bg-white/10 text-zinc-200 font-medium">
                  Up to 2 GB
                </span>
              </button>
            </div>

            {mode === 'url' ? (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="video-url-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2"
                  >
                    Video URL <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                      <Link2 className="size-5 text-violet-400" aria-hidden="true" />
                    </div>
                    <input
                      id="video-url-input"
                      type="url"
                      value={url}
                      disabled={isBusy}
                      placeholder="Paste a YouTube link or a direct MP4/WebM URL"
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleContinue();
                        }
                      }}
                      className="w-full h-14 pl-12 pr-4 rounded-full bg-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] text-sm sm:text-base text-vc-text-primary placeholder:text-zinc-500 focus:outline-none focus:bg-white/[0.08] focus:ring-2 focus:ring-violet-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Metadata card states */}
                {probe.status === 'loading' && (
                  <div className="flex items-center gap-3.5 rounded-xl bg-white/[0.03] p-3.5">
                    <div className="h-14 w-24 rounded-lg np-shimmer" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded np-shimmer" />
                      <div className="h-2.5 w-1/3 rounded np-shimmer" />
                    </div>
                  </div>
                )}

                {probe.status === 'ok' && !durationBlocked && (
                  <div
                    className={`flex items-center gap-3.5 p-3.5 rounded-xl ${
                      durationLong ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                    }`}
                  >
                    {ytId || probe.thumbnail ? (
                      <img
                        src={probe.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '')}
                        alt=""
                        className="w-24 h-14 object-cover rounded-lg shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="grid size-14 place-items-center rounded-lg bg-white/[0.04] shrink-0">
                        <Film className="size-6 text-violet-300" aria-hidden="true" />
                      </div>
                    )}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        <span>Video verified{probe.channel ? ` · ${probe.channel}` : ''}</span>
                        {typeof probe.duration === 'number' && (
                          <span className="font-mono text-zinc-300">{formatDuration(probe.duration)}</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-200 truncate font-medium">{probe.title || 'Ready to import'}</p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {durationLong
                          ? 'Long video — import and processing will take a while, but they run on our servers.'
                          : 'Title and duration detected — these will pre-fill your project.'}
                      </p>
                    </div>
                  </div>
                )}

                {probe.status === 'error' && (
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-rose-500/10">
                    <div className="grid size-10 place-items-center rounded-lg bg-rose-500/10 shrink-0">
                      <AlertCircle className="size-5 text-rose-400" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-rose-300">This link can't be imported</p>
                      <p className="text-[11px] text-rose-200/80">{probe.error}</p>
                    </div>
                  </div>
                )}

                {probe.status === 'soft-fail' && (
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-white/[0.03]">
                    <div className="grid size-10 place-items-center rounded-lg bg-white/[0.04] shrink-0">
                      <Film className="size-5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-300">Couldn't verify this link yet</p>
                      <p className="text-[11px] text-zinc-400">We'll validate it again when you start the import.</p>
                    </div>
                  </div>
                )}

                {durationBlocked && (
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-rose-500/10">
                    <AlertCircle className="size-5 text-rose-400 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-rose-300">
                        Too long: {formatDuration(probeDuration)} (max 2 hours)
                      </p>
                      <p className="text-[11px] text-rose-200/80">Trim the source or pick a shorter video.</p>
                    </div>
                  </div>
                )}

                {/* Samples */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Or try it with a sample video
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_VIDEOS.map((sample) => (
                      <button
                        key={sample.label}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setUrl(sample.url);
                          if (!titleTouched) setTitle(sample.title);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] text-xs font-medium text-zinc-300 hover:text-white hover:bg-violet-500/10 transition-all cursor-pointer"
                      >
                        <sample.icon className="size-3.5 text-violet-300" aria-hidden="true" />
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Supported sources */}
                <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">Supported:</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04]">YouTube Watch URLs</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04]">YouTube Shorts</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04]">youtu.be links</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04]">Direct MP4/WebM URLs</span>
                </div>
              </div>
            ) : (
              /* Upload dropzone / file card */
              <div
                className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all bg-vc-surface1/90 ${
                  file ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-white/[0.12] hover:border-white/25'
                }`}
              >
                {file && filePreviewUrl ? (
                  <div className="flex flex-col sm:flex-row items-center gap-5 text-left">
                    <video
                      src={`${filePreviewUrl}#t=0.5`}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => setFileDuration(e.currentTarget.duration || null)}
                      className="w-full sm:w-52 aspect-video rounded-xl bg-black object-cover"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        <span>Ready to upload</span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">{file.name}</p>
                      <p className="text-xs font-mono text-zinc-400">
                        {formatBytes(file.size)}
                        {fileDuration ? ` · ${formatDuration(fileDuration)}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.12] cursor-pointer transition-all"
                        >
                          Change file
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setFilePreviewUrl(null);
                            setFileDuration(null);
                          }}
                          className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer transition-all"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-500/10 text-violet-400 shadow-lg">
                      <Upload className="size-7" aria-hidden="true" />
                    </div>
                    <h2 className="mt-4 text-base sm:text-lg font-bold text-white font-['Sora',sans-serif]">
                      Drag and drop your video anywhere on this page
                    </h2>
                    <p className="mt-1.5 text-xs text-zinc-400">
                      or{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-semibold text-violet-400 underline hover:text-violet-300 cursor-pointer"
                      >
                        browse files from your device
                      </button>
                    </p>
                    <div className="mt-6 pt-4 flex flex-wrap justify-center items-center gap-2 text-[11px] text-zinc-400 font-mono">
                      <span className="px-2.5 py-1 rounded-md bg-white/[0.04]">MP4, MOV, WEBM, MKV</span>
                      <span className="px-2.5 py-1 rounded-md bg-white/[0.04]">Up to 2 GB</span>
                      <span className="px-2.5 py-1 rounded-md bg-white/[0.04]">Up to 2 hours</span>
                      <span className="px-2.5 py-1 rounded-md bg-white/[0.04]">1080p HD+</span>
                    </div>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
                  className="sr-only"
                  onChange={(e) => handlePickFile(e.target.files?.[0], true)}
                />
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full h-12 text-sm font-bold cursor-pointer group"
              disabled={isBusy || (mode === 'upload' && !file) || (mode === 'url' && !url.trim()) || probe.status === 'error' || durationBlocked}
              onClick={handleContinue}
            >
              Continue
              <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Button>
          </div>
        </>
      ) : (
        /* ── Step 2: Mission control ── */
        <form
          onSubmit={handleSubmit}
          className="np-rise grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start"
        >
          <div className="space-y-5 rounded-2xl p-5 sm:p-8">
            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center justify-between gap-3 rounded-xl bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="size-4 shrink-0 text-rose-400" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
                {uploadFailed && file && (
                  <button
                    type="button"
                    onClick={executeUploadFlow}
                    className="font-semibold underline hover:text-white cursor-pointer ml-2"
                  >
                    Retry Upload
                  </button>
                )}
              </div>
            )}

            {/* URL ingestion takeover */}
            {isIngesting && ingest && (
              <div className="space-y-4 rounded-xl bg-violet-500/[0.08] p-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full bg-violet-400 np-breathe" aria-hidden="true" />
                    Importing video…
                  </span>
                  <span className="font-mono text-xs text-zinc-300">{ingest.elapsedSec}s elapsed</span>
                </div>
                <ol className="space-y-2.5">
                  {URL_INGEST_STAGES.map((stage, i) => {
                    const done = ingest.stage > i;
                    const active = ingest.stage === i;
                    return (
                      <li key={stage.label} className="flex items-center gap-3 text-xs">
                        <span
                          className={`grid size-6 place-items-center rounded-full border ${
                            done
                              ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                              : active
                                ? 'border-violet-400/60 bg-violet-400/15 text-violet-200'
                                : 'border-white/10 bg-white/[0.03] text-zinc-500'
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          ) : (
                            <stage.icon className={`size-3.5 ${active ? 'np-breathe' : ''}`} aria-hidden="true" />
                          )}
                        </span>
                        <span className={done ? 'text-zinc-300' : active ? 'text-white font-semibold' : 'text-zinc-500'}>
                          {stage.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full w-full np-shimmer" />
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400">
                  <span>Larger videos take a few minutes. Clips are generated automatically once the import finishes.</span>
                  <button
                    type="button"
                    onClick={() => {
                      abortControllerRef.current?.abort();
                    }}
                    className="inline-flex items-center gap-1 shrink-0 font-semibold text-rose-300 hover:underline cursor-pointer"
                  >
                    <XCircle className="size-3.5" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Upload takeover */}
            {isUploading && upload && file && (
              <div className="space-y-2.5 rounded-xl bg-violet-500/[0.08] p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <span className="size-2 rounded-full bg-violet-400 np-breathe" aria-hidden="true" />
                    Uploading {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300 hover:underline cursor-pointer"
                  >
                    <XCircle className="size-3.5" aria-hidden="true" />
                    Cancel
                  </button>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-200"
                    style={{ width: `${upload.pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-300 font-mono">
                  <span>
                    {formatBytes(upload.loaded)} of {formatBytes(upload.total)}
                    {upload.speedBps > 0 ? ` · ${(upload.speedBps / (1024 * 1024)).toFixed(1)} MB/s` : ''}
                  </span>
                  <span className="font-bold text-emerald-400">
                    {upload.pct}%{upload.etaSec > 0 ? ` · ${formatEta(upload.etaSec)} left` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Source summary */}
            <div className="flex items-center gap-3.5 rounded-xl bg-white/[0.02] p-3.5">
              {sourceSummary().icon}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{sourceSummary().primary}</p>
                <p className="text-[11px] text-zinc-400 truncate">{sourceSummary().secondary}</p>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setStep(1)}
                className="shrink-0 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.1] cursor-pointer transition-all disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  <RotateCcw className="size-3" aria-hidden="true" />
                  Change
                </span>
              </button>
            </div>

            {/* Title + optional instructions */}
            <div className="space-y-4">
              <Input
                label="Project title"
                rightLabel={`${title.length}/100`}
                maxLength={100}
                required
                placeholder="e.g. AI Product Launch Keynote 2026"
                value={title}
                disabled={isBusy}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                }}
              />

              <Textarea
                label="Focus instructions (optional)"
                rightLabel={`${notes.length}/500`}
                rows={2}
                maxLength={500}
                placeholder="e.g. Focus on pricing, the customer story, and funny moments…"
                value={notes}
                disabled={isBusy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Preferences summary + disclosure */}
            <div className="rounded-2xl bg-white/[0.02] overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                    <Zap className="size-3.5 text-zinc-200" aria-hidden="true" />
                    AI clipping setup
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setShowTune((s) => !s)}
                    aria-expanded={showTune}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.1] cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Sliders className="size-3.5" aria-hidden="true" />
                    {showTune ? 'Hide tuning' : 'Tune'}
                    {showTune ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Current AI preferences">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                    <Wand2 className="size-3" aria-hidden="true" />
                    {genreLabel}
                  </span>
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                    {goalLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {durationLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                    <Scissors className="size-3" aria-hidden="true" />
                    {clipPreferences.aspectRatio}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Smart defaults are ready — most creators just hit Generate. Open <span className="font-semibold text-zinc-300">Tune</span> for
                  genre rubrics, goals, keywords and custom prompts.
                </p>
              </div>

              {showTune && (
                <div className="p-4">
                  <ClipPreferencesControl
                    preferences={clipPreferences}
                    onChange={(newPrefs) => {
                      setClipPreferences(newPrefs);
                      saveClipPreferencesToStorage(newPrefs);
                    }}
                    disabled={isBusy}
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="sm:w-auto px-6 cursor-pointer"
                  disabled={isBusy}
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  className="flex-1 h-12 text-sm sm:text-base font-bold cursor-pointer"
                  disabled={isBusy}
                >
                  <Sparkles className="size-4 mr-2" aria-hidden="true" />
                  {isUploading ? 'Uploading video…' : isIngesting ? 'Importing video…' : 'Generate clips'}
                  {!isBusy && <ArrowRight className="size-4 ml-2" aria-hidden="true" />}
                </Button>
              </div>
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 text-violet-400" aria-hidden="true" />
                  Processing runs on our servers
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="size-3.5 text-zinc-300" aria-hidden="true" />
                  Virality-ranked output
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="size-3.5 text-emerald-400" aria-hidden="true" />
                  Kinetic captions included
                </span>
              </p>
            </div>
          </div>

          {/* Live preview */}
          <div className="hidden lg:block sticky top-6">
            <LivePreviewPanel
              aspectRatio={clipPreferences.aspectRatio}
              genre={previewGenre}
              genreLabel={genreLabel}
              durationLabel={durationLabel}
              goalLabel={goalLabel}
              thumbnailUrl={previewThumbnail}
              layoutMode={previewLayout}
            />
          </div>
        </form>
      )}
    </div>
  );
};

export default NewProjectPage;
