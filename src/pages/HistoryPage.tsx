import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ArrowUpRight } from 'lucide-react';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { Project } from '../types';

export const HistoryPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(() => projectService.getProjects());
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const handleDelete = (id: string) => {
    projectService.deleteProject(id);
    setProjects(projectService.getProjects());
    setProjectToDelete(null);
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

      <div className="card-soft p-3 sm:p-5">
        {projects.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl select-none">🎬</p>
            <p className="mt-2 font-medium text-foreground">No projects yet</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Upload a video to create your first content kit.
            </p>
            <div className="mt-5">
              <Button variant="clay" size="sm" asChild>
                <Link to="/projects/new">New Project</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-4 hover:bg-cream/40 rounded-xl transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground text-sm sm:text-base">
                    {p.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span>
                      {new Date(p.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span>•</span>
                    <StatusBadge status={p.status} />
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
            ))}
          </ul>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card-soft max-w-sm w-full p-6 space-y-4 bg-card shadow-lift">
            <h3 className="font-semibold text-lg font-display text-foreground">
              Delete this project?
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              "{projectToDelete.title}" and all of its generated multi-platform content will be removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(projectToDelete.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
