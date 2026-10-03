import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, Clock, ArrowRight, Layers, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ProjectPlaceholder } from '../types';

const INITIAL_PROJECTS: ProjectPlaceholder[] = [
  {
    id: 'proj-01',
    title: 'Product Keynote & Architecture Walkthrough',
    sourceUrl: 'https://example.com/videos/keynote-2026.mp4',
    status: 'completed',
    createdAt: 'Today at 10:30 AM',
    duration: '18m 42s',
    contentTypes: ['YouTube SEO', 'Instagram Carousels', 'Shorts Hooks', 'LinkedIn Post'],
  },
  {
    id: 'proj-02',
    title: 'Podcast Episode 42: Modern Web Scaling',
    sourceUrl: 'https://example.com/videos/podcast-42.mp4',
    status: 'processing',
    createdAt: 'Yesterday',
    duration: '45m 10s',
    contentTypes: ['AI Transcript', 'Twitter Thread', 'Show Notes'],
  },
  {
    id: 'proj-03',
    title: 'TypeScript Full Stack SaaS Deep Dive',
    sourceUrl: 'https://example.com/videos/saas-demo.mp4',
    status: 'pending',
    createdAt: 'Oct 01, 2026',
    duration: '12m 05s',
    contentTypes: ['Summary', 'YouTube Timestamps'],
  },
];

export const DashboardPage: React.FC = () => {
  const [projects] = useState<ProjectPlaceholder[]>(INITIAL_PROJECTS);
  const [showEmpty, setShowEmpty] = useState(false);

  const toggleView = () => setShowEmpty(!showEmpty);

  return (
    <div className="space-y-8">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Projects Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your video repositories and generated multi-channel content packages.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleView}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {showEmpty ? 'Show Projects' : 'Test Empty State'}
          </Button>
          <Link to="/projects/new">
            <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Info Badge */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Phase 1 Foundation</p>
            <p className="text-xs text-slate-400">
              Interactive UI demonstration with mock data. Real video uploads and AI generation will be integrated in subsequent phases.
            </p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {showEmpty || projects.length === 0 ? (
        <EmptyState
          title="No Projects Yet"
          description="You haven't uploaded or generated any video content packages. Start by creating your first project."
          actionLabel="Create Project"
          onAction={() => (window.location.href = '/projects/new')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} hoverable className="flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      project.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : project.status === 'processing'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {project.status}
                  </span>
                  <div className="flex items-center text-xs text-slate-400 gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{project.duration}</span>
                  </div>
                </div>
                <CardTitle className="text-lg line-clamp-1">{project.title}</CardTitle>
                <CardDescription className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Created {project.createdAt}</span>
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-400">Available Packages:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.contentTypes?.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="justify-between">
                <span className="text-xs text-slate-400 font-mono">{project.id}</span>
                <Link to={`/projects/${project.id}`}>
                  <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    View Project
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
