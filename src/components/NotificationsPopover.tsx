import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Loader2, AlertCircle, Clock3 } from 'lucide-react';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';

const statusOf = (p: Project) => p.video_status || p.status;
const READY = ['completed', 'complete', 'transcribed'];
const WORKING = ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'];
const FAILED = ['failed', 'error'];

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const describe = (p: Project) => {
  const s = statusOf(p);
  if (READY.includes(s)) return { icon: CheckCircle2, tone: 'text-emerald-400', text: 'Clips are ready' };
  if (FAILED.includes(s)) return { icon: AlertCircle, tone: 'text-rose-400', text: 'Processing failed' };
  if (WORKING.includes(s)) return { icon: Loader2, tone: 'text-violet-300', text: 'Processing…' };
  return { icon: Clock3, tone: 'text-zinc-400', text: 'Queued' };
};

/**
 * Header bell. Notifications are your most recent project activity (ready, processing,
 * failed) — there is no separate notifications feed on the server.
 */
export const NotificationsPopover: React.FC<{ buttonClassName: string }> = ({ buttonClassName }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const projects = await projectService.fetchProjects(user?.id);
      const sorted = [...projects].sort(
        (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      );
      setItems(sorted.slice(0, 6));
    } catch {
      setError(true);
      setItems([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        <Bell className="size-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl glass-float p-1.5 z-50"
        >
          <div className="flex items-center justify-between px-3 pt-2 pb-2.5">
            <p className="text-sm font-semibold text-vc-text-primary">Notifications</p>
            <span className="text-[11px] text-vc-text-muted">Recent activity</span>
          </div>

          {items === null ? (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-vc-text-secondary">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="px-3 py-6 text-xs text-vc-text-secondary">Couldn't load activity. Try again in a moment.</p>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-vc-text-primary">You're all caught up</p>
              <p className="mt-1 text-xs text-vc-text-secondary">Updates about your projects show up here.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((p) => {
                const d = describe(p);
                const Icon = d.icon;
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.06] transition-colors"
                    >
                      <Icon className={`mt-0.5 size-4 shrink-0 ${d.tone} ${d.icon === Loader2 ? 'animate-spin' : ''}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-vc-text-primary">{p.title || 'Untitled project'}</span>
                        <span className="block text-[11.5px] text-vc-text-secondary">
                          {d.text} · {timeAgo(p.updated_at || p.created_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            to="/history?tab=projects"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-medium text-vc-text-secondary hover:text-vc-text-primary hover:bg-white/[0.06] transition-colors"
          >
            View all projects
          </Link>
        </div>
      )}
    </div>
  );
};
