import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ArrowUpRight, Video, Link2, Search, Plus, FolderOpen, CheckCircle2, Clock3, AlertCircle } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';

const statusOf=(p:Project)=>p.video_status||p.status;
export const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [source,setSource]=useState('all');const [sort,setSort]=useState('newest');
  const cancelRef=useRef<HTMLButtonElement>(null);
  const deleteRef=useRef<HTMLButtonElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const openDelete=(project:Project)=>{previousFocus.current=document.activeElement as HTMLElement;setProjectToDelete(project)};
  const closeDelete=()=>{setProjectToDelete(null);requestAnimationFrame(()=>previousFocus.current?.focus())};
  const hasLoadedSuccessfully = useRef(false);

  const loadProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await projectService.fetchProjects(user.id);
      setProjects(data);
      hasLoadedSuccessfully.current = true;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to retrieve your projects.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const update = () => {
      if (hasLoadedSuccessfully.current) {
        setProjects(projectService.getProjects());
      }
    };
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  useEffect(() => {
    if (projectToDelete) cancelRef.current?.focus();
  }, [projectToDelete]);

  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await projectService.deleteProject(id);
      setProjects(projectService.getProjects());
      closeDelete();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) &&
            (status === 'all' ||
              (status === 'completed'
                ? ['completed', 'complete', 'transcribed'].includes(statusOf(p))
                : status === 'processing'
                ? ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))
                : ['failed', 'error'].includes(statusOf(p)))) &&
            (source === 'all' || p.source_type === source)
        )
        .sort((a, b) =>
          sort === 'newest'
            ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [projects, search, status, source, sort]
  );

  const summary = [
    { label: 'All Projects', value: hasLoadedSuccessfully.current ? projects.length : '-', icon: FolderOpen },
    { label: 'Completed', value: hasLoadedSuccessfully.current ? projects.filter((p) => ['completed', 'complete', 'transcribed'].includes(statusOf(p))).length : '-', icon: CheckCircle2 },
    { label: 'Processing', value: hasLoadedSuccessfully.current ? projects.filter((p) => ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))).length : '-', icon: Clock3 },
    { label: 'Failed', value: hasLoadedSuccessfully.current ? projects.filter((p) => ['failed', 'error'].includes(statusOf(p))).length : '-', icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-white">Project History</h1>
          <p className="mt-2 text-[#8E9AB4]">View and manage all your video projects and generated content.</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#F4F6FB] px-5 py-3 text-sm font-semibold text-[#0B0C0F] shadow-black/40 hover:bg-white"
        >
          <Plus className="size-4" />
          New Project
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s, idx) => {
          const iconColors = [
            'bg-violet-500/15 text-violet-400 border-violet-500/25',
            'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
            'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
            'bg-rose-500/15 text-rose-400 border-rose-500/25',
          ];
          return (
            <div
              key={s.label}
              className="flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 p-4 sm:p-5 shadow-xl backdrop-blur-md"
            >
              <span className={`grid size-11 place-items-center rounded-xl border ${iconColors[idx]}`}>
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-xs text-[#8E9AB4]">{s.label}</p>
                <p className="text-xl sm:text-2xl font-bold font-['Sora',sans-serif] text-[#F4F6FB]">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1017]/90 shadow-2xl backdrop-blur-xl text-[#F4F6FB]">
        <div className="flex flex-wrap gap-3 border-b border-white/[0.08] p-4">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 focus-within:ring-2 focus-within:ring-white/20 focus-within:border-white/30 transition-all">
            <Search className="size-4 text-slate-400 shrink-0" />
            <span className="sr-only">Search projects</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="h-11 w-full bg-transparent text-sm text-[#F4F6FB] placeholder:text-slate-500 outline-none"
            />
          </label>
          <label className="sr-only" htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-xl border border-white/[0.1] bg-[#0A0B10] px-3 text-sm text-[#F4F6FB] focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
          <label className="sr-only" htmlFor="source-filter">Source</label>
          <select
            id="source-filter"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-11 rounded-xl border border-white/[0.1] bg-[#0A0B10] px-3 text-sm text-[#F4F6FB] focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all cursor-pointer"
          >
            <option value="all">All sources</option>
            <option value="upload">Upload</option>
            <option value="url">URL</option>
          </select>
          <label className="sr-only" htmlFor="sort-filter">Sort</label>
          <select
            id="sort-filter"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-11 rounded-xl border border-white/[0.1] bg-[#0A0B10] px-3 text-sm text-[#F4F6FB] focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          {(search || status !== 'all' || source !== 'all' || sort !== 'newest') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatus('all');
                setSource('all');
                setSort('newest');
              }}
              className="h-11 px-3 text-sm font-semibold text-[#A78BFA] hover:text-white hover:underline self-center cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {errorMsg && (
          <p role="alert" className="m-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {errorMsg}{' '}
            <button onClick={loadProjects} className="font-semibold underline hover:text-white">
              Retry
            </button>
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.06]" />
            ))}
          </div>
        ) : errorMsg && !hasLoadedSuccessfully.current ? null : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <Video className="mx-auto size-8 text-slate-500" />
            <h2 className="mt-3 font-semibold text-white font-['Sora',sans-serif]">{projects.length ? 'No matching projects' : 'No projects yet'}</h2>
            <p className="mt-1 text-sm text-[#8E9AB4]">
              {projects.length ? 'Try a different search or filter.' : 'Upload your first video to get started.'}
            </p>
            {!projects.length && (
              <Link to="/projects/new" className="mt-4 inline-block rounded-xl bg-[#F4F6FB] px-4 py-2 text-sm font-semibold text-[#0B0C0F] hover:bg-white shadow-md">
                New Project
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.02] text-xs text-slate-400 border-b border-white/[0.08]">
                  <tr>
                    <th className="px-5 py-4 font-semibold font-['Sora',sans-serif]">Project</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Source</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Status</th>
                    <th className="px-4 py-4 font-semibold font-['Sora',sans-serif]">Created</th>
                    <th className="px-4 py-4 text-right font-semibold font-['Sora',sans-serif]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="max-w-[300px] px-5 py-4">
                        <Link to={`/projects/${p.id}`} className="block truncate font-semibold text-white hover:text-[#A78BFA] transition-colors">
                          {p.title}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-400">{p.source_type === 'url' ? 'URL' : 'Upload'}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={statusOf(p)} />
                      </td>
                      <td className="px-4 py-4 text-slate-400 font-mono text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {['failed', 'error'].includes(statusOf(p)) && (
                            <Link
                              to={`/projects/${p.id}`}
                              aria-label={`View error and retry ${p.title}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all"
                            >
                              Retry
                            </Link>
                          )}
                          <Link to={`/projects/${p.id}`} aria-label={`Open ${p.title}`} className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                            <ArrowUpRight className="size-4" />
                          </Link>
                          <button
                            onClick={() => openDelete(p)}
                            aria-label={`Delete ${p.title}`}
                            className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-white/[0.06] md:hidden">
              {filtered.map((p) => (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/projects/${p.id}`} className="block truncate font-semibold text-white hover:text-[#A78BFA]">
                        {p.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-400">
                        {p.source_type === 'url' ? <Link2 className="mr-1 inline size-3" /> : <Video className="mr-1 inline size-3" />}
                        {p.source_type === 'url' ? 'URL' : 'Upload'} · {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={statusOf(p)} />
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/projects/${p.id}`}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                        ['failed', 'error'].includes(statusOf(p))
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                          : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {['failed', 'error'].includes(statusOf(p)) ? 'View error & retry' : 'Open'}
                    </Link>
                    <button
                      onClick={() => openDelete(p)}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {projectToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDelete();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeDelete();
              if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === cancelRef.current) {
                  e.preventDefault();
                  deleteRef.current?.focus();
                } else if (!e.shiftKey && document.activeElement === deleteRef.current) {
                  e.preventDefault();
                  cancelRef.current?.focus();
                }
              }
            }}
            className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0E1017] p-7 shadow-2xl text-white"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <Trash2 className="size-5" />
            </span>
            <h2 id="delete-title" className="mt-4 font-['Sora',sans-serif] text-xl font-bold text-white">
              Delete this project?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              “{projectToDelete.title}” and its associated records will be permanently removed.
            </p>
            <div className="mt-7 flex justify-end gap-3">
              <button
                ref={cancelRef}
                onClick={closeDelete}
                className="rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] px-4 py-2 text-sm font-semibold text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                ref={deleteRef}
                disabled={isDeleting}
                onClick={() => handleDelete(projectToDelete.id)}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isDeleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
