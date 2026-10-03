import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ArrowUpRight, Video, Link2 } from 'lucide-react';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>(() => projectService.getProjects());
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await projectService.fetchProjects(user.id);
      setProjects(data);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setErrorMsg(err.message || 'Unable to retrieve your projects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();

    const handleUpdate = () => {
      setProjects(projectService.getProjects());
    };
    window.addEventListener('vireo_project_updated', handleUpdate);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
    };
  }, [user?.id]);

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await projectService.deleteProject(id);
      setProjects(projectService.getProjects());
      setProjectToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete project:', err);
      setErrorMsg('Failed to delete project. Please retry.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight font-display text-foreground">
          Project history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your video transformations and generated content kits.
        </p>
      </div>

      {isLoading ? (
        <div className="card-soft p-12">
          <LoadingState
            message="Loading your projects…"
            description="Fetching your project library from Supabase."
          />
        </div>
      ) : errorMsg ? (
        <ErrorState
          title="Could not load projects"
          message={errorMsg}
          onRetry={loadProjects}
          retryLabel="Retry"
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Video className="w-7 h-7 text-clay" />}
          title="No projects yet"
          description="Upload a video or link an external URL to create your first content kit."
          actionLabel="New Project"
          onAction={() => navigate('/projects/new')}
        />
      ) : (
        <div className="card-soft p-3 sm:p-5">
          <ul className="divide-y divide-border">
            {projects.map((p) => {
              const isUrl = p.source_type === 'url' || Boolean(p.source_url && !p.storage_path);
              const statusVal = p.video_status || p.status;

              return (
                <li
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-4 hover:bg-cream/40 rounded-xl transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground text-sm sm:text-base">
                      {p.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(p.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {isUrl ? (
                          <>
                            <Link2 className="size-3" />
                            <span>URL</span>
                          </>
                        ) : (
                          <>
                            <Video className="size-3" />
                            <span>Upload</span>
                          </>
                        )}
                      </span>
                      <span>•</span>
                      <StatusBadge status={statusVal} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/projects/${p.id}`} className="inline-flex items-center gap-1">
                        <span>Open Workspace</span>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setProjectToDelete(p)}
                      aria-label="Delete project"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card-soft max-w-sm w-full p-6 space-y-4 bg-card shadow-lift">
            <h3 className="font-semibold text-lg font-display text-foreground">
              Delete this project?
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              "{projectToDelete.title}" and all associated records will be removed permanently.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={() => handleDelete(projectToDelete.id)}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
