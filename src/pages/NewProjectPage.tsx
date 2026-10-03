import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Link2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { projectService } from '../services/projectService';

const MAX_MB = 500;

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!f.type.startsWith('video/')) {
      setErrorMsg('Please select a valid video file (MP4, MOV, WEBM).');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(`Video file must be under ${MAX_MB}MB.`);
      return;
    }
    setErrorMsg(null);
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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
      setProgress(15);
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev === null || prev >= 100) {
            clearInterval(timer);
            const proj = projectService.createProject(
              title.trim(),
              file ? file.name : null,
              notes.trim()
            );
            navigate(`/projects/${proj.id}`);
            return 100;
          }
          return prev + 25;
        });
      }, 300);
    } else {
      const proj = projectService.createProject(title.trim(), url.trim(), notes.trim());
      navigate(`/projects/${proj.id}`);
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
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-medium">
            {errorMsg}
          </div>
        )}

        {/* Mode Toggle Switch */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-cream p-1 border border-border">
          <button
            type="button"
            onClick={() => {
              setMode('upload');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition-all ${
              mode === 'upload'
                ? 'bg-card text-foreground shadow-soft border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="size-4" />
            <span>Upload video</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('url');
              setErrorMsg(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition-all ${
              mode === 'url'
                ? 'bg-card text-foreground shadow-soft border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link2 className="size-4" />
            <span>Paste URL</span>
          </button>
        </div>

        {/* Input Area (Upload or URL) */}
        {mode === 'upload' ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handlePickFile(e.dataTransfer.files[0]);
            }}
            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-input bg-cream/60 px-4 py-10 text-center transition-colors hover:bg-cream/90"
          >
            <span className="text-3xl select-none">🎬</span>
            <span className="mt-2 font-medium text-foreground text-sm sm:text-base">
              {file ? file.name : 'Drop a video or tap to choose'}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : `MP4, MOV, WEBM · up to ${MAX_MB}MB`}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <Input
            label="Video URL"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}

        {/* Project Title */}
        <Input
          label="Project title"
          placeholder="e.g. How I Built a $1M SaaS With Zero Funding"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Notes / Description */}
        <Textarea
          label="Transcript or what the video is about (optional)"
          rows={5}
          placeholder="Paste the transcript or describe key topics, takeaways, or moments. The more detail, the higher quality your generated content."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Progress bar when uploading */}
        {isUploading && (
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading video…</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
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
