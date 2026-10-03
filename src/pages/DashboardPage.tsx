import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight, Video, Link2 } from 'lucide-react';
import { Button } from '../components/Button';
import { StatusBadge, isProcessing } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';

const MONTHLY_LIMIT = 3;

export const DashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>(() => projectService.getProjects());

  const loadProjects = async () => {
    if (!user) return;
    try {
      const data = await projectService.fetchProjects(user.id);
      setProjects(data);
    } catch (e) {
      console.error('Failed to load dashboard projects:', e);
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

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const used = projects.filter((p) => new Date(p.created_at) >= monthStart).length;
  const processing = projects.filter((p) => isProcessing(p.status || p.video_status || '')).length;
  const percentUsed = Math.min(100, Math.round((used / MONTHLY_LIMIT) * 100));

  const welcomeText = profile?.full_name
    ? `Welcome back, ${profile.full_name}. `
    : user?.email
    ? `Welcome back (${user.email}). `
    : '';

  return (
    <div className="space-y-8 pt-4">
      {/* Studio Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl font-display text-foreground">
            Your studio
          </h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            {welcomeText}One video in. Content everywhere out.
          </p>
        </div>
        <Button variant="clay" size="lg" asChild>
          <Link to="/projects/new" className="flex items-center gap-2">
            <Plus className="size-4" />
            <span>Create new project</span>
          </Link>
        </Button>
      </div>

      {/* Stats Overview Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Videos this month"
          value={`${used} / ${MONTHLY_LIMIT}`}
          sub="Free plan tier"
          bar={percentUsed}
        />
        <StatCard
          label="Processing now"
          value={String(processing)}
          sub={processing > 0 ? 'Analyzing clips…' : 'All caught up'}
        />
        <StatCard
          label="Total projects"
          value={String(projects.length)}
          sub="All-time created"
        />
      </div>

      {/* Recent Projects Section */}
      <section className="card-soft p-5 md:p-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold font-display text-foreground">
            Recent projects
          </h2>
          <Link
            to="/history"
            className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl bg-cream/70 py-12 text-center border border-border">
            <p className="text-3xl select-none">🎬</p>
            <p className="mt-2 font-medium text-foreground">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first video to generate an omni-channel content kit.
            </p>
            <div className="mt-5">
              <Button variant="clay" size="sm" asChild>
                <Link to="/projects/new">New Project</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {projects.slice(0, 5).map((p) => {
              const isUrl = p.source_type === 'url' || Boolean(p.source_url && !p.storage_path);
              const statusVal = p.video_status || p.status;

              return (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 py-4 hover:bg-cream/40 rounded-xl px-2.5 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-sm sm:text-base group-hover:text-clay transition-colors">
                        {p.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
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
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <StatusBadge status={statusVal} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

function StatCard({
  label,
  value,
  sub,
  bar,
}: {
  label: string;
  value: string;
  sub: string;
  bar?: number;
}) {
  return (
    <div className="card-soft p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-clay">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold text-foreground">
        {value}
      </p>
      {bar !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-sage transition-all duration-300"
            style={{ width: `${bar}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
