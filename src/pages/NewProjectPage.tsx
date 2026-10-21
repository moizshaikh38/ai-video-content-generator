import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Link2, XCircle, ArrowLeft, Sparkles, AlertCircle } from 'lucide-react';
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

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [mode, setMode] = useState<'upload' | 'url'>('upload');
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
      // 1. Create project record in database with status 'uploading'
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

      // 2. Upload directly to R2 with byte-accurate browser progress
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
      // URL Ingestion Flow
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-400 transition-colors hover:text-[#8B5CF6]"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F4F6FB] font-['Sora',sans-serif]">
          Create a New Project
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">
          Turn your raw video into engaging short-form content in minutes. Upload a file or paste a video URL to get started.
        </p>
      </div>

      {/* Main Focused Upload Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 p-5 sm:p-7 shadow-2xl backdrop-blur-xl"
      >
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
            {uploadFailed && file && (
              <button
                type="button"
                onClick={executeUploadFlow}
                className="font-semibold underline hover:text-white cursor-pointer ml-2"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode('upload');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-[#8B5CF6]/25 text-white border border-[#8B5CF6]/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Upload className="size-4 text-neutral-300" />
            <span>Upload Video</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode('url');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              mode === 'url'
                ? 'bg-[#8B5CF6]/25 text-white border border-[#8B5CF6]/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Link2 className="size-4 text-neutral-300" />
            <span>Paste Video URL</span>
          </button>
        </div>

        {/* Upload File Mode */}
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
            className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all bg-[#0A0B10]/80 ${
              isDragOver
                ? 'border-white/40 bg-white/[0.15]/10'
                : 'border-white/[0.12] hover:border-white/25'
            }`}
          >
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/[0.15]/15 text-neutral-300 border border-white/[0.12] shadow-md">
              <Upload className="size-6" />
            </div>

            <h2 className="mt-3.5 text-base sm:text-lg font-semibold text-white">
              {file ? file.name : 'Drag and drop your video file here'}
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              {file ? (
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {(file.size / 1024 / 1024).toFixed(1)} MB ready to upload
                </span>
              ) : (
                <>
                  or click to{' '}
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-neutral-300 underline hover:text-white cursor-pointer"
                  >
                    browse files
                  </button>
                </>
              )}
            </p>

            {file && !isUploading && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.12] cursor-pointer"
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

            {/* Streamlined 4-pill strip inside bottom of dropzone */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap justify-center items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                MP4, MOV, AVI, WEBM
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

        {/* Paste Video URL Mode */}
        {mode === 'url' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0A0B10]/80 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.15]/15 text-neutral-300 border border-white/[0.12]">
                  <Link2 className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-white">
                    Import Video from Web URL
                  </h2>
                  <p className="text-xs text-slate-400">
                    Paste a publicly accessible YouTube link or video file URL.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Input
                  label="Video Web URL *"
                  placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
                  value={url}
                  disabled={isIngestingUrl}
                  required
                  onChange={(e) => {
                    const val = e.target.value;
                    setUrl(val);
                    if (!title && val.trim()) {
                      try {
                        const u = new URL(val.trim());
                        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname.toLowerCase())) {
                          // Backend yt-dlp will populate title
                        } else {
                          const filename = u.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
                          if (filename) setTitle(decodeURIComponent(filename));
                        }
                      } catch {
                        // ignore
                      }
                    }
                  }}
                />
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-slate-300 space-y-1.5">
                <p className="font-semibold text-white">Supported Sources:</p>
                <p className="text-white">&bull; YouTube videos: watch URLs, youtu.be links, and YouTube Shorts</p>
                <p className="text-white">&bull; Direct public video file URLs: MP4, MOV, WebM, AVI, MKV (cloud storage or CDNs)</p>
                <p className="text-amber-300/90 bg-amber-500/10 rounded-md px-2.5 py-1 border border-amber-500/20 text-[11px]">
                  &bull; Note: TikTok/Instagram page links and private/age-restricted YouTube videos are not supported.
                </p>
                <p className="text-slate-400 font-mono text-[11px]">&bull; Up to 2 GB &bull; Up to 2 hours</p>
              </div>
            </div>
          </div>
        )}

        {/* Form Inputs with Character Counters */}
        <div className="space-y-3.5">
          <Input
            label="Project Title *"
            rightLabel={`${title.length}/100`}
            maxLength={100}
            required
            placeholder="e.g. Startup Marketing Masterclass"
            value={title}
            disabled={isBusy}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            label="Notes (Optional)"
            rightLabel={`${notes.length}/500`}
            rows={2}
            maxLength={500}
            placeholder="Add any notes, context or specific instructions for AI..."
            value={notes}
            disabled={isBusy}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* AI Clip Preferences & Genre Selection */}
          <div className="pt-1">
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

        {/* Upload Progress Presentation (Real bytes only) */}
        {isUploading && (
          <div className="space-y-2 rounded-xl border border-white/[0.12] bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="size-2 rounded-full bg-white animate-ping" />
                Uploading video…
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

            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>
                {file
                  ? `${(((file.size * (progress || 0)) / 100) / (1024 * 1024)).toFixed(1)} MB of ${(
                      file.size /
                      (1024 * 1024)
                    ).toFixed(1)} MB`
                  : ''}
              </span>
              <span className="font-bold text-white">{progress}%</span>
            </div>
          </div>
        )}

        {/* URL Ingestion Indeterminate State */}
        {isIngestingUrl && (
          <div className="space-y-2 rounded-xl border border-white/[0.12] bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="size-2 rounded-full bg-white animate-ping" />
                Importing and verifying video URL…
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Downloading source video, verifying streams with FFmpeg, and securing to Cloudflare R2…
            </p>
          </div>
        )}

        {/* Submit Action */}
        <div className="space-y-2 pt-1">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isBusy || (mode === 'upload' && !file) || (mode === 'url' && !url.trim())}
          >
            <Sparkles className="size-4 mr-2" />
            {isUploading
              ? 'Uploading Video…'
              : isIngestingUrl
              ? 'Importing Video URL…'
              : 'Start Processing →'}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Your video will be saved and processed automatically. You'll be notified when it's ready.
          </p>
        </div>
      </form>
    </div>
  );
};
export default NewProjectPage;
