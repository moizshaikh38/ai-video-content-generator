import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Pencil,
  Video,
  Link2,
  FileCheck2,
  HardDrive,
  FileText,
  Calendar,
  Loader2,
  RefreshCw,
  Sparkles,
  Volume2,
  Clock,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { StatusBadge, isProcessing } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { projectService } from '../services/projectService';
import { Project, ContentOutput, OutputPlatform, Transcript } from '../types';

interface TabConfig {
  key: OutputPlatform;
  label: string;
  groups: Array<{ type: ContentOutput['content_type']; label: string }>;
}

const TABS: TabConfig[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    groups: [
      { type: 'title', label: 'Title ideas (High CTR)' },
      { type: 'description', label: 'Video description' },
      { type: 'chapters', label: 'Timestamped chapters' },
      { type: 'keywords', label: 'SEO keywords & tags' },
    ],
  },
  {
    key: 'instagram',
    label: 'Instagram',
    groups: [
      { type: 'hook', label: 'Reel & carousel hooks' },
      { type: 'caption', label: 'Feed caption' },
      { type: 'hashtags', label: 'Curated hashtags' },
    ],
  },
  {
    key: 'shorts',
    label: 'Shorts / Reels',
    groups: [{ type: 'moment', label: 'Best moments & clip cut-points' }],
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    groups: [{ type: 'post', label: 'Thought leadership post' }],
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    groups: [{ type: 'thread', label: 'Thread structure & hooks' }],
  },
];

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | undefined>(() =>
    id ? projectService.getProject(id) : undefined
  );
  const [outputs, setOutputs] = useState<ContentOutput[]>(() =>
    id ? projectService.getOutputs(id) : []
  );
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(!project);
  const [isRetrying, setIsRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshData = async () => {
    if (!id) return;
    const p = await projectService.fetchProject(id);
    const o = projectService.getOutputs(id);
    if (p) setProject(p);
    setOutputs(o);

    // Fetch transcript if transcribed or completed
    const t = await projectService.fetchTranscript(id);
    if (t) setTranscript(t);

    setIsLoading(false);
  };

  // Initial load & updates listener
  useEffect(() => {
    refreshData();

    const handleUpdate = () => refreshData();
    window.addEventListener('vireo_project_updated', handleUpdate);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
    };
  }, [id]);

  // Auto-start processing when newly uploaded
  useEffect(() => {
    if (!project || !id) return;
    const currentStatus = project.video_status || project.status;
    if (currentStatus === 'uploaded' && project.source_type === 'upload' && project.source_url) {
      projectService.startProcessing(id).catch((err) => {
        console.warn('Auto-start processing notice:', err.message);
      });
    }
  }, [id, project?.video_status, project?.status, project?.source_type, project?.source_url]);

  // Polling loop while processing or transcribing
  useEffect(() => {
    if (!id || !project) return;
    const currentStatus = project.video_status || project.status;
    const active = isProcessing(currentStatus);

    if (!active) return;

    const interval = setInterval(() => {
      refreshData();
    }, 2500);

    return () => clearInterval(interval);
  }, [id, project?.video_status, project?.status]);

  const handleRetryProcessing = async () => {
    if (!id) return;
    setIsRetrying(true);
    setActionError(null);
    try {
      await projectService.startProcessing(id);
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to start processing.');
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-12">
        <LoadingState
          message="Loading project details…"
          description="Fetching video record from Supabase."
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-muted-foreground text-sm">Project not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard">Back to Studio</Link>
        </Button>
      </div>
    );
  }

  const isUrl = project.source_type === 'url';
  const statusVal = project.video_status || project.status;
  const isUploaded = statusVal === 'uploaded';
  const hasOutputs = outputs && outputs.length > 0;

  return (
    <div className="space-y-6 pt-4">
      {/* Back Link */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        <span>Back to Studio</span>
      </Link>

      {/* Project Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 card-soft p-5 md:p-6">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl font-display text-foreground truncate">
              {project.title}
            </h1>
            <StatusBadge status={statusVal} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              <span>
                Created on{' '}
                {new Date(project.created_at).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium">
              {isUrl ? (
                <>
                  <Link2 className="size-3.5" />
                  <span>External URL</span>
                </>
              ) : (
                <>
                  <Video className="size-3.5" />
                  <span>Direct Upload</span>
                </>
              )}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link to="/projects/new">New Project</Link>
        </Button>
      </div>

      {/* Failed State */}
      {statusVal === 'failed' ? (
        <div className="card-soft p-8 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive mx-auto flex items-center justify-center">
            <RefreshCw className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-lg text-foreground font-display">Video Processing Failed</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              {actionError || 'The video processing or transcription failed. Please verify your video audio or try again.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="clay"
              disabled={isRetrying}
              onClick={handleRetryProcessing}
            >
              {isRetrying ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Retrying Processing…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-1.5" />
                  Retry Processing
                </>
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/projects/new">Try New Video</Link>
            </Button>
          </div>
        </div>
      ) : (
        /* Video Uploaded / Processing / Transcribed State */
        <div className="space-y-6">
          {/* Main Video / Processing Card */}
          <div className="card-soft p-6 md:p-8 space-y-6 bg-card border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    statusVal === 'transcribed'
                      ? 'bg-sage/15 text-sage'
                      : isProcessing(statusVal)
                      ? 'bg-clay/15 text-clay'
                      : 'bg-sage/15 text-sage'
                  }`}
                >
                  {isProcessing(statusVal) ? (
                    <Loader2 className="size-6 animate-spin" />
                  ) : statusVal === 'transcribed' ? (
                    <Sparkles className="size-6 text-terracotta" />
                  ) : (
                    <FileCheck2 className="size-6" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold font-display text-foreground">
                    {statusVal === 'transcribed'
                      ? 'Transcription complete'
                      : statusVal === 'transcribing'
                      ? 'Transcribing audio…'
                      : statusVal === 'processing'
                      ? 'Processing video…'
                      : isUploaded
                      ? 'Video uploaded successfully'
                      : isUrl
                      ? 'Video URL linked'
                      : 'Video uploading'}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {statusVal === 'transcribed'
                      ? 'Audio transcribed and ready for content generation.'
                      : statusVal === 'transcribing'
                      ? 'Extracting speech and generating timestamped segments.'
                      : statusVal === 'processing'
                      ? 'Retrieving media from private Supabase Storage.'
                      : isUploaded
                      ? 'Stored securely in private Supabase Storage.'
                      : isUrl
                      ? 'External video source registered.'
                      : 'File is being transferred to storage.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isUploaded && !isProcessing(statusVal) && (
                  <Button
                    size="sm"
                    variant="clay"
                    disabled={isRetrying}
                    onClick={handleRetryProcessing}
                  >
                    {isRetrying ? (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="size-3.5 mr-1" />
                    )}
                    Start Processing
                  </Button>
                )}
              </div>
            </div>

            {/* Processing Banner if currently active */}
            {isProcessing(statusVal) && (
              <div className="p-4 rounded-xl bg-accent/20 border border-accent/40 flex items-center gap-3">
                <Loader2 className="size-5 text-accent-foreground animate-spin shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-foreground">Pipeline in progress:</span>{' '}
                  <span className="text-muted-foreground">
                    {statusVal === 'transcribing'
                      ? 'Running Whisper transcription on audio track...'
                      : 'Preparing media and validating file structure...'}
                  </span>
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Source Type
                </span>
                <p className="text-sm font-medium text-foreground capitalize flex items-center gap-1.5">
                  {isUrl ? <Link2 className="size-3.5 text-clay" /> : <Video className="size-3.5 text-sage" />}
                  {project.source_type || (isUrl ? 'URL' : 'Upload')}
                </p>
              </div>

              {!isUrl && project.source_url && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Original File
                  </span>
                  <p className="text-sm font-medium text-foreground truncate" title={project.source_url.split('/').pop() || 'video.mp4'}>
                    {project.source_url.split('/').pop() || 'video.mp4'}
                  </p>
                </div>
              )}

              {!isUrl && project.source_url && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1 sm:col-span-2 md:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <HardDrive className="size-3 text-muted-foreground" />
                    Storage Path
                  </span>
                  <p className="text-xs font-mono text-muted-foreground break-all select-all">
                    videos/{project.source_url}
                  </p>
                </div>
              )}

              {isUrl && project.source_url && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1 sm:col-span-2 md:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Link2 className="size-3 text-muted-foreground" />
                    External Source
                  </span>
                  <p className="text-xs font-mono text-clay break-all truncate">
                    {project.source_url}
                  </p>
                </div>
              )}
            </div>

            {/* Notes / Context */}
            {project.notes && (
              <div className="rounded-2xl bg-cream/40 p-4 border border-border/60 space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <FileText className="size-3.5" />
                  Creator notes & context
                </span>
                <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {project.notes}
                </p>
              </div>
            )}
          </div>

          {/* Transcript Display Section */}
          {transcript && (
            <TranscriptSection transcript={transcript} />
          )}

          {/* Show Workspace tabs if content outputs already exist */}
          {hasOutputs && (
            <div className="space-y-4 pt-4">
              <h3 className="text-lg font-semibold font-display text-foreground">
                Content Kits
              </h3>
              <Workspace outputs={outputs} projectId={project.id} onRefresh={refreshData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function TranscriptSection({ transcript }: { transcript: Transcript }) {
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(true);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(transcript.transcript_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="card-soft p-6 md:p-8 space-y-6 bg-card border-border/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-terracotta/15 text-terracotta flex items-center justify-center shrink-0">
            <Volume2 className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold font-display text-foreground">
              Video Transcript
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <Globe className="size-3" />
                <span className="uppercase">{transcript.language || 'en'}</span>
              </span>
              {transcript.duration_seconds !== null && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{formatTimestamp(transcript.duration_seconds)}</span>
                  </span>
                </>
              )}
              {transcript.segments && transcript.segments.length > 0 && (
                <>
                  <span>•</span>
                  <span>{transcript.segments.length} segments</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyAll}
            className="text-xs"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-sage mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5 mr-1.5" />
                Copy Full Transcript
              </>
            )}
          </Button>

          {transcript.segments && transcript.segments.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSegments(!showSegments)}
              className="text-xs"
            >
              {showSegments ? (
                <>
                  <ChevronUp className="size-3.5 mr-1" />
                  Hide Timestamps
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5 mr-1" />
                  Show Timestamps
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Timestamped Segments */}
      {showSegments && transcript.segments && transcript.segments.length > 0 ? (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {transcript.segments.map((seg, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-cream/40 border border-border/40 hover:bg-cream/70 transition-colors"
            >
              <span className="font-mono text-xs font-semibold text-clay px-2 py-0.5 rounded-md bg-clay/10 shrink-0 select-all">
                {formatTimestamp(seg.start)}
              </span>
              <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed flex-1">
                {seg.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        /* Full text fallback */
        <div className="rounded-2xl bg-cream/30 p-4 border border-border/60 max-h-80 overflow-y-auto">
          <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {transcript.transcript_text}
          </p>
        </div>
      )}
    </div>
  );
}

function Workspace({
  outputs,
  projectId,
  onRefresh,
}: {
  outputs: ContentOutput[];
  projectId: string;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<OutputPlatform>('youtube');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const tabOutputs = outputs.filter((o) => o.platform === activeTab);
  const tabConfig = TABS.find((t) => t.key === activeTab)!;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const startEdit = (out: ContentOutput) => {
    setEditingId(out.id);
    setDraft(out.content);
  };

  const saveEdit = (outputId: string) => {
    projectService.updateOutputContent(outputId, draft);
    setEditingId(null);
    onRefresh();
  };

  return (
    <div key={projectId} className="space-y-5">
      {/* Platform Navigation Tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-border pb-2">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-clay text-clay-foreground shadow-clay'
                  : 'text-muted-foreground hover:text-foreground hover:bg-cream/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Group Content */}
      <div className="space-y-6">
        {tabConfig.groups.map((group) => {
          const items = tabOutputs.filter((o) => o.content_type === group.type);
          if (items.length === 0) return null;

          return (
            <div key={group.type} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-3">
                {items.map((item) => {
                  const isEditing = editingId === item.id;
                  const isCopied = copiedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="card-soft p-4 sm:p-5 transition-all hover:border-border/80 group"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <Textarea
                            rows={item.content.length > 200 ? 8 : 4}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="clay"
                              onClick={() => saveEdit(item.id)}
                            >
                              Save changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">
                            {item.content}
                          </p>
                          <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                            <span className="text-muted-foreground capitalize">
                              {item.content_type}
                            </span>
                            <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(item)}
                                className="h-7 px-2 text-xs"
                              >
                                <Pencil className="size-3 mr-1" />
                                <span>Edit</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(item.content, item.id)}
                                className="h-7 px-2 text-xs"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="size-3 mr-1 text-sage" />
                                    <span className="text-sage">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3 mr-1" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
