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
} from 'lucide-react';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { projectService } from '../services/projectService';
import { Project, ContentOutput, OutputPlatform } from '../types';

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
  const [isLoading, setIsLoading] = useState(!project);

  const refreshData = async () => {
    if (!id) return;
    const p = await projectService.fetchProject(id);
    const o = projectService.getOutputs(id);
    if (p) setProject(p);
    setOutputs(o);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();

    const handleUpdate = () => refreshData();
    window.addEventListener('vireo_project_updated', handleUpdate);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
    };
  }, [id]);

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

  const isUrl = project.source_type === 'url' || Boolean(project.source_url && !project.storage_path);
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
        <div className="card-soft p-8 text-center space-y-3 border-destructive/20 bg-destructive/5">
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
      ) : isUploaded || statusVal === 'uploading' || isUrl ? (
        /* Video Uploaded / Linked State Card */
        <div className="space-y-6">
          <div className="card-soft p-6 md:p-8 space-y-6 bg-card border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-sage/15 text-sage flex items-center justify-center shrink-0">
                  <FileCheck2 className="size-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold font-display text-foreground">
                    {isUploaded ? 'Video uploaded successfully' : isUrl ? 'Video URL linked' : 'Video uploading'}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {isUploaded
                      ? 'Stored securely in private Supabase Storage.'
                      : isUrl
                      ? 'External video source registered.'
                      : 'File is being transferred to storage.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={statusVal} />
              </div>
            </div>

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

              {project.file_name && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Original File
                  </span>
                  <p className="text-sm font-medium text-foreground truncate" title={project.file_name}>
                    {project.file_name}
                  </p>
                </div>
              )}

              {project.file_size && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    File Size
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {(project.file_size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              )}

              {project.storage_path && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1 sm:col-span-2 md:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <HardDrive className="size-3 text-muted-foreground" />
                    Storage Path
                  </span>
                  <p className="text-xs font-mono text-muted-foreground break-all select-all">
                    videos/{project.storage_path}
                  </p>
                </div>
              )}

              {project.source_url && (
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
      ) : (
        /* Workspace for completed projects */
        <Workspace outputs={outputs} projectId={project.id} onRefresh={refreshData} />
      )}
    </div>
  );
};

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
