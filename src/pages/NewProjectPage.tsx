import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Upload,
  Link2,
  XCircle,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Video,
  Clock,
  Wand2,
  Zap,
  Scissors,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { projectService } from '../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import {
  ClipPreferencesControl,
  loadSavedClipPreferences,
  saveClipPreferencesToStorage,
} from '../components/clips/ClipPreferencesControl';
import { ClipPreferences } from '../types';

const SAMPLE_VIDEOS = [
  {
    label: '🎙️ Tech Podcast',
    url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY',
    title: 'Future of Generative AI & Creative Work',
  },
  {
    label: '🚀 Startup Keynote',
    url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
    title: 'Building Products People Love',
  },
  {
    label: '💡 Growth Masterclass',
    url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    title: 'Viral Hooks and Retention Strategies',
  },
];

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [clipPreferences, setClipPreferences] = useState<ClipPreferences>(() => loadSavedClipPreferences());
  const [progress, setProgress] = useState<number | null>(null);
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prefillUrl = searchParams.get('url');
    if (prefillUrl) {
      setUrl(prefillUrl);
      setMode('url');
      if (!title) {
        try {
          const u = new URL(prefillUrl);
          const name = u.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
          if (name) setTitle(decodeURIComponent(name));
        } catch {
          // ignore
        }
      }
    }
  }, [searchParams]);

  // Extract YouTube ID for instant rich thumbnail preview
  useEffect(() => {
    if (!url.trim()) {
      setDetectedYtId(null);
      return;
    }
    const match = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    if (match && match[1]) {
      setDetectedYtId(match[1]);
    } else {
      setDetectedYtId(null);
    }
  }, [url]);

  const handlePickFile = (f?: File) => {
    if (!f) return;
    const validation = validateVideoFile(f);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please select a valid video file.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProgress(null);
    setErrorMsg('Upload was cancelled.');
    setUploadFailed(true);
  };

  const executeUploadFlow = async () => {
    if (!file) return;

    if (!user) {
      setErrorMsg('You must be signed in to create a project and upload videos.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    setProgress(0);

    const projectId = pendingProjectIdRef.current || crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let projectCreated = false;

    try {
      if (!pendingProjectIdRef.current) {
        const combinedNotes = [
          `[Aspect: ${clipPreferences.aspectRatio}]`,
          `[Duration: ${clipPreferences.preferredDurations}]`,
          `[Genre: ${clipPreferences.genre}]`,
          `[Goal: ${clipPreferences.contentGoal}]`,
          clipPreferences.topicKeywords?.length ? `[Topics: ${clipPreferences.topicKeywords.join(', ')}]` : '',
          notes.trim(),
          clipPreferences.customInstructions?.trim() || '',
        ].filter(Boolean).join(' ');

        await projectService.createProjectAsync({
          id: projectId,
          userId: user.id,
          title: title.trim(),
          sourceType: 'upload',
          videoStatus: 'uploading',
          notes: combinedNotes,
          clip_preferences: clipPreferences,
        });
        pendingProjectIdRef.current = projectId;
      }
      projectCreated = true;

      await uploadVideoFile({
        file,
        projectId,
        onProgress: (pct) => setProgress(pct),
        signal: abortController.signal,
      });

      setProgress(100);
      abortControllerRef.current = null;
      pendingProjectIdRef.current = null;
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('cancelled');
      const message = isAbort
        ? 'Upload was cancelled.'
        : err.message || 'Failed to upload video.';

      console.error('[Upload Flow Failed]', err);

      if (projectCreated) await projectService.fetchProject(projectId).catch(() => undefined);

      setErrorMsg(message);
      setUploadFailed(true);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setUploadFailed(false);

    if (mode === 'upload' && !file) {
      setErrorMsg('Please choose a video file to upload.');
      return;
    }
    if (mode === 'url' && !url.trim()) {
      setErrorMsg('Please enter a valid video URL.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Please give your project a title.');
      return;
    }

    if (mode === 'upload') {
      await executeUploadFlow();
    } else {
      if (!user) {
        setErrorMsg('You must be signed in to create a project.');
        return;
      }

      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are supported.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Please enter a valid HTTP or HTTPS video URL.');
        return;
      }

      setErrorMsg(null);
      setIsIngestingUrl(true);

      try {
        const combinedNotes = [
          `[Aspect: ${clipPreferences.aspectRatio}]`,
          `[Duration: ${clipPreferences.preferredDurations}]`,
          `[Genre: ${clipPreferences.genre}]`,
          `[Goal: ${clipPreferences.contentGoal}]`,
          clipPreferences.topicKeywords?.length ? `[Topics: ${clipPreferences.topicKeywords.join(', ')}]` : '',
          notes.trim(),
          clipPreferences.customInstructions?.trim() || '',
        ].filter(Boolean).join(' ');

        const proj = await projectService.ingestProjectUrlAsync({
          url: url.trim(),
          title: title.trim(),
          notes: combinedNotes,
          clip_preferences: clipPreferences,
        });
        setIsIngestingUrl(false);
        navigate(`/projects/${proj.id}`);
      } catch (err: any) {
        setIsIngestingUrl(false);
        setErrorMsg(err.message || 'Failed to import video from URL.');
      }
    }
  };

  const isUploading = progress !== null && progress < 100;
  const isBusy = isUploading || isIngestingUrl;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Back button */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      {/* Hero Title Section */}
      <div className="text-center space-y-2.5 max-w-2xl mx-auto pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-semibold backdrop-blur-sm shadow-[0_0_15px_rgba(139,92,246,0.15)]">
          <Sparkles className="size-3.5 text-violet-400" />
          <span>Autonomous AI Clipping Engine</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F4F6FB] font-['Sora',sans-serif]">
          Turn One Video Into Viral Short Clips
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Paste any YouTube URL or drop your raw video. Our AI identifies high-retention hooks, cuts dead air, creates kinetic word-pop captions, and reframes to 9:16 automatically.
        </p>
      </div>

      {/* Main Form Surface */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 p-5 sm:p-8 shadow-2xl backdrop-blur-xl"
      >
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="size-4 shrink-0 text-rose-400" />
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

        {/* Dual Tab Mode Switcher (Opus.pro style) */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode('url');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              mode === 'url'
                ? 'bg-gradient-to-r from-violet-600/30 to-purple-600/20 text-white border border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.2)]'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Link2 className="size-4 text-violet-400" />
            <span>Paste Video URL</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 font-bold">
              Fastest
            </span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode('upload');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-gradient-to-r from-violet-600/30 to-purple-600/20 text-white border border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.2)]'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Upload className="size-4 text-cyan-400" />
            <span>Upload File</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-slate-300 font-medium">
              Up to 2GB
            </span>
          </button>
        </div>

        {/* Tab 1: Video URL Mode */}
        {mode === 'url' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0A0B10]/90 p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Enter Public Video URL *
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Link2 className="size-4.5 text-violet-400" />
                  </div>
                  <input
                    type="url"
                    value={url}
                    disabled={isIngestingUrl}
                    required
                    placeholder="https://www.youtube.com/watch?v=... or YouTube Shorts link"
                    onChange={(e) => {
                      const val = e.target.value;
                      setUrl(val);
                      if (!title && val.trim()) {
                        try {
                          const u = new URL(val.trim());
                          if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname.toLowerCase())) {
                            const filename = u.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
                            if (filename) setTitle(decodeURIComponent(filename));
                          }
                        } catch {}
                      }
                    }}
                    className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-[#F4F6FB] placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all font-sans"
                  />
                </div>
              </div>

              {/* Instant YouTube Detected Thumbnail Card */}
              {detectedYtId && (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3.5 animate-in fade-in duration-200">
                  <img
                    src={`https://img.youtube.com/vi/${detectedYtId}/hqdefault.jpg`}
                    alt="YouTube Video Preview"
                    className="w-24 h-14 object-cover rounded-lg border border-white/10 shadow-sm shrink-0"
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="size-3.5" />
                      <span>Valid YouTube Video Detected</span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">
                      Our engine will download high-definition audio & video for optimal clipping.
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Sample Selector */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Or test with a sample video:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_VIDEOS.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setUrl(sample.url);
                        setTitle(sample.title);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-medium text-slate-300 hover:text-white hover:border-violet-500/40 hover:bg-violet-500/10 transition-all cursor-pointer"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Supported Sources Bar */}
              <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Supported:</span>
                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">YouTube Watch URLs</span>
                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">YouTube Shorts</span>
                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">youtu.be links</span>
                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">Direct MP4/WebM CDN URLs</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Upload File Mode */}
        {mode === 'upload' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isUploading) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (!isUploading) handlePickFile(e.dataTransfer.files[0]);
            }}
            className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all bg-[#0A0B10]/90 ${
              isDragOver
                ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_25px_rgba(139,92,246,0.25)]'
                : 'border-white/[0.12] hover:border-white/25'
            }`}
          >
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/25 shadow-lg">
              <Upload className="size-7" />
            </div>

            <h2 className="mt-4 text-base sm:text-lg font-bold text-white font-['Sora',sans-serif]">
              {file ? file.name : 'Drag and drop your raw video file here'}
            </h2>

            <p className="mt-1.5 text-xs text-slate-400">
              {file ? (
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {(file.size / 1024 / 1024).toFixed(1)} MB ready to upload
                </span>
              ) : (
                <>
                  or{' '}
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-violet-400 underline hover:text-violet-300 cursor-pointer"
                  >
                    browse files from your device
                  </button>
                </>
              )}
            </p>

            {file && !isUploading && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.12] cursor-pointer transition-all"
              >
                Change video file
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
              className="sr-only"
              disabled={isUploading}
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-wrap justify-center items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                MP4, MOV, WEBM, MKV
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                Up to 2 GB
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                Up to 2 hours
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                1080p HD+
              </span>
            </div>
          </div>
        )}

        {/* Project Title & Context */}
        <div className="space-y-4">
          <Input
            label="Project Title *"
            rightLabel={`${title.length}/100`}
            maxLength={100}
            required
            placeholder="e.g. AI Product Launch Keynote 2026"
            value={title}
            disabled={isBusy}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            label="AI Instructions / Focus Topics (Optional)"
            rightLabel={`${notes.length}/500`}
            rows={2}
            maxLength={500}
            placeholder="e.g. Focus on product pricing, the viral story about our first customer, and humorous moments..."
            value={notes}
            disabled={isBusy}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* AI Clip Preferences Control Engine */}
          <div className="pt-2">
            <ClipPreferencesControl
              preferences={clipPreferences}
              onChange={(newPrefs) => {
                setClipPreferences(newPrefs);
                saveClipPreferencesToStorage(newPrefs);
              }}
              disabled={isBusy}
            />
          </div>
        </div>

        {/* Autonomous Feature Pillars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {[
            { icon: Zap, title: 'Viral Hook Detect', desc: 'Auto-finds first 3s hook' },
            { icon: Wand2, title: 'Kinetic Subtitles', desc: 'Synchronized word-pop' },
            { icon: Scissors, title: 'Dead-Air Removal', desc: 'Silences automatically cut' },
            { icon: Video, title: '9:16 Auto-Reframe', desc: 'Speaker face tracking' },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center gap-2.5"
            >
              <div className="size-7 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 grid place-items-center shrink-0">
                <feature.icon className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{feature.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Upload Progress Presentation */}
        {isUploading && (
          <div className="space-y-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="size-2 rounded-full bg-violet-400 animate-ping" />
                Uploading video directly to Cloudflare R2…
              </span>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 hover:underline cursor-pointer"
              >
                <XCircle className="size-3.5" />
                Cancel
              </button>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
              <span>
                {file
                  ? `${(((file.size * (progress || 0)) / 100) / (1024 * 1024)).toFixed(1)} MB of ${(
                      file.size /
                      (1024 * 1024)
                    ).toFixed(1)} MB`
                  : ''}
              </span>
              <span className="font-bold text-emerald-400">{progress}%</span>
            </div>
          </div>
        )}

        {/* URL Ingestion Indeterminate State */}
        {isIngestingUrl && (
          <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="size-2 rounded-full bg-violet-400 animate-ping" />
                Importing and verifying video stream…
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Downloading high-definition stream, extracting 16kHz dialogue audio, and provisioning AI clipping pipeline…
            </p>
          </div>
        )}

        {/* Submit Action Bar */}
        <div className="space-y-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full h-12 text-sm sm:text-base font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-[0_0_25px_rgba(139,92,246,0.35)] border border-violet-400/40 cursor-pointer"
            disabled={isBusy || (mode === 'upload' && !file) || (mode === 'url' && !url.trim())}
          >
            <Sparkles className="size-4.5 mr-2" />
            {isUploading
              ? 'Uploading Video to Cloud…'
              : isIngestingUrl
              ? 'Importing Video Stream…'
              : 'Generate Viral Clips →'}
          </Button>

          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" />
              Expected Yield: 5–12 Clips
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-violet-400" />
              Ready in ~90s
            </span>
            <span>•</span>
            <span>Runs 24/7 in background</span>
          </div>
        </div>
      </form>
    </div>
  );
};
export default NewProjectPage;
