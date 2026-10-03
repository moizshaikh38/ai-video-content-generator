import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Link2, XCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { projectService } from '../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../services/storageService';
import { useAuth } from '../context/AuthContext';

const MAX_MB = 500;

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prefillUrl = searchParams.get('url');
    if (prefillUrl) {
      setMode('url');
      setUrl(prefillUrl);
      setTitle('YouTube Video Analysis');
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
    setProgress(5);

    const projectId = crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let projectCreated = false;

    try {
      // 1. Create project record in database with status 'uploading'
      await projectService.createProjectAsync({
        id: projectId,
        userId: user.id,
        title: title.trim(),
        sourceType: 'upload',
        videoStatus: 'uploading',
        notes: notes.trim(),
      });
      projectCreated = true;

      // 2. Upload video file to Supabase Storage: {user_id}/{project_id}/{filename}
      const uploadResult = await uploadVideoFile({
        file,
        userId: user.id,
        projectId,
        onProgress: (pct) => setProgress(pct),
        signal: abortController.signal,
      });

      // 3. ONLY after Storage upload succeeds, update project record with storage path and status 'uploaded'
      await projectService.updateProjectAsync(projectId, {
        source_url: uploadResult.storagePath,
        video_status: 'uploaded',
      });

      setProgress(100);
      abortControllerRef.current = null;
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('cancelled');
      const message = isAbort
        ? 'Upload was cancelled.'
        : err.message || 'Failed to upload video to Supabase Storage.';

      console.error('[Upload Flow Failed]', err);

      if (projectCreated) {
        try {
          await projectService.updateProjectAsync(projectId, {
            video_status: 'failed',
          });
        } catch (updateErr) {
          console.error('Failed to set project status to failed in Supabase:', updateErr);
        }
      }

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
      // Validate URL format
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error();
        }
      } catch {
        setErrorMsg('Please enter a valid HTTP or HTTPS video URL (e.g. https://youtube.com/watch?v=…).');
        return;
      }

      try {
        const proj = await projectService.createProjectAsync({
          userId: user?.id,
          title: title.trim(),
          sourceType: 'url',
          sourceUrl: url.trim(),
          videoStatus: 'queued',
          notes: notes.trim(),
        });
        navigate(`/projects/${proj.id}`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to create project.');
      }
    }
  };

  const isUploading = progress !== null && progress < 100;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight font-display text-foreground">
          New project
        </h1>
        <p className="mt-1 text-sm sm:text-base text-muted-foreground">
          Upload a video or paste a supported video URL.
        </p>
      </div>

      <div className="card-soft space-y-5 p-5 md:p-7">
        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive font-medium flex items-center justify-between gap-3">
            <span className="flex-1">{errorMsg}</span>
            {uploadFailed && file && mode === 'upload' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={executeUploadFlow}
                className="shrink-0 h-7 text-xs px-2.5 border-destructive/30 hover:bg-destructive/10"
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Mode Toggle Switch */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-cream p-1 border border-border">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => {
              setMode('upload');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition-all ${
              mode === 'upload'
                ? 'bg-card text-foreground shadow-soft border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Upload className="size-4" />
            <span>Upload video</span>
          </button>
          <button
            type="button"
            disabled={isUploading}
            onClick={() => {
              setMode('url');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition-all ${
              mode === 'url'
                ? 'bg-card text-foreground shadow-soft border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Link2 className="size-4" />
            <span>Paste URL</span>
          </button>
        </div>

        {/* Input Area (Upload or URL) */}
        {mode === 'upload' ? (
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isUploading) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (!isUploading) {
                handlePickFile(e.dataTransfer.files[0]);
              }
            }}
            className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
              isDragOver
                ? 'border-clay bg-clay/5'
                : 'border-input bg-cream/60 hover:bg-cream/90'
            } ${isUploading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="text-3xl select-none">🎬</span>
            <span className="mt-2 font-medium text-foreground text-sm sm:text-base">
              {file ? file.name : 'Drop a video or tap to choose'}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : `MP4, MOV, WEBM, AVI, MKV · up to ${MAX_MB}MB`}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <Input
            label="Video URL"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            disabled={isUploading}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}

        {/* Project Title */}
        <Input
          label="Project title"
          placeholder="e.g. How I Built a $1M SaaS With Zero Funding"
          value={title}
          disabled={isUploading}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Notes / Description */}
        <Textarea
          label="Transcript or what the video is about (optional)"
          rows={5}
          placeholder="Paste the transcript or describe key topics, takeaways, or moments. The more detail, the higher quality your generated content."
          value={notes}
          disabled={isUploading}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Progress bar and cancellation when uploading */}
        {isUploading && (
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Uploading video to Supabase Storage…</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-medium">{progress}%</span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="text-destructive hover:underline font-medium text-xs cursor-pointer inline-flex items-center gap-1"
                >
                  <XCircle className="size-3" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-sage transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="clay"
          size="lg"
          className="w-full mt-4"
          disabled={isUploading}
        >
          {isUploading ? 'Uploading video…' : 'Generate content'}
        </Button>
      </div>
    </form>
  );
};
