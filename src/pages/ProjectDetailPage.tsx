import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { Project, ContentOutput, OutputPlatform } from '../types';

const STAGES = [
  ['uploading', 'Uploading video'],
  ['queued', 'Queued in processing pipeline'],
  ['transcribing', 'Transcribing audio speech'],
  ['analyzing', 'Analyzing topics & key moments'],
  ['generating', 'Generating multi-platform content'],
  ['complete', 'Complete'],
] as const;

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

  const refreshData = () => {
    if (!id) return;
    const p = projectService.getProject(id);
    const o = projectService.getOutputs(id);
    setProject(p);
    setOutputs(o);
  };

  useEffect(() => {
    refreshData();

    const handleUpdate = () => refreshData();
    window.addEventListener('vireo_project_updated', handleUpdate);

    const interval = setInterval(() => {
      refreshData();
    }, 1500);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
      clearInterval(interval);
    };
  }, [id]);

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

  const isComplete = project.status === 'complete';

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

      {/* Project Title & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl font-display text-foreground">
            {project.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            Created on{' '}
            {new Date(project.created_at).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Main Content Area */}
      {project.status === 'failed' ? (
        <div className="card-soft p-8 text-center space-y-3">
          <p className="font-semibold text-lg text-foreground font-display">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {project.error || 'The video processing failed. Please try again with another clip or URL.'}
          </p>
          <div className="pt-2">
            <Button variant="clay" asChild>
              <Link to="/projects/new">Try New Video</Link>
            </Button>
          </div>
        </div>
      ) : !isComplete ? (
        <ProcessingTimeline status={project.status} />
      ) : (
        <Workspace outputs={outputs} projectId={project.id} onRefresh={refreshData} />
      )}
    </div>
  );
};

function ProcessingTimeline({ status }: { status: Project['status'] }) {
  const currentStageIndex = Math.max(
    0,
    STAGES.findIndex(([s]) => s === status)
  );

  return (
    <div className="card-soft mx-auto max-w-md p-6 sm:p-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold font-display text-foreground">
          Understanding Video
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Hang tight — AI transcription and analysis usually takes under a minute.
        </p>
      </div>

      <ol className="space-y-1">
        {STAGES.map(([key, label], i) => {
          const isDone = i < currentStageIndex;
          const isActive = i === currentStageIndex;

          return (
            <li key={key}>
              <div className="flex items-center gap-3.5 py-2">
                <span
                  className={`grid size-8 place-items-center rounded-full text-xs font-semibold transition-all shrink-0 ${
                    isDone
                      ? 'bg-sage text-sage-foreground'
                      : isActive
                      ? 'bg-clay text-clay-foreground animate-pulse shadow-clay'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {isDone ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={`text-sm ${
                    isActive
                      ? 'font-semibold text-foreground'
                      : isDone
                      ? 'text-foreground/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className={`ml-4 h-3.5 w-0.5 transition-colors ${
                    isDone ? 'bg-sage' : 'bg-border'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
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
  const currentTabConfig = TABS.find((t) => t.key === activeTab) || TABS[0];

  return (
    <div className="space-y-6">
      {/* Platform Pill Tabs */}
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-all ${
              activeTab === t.key
                ? 'bg-ink text-cream shadow-ink font-semibold'
                : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content Groups for Active Tab */}
      <div className="space-y-6">
        {currentTabConfig.groups.map(({ type, label }) => {
          const items = outputs.filter(
            (o) => o.platform === currentTabConfig.key && o.content_type === type
          );

          if (items.length === 0) return null;

          return (
            <section key={type} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-clay">
                {label}
              </h2>
              <div
                className={`grid gap-3.5 ${
                  type === 'title' || type === 'hook' || type === 'moment'
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-1'
                }`}
              >
                {items.map((o) => (
                  <OutputCard
                    key={o.id}
                    output={o}
                    projectId={projectId}
                    onSaved={onRefresh}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OutputCard({
  output,
  onSaved,
}: {
  output: ContentOutput;
  projectId?: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(output.content);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(output.content);
  }, [output.content]);

  const handleSave = () => {
    projectService.updateOutputContent(output.id, text);
    setEditing(false);
    onSaved();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRegenerate = () => {
    setBusy(true);
    setTimeout(() => {
      let refined = text;
      if (output.content_type === 'title') {
        refined = `Refined: ${text.replace(/^Refined:\s*/, '')} (Viral Angle)`;
      } else if (output.content_type === 'hook') {
        refined = `Hook (Alternative): "${text.replace(/^Hook \(Alternative\):\s*"?/, '').replace(/"?$/, '')}"`;
      } else {
        refined = `${text}\n\n[Refined with enhanced clarity and punch]`;
      }
      setText(refined);
      projectService.updateOutputContent(output.id, refined);
      setBusy(false);
      onSaved();
    }, 800);
  };

  const lineCount = text.split('\n').length;

  return (
    <div
      className={`rounded-2xl bg-card p-4 sm:p-5 shadow-soft border border-border transition-all ${
        busy ? 'opacity-60' : ''
      }`}
    >
      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(12, Math.max(3, lineCount + 2))}
          className="bg-cream/60 font-sans text-sm"
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">
          {busy ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <RefreshCw className="size-3.5 animate-spin" />
              <span>Regenerating content…</span>
            </span>
          ) : (
            text
          )}
        </div>
      )}

      {/* Action Toolbar */}
      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/40 pt-2.5">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(output.content);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" variant="sage" onClick={handleSave}>
              Save Changes
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={busy}
              className="text-xs"
            >
              <Pencil className="size-3.5 mr-1" />
              <span>Edit</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRegenerate}
              disabled={busy}
              className="text-xs"
            >
              <RefreshCw className={`size-3.5 mr-1 ${busy ? 'animate-spin' : ''}`} />
              <span>Regenerate</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className={`text-xs ${copied ? 'text-sage font-semibold' : ''}`}
            >
              {copied ? (
                <>
                  <Check className="size-3.5 mr-1 text-sage" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 mr-1" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
