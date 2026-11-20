// Same-document save coordination across editor remounts. An unmounting editor that is still draining a save holds a token;
// a newly mounting editor waits until every RELEVANT token is released by ACTUAL completion.
// A timeout is only a status signal (onSlow); it never releases the wait or the token.
// Relevance: same clip, and (when the waiter's owner/project is known) the same owner/project. Unknown means wait for all (conservative).
interface Entry { token: string; user: string; project: string }
interface Waiter { clip: string; user?: string; project?: string; release: () => void }
const open = new Map<string, Entry[]>(); // keyed by clip id
let waiters: Waiter[] = [];
let seq = 0;
export interface DrainScope { clip: string; user: string; project: string }
export function beginDrain(scope: DrainScope): string {
  const token = `d${++seq}`;
  open.set(scope.clip, [...(open.get(scope.clip) || []), { token, user: scope.user, project: scope.project }]);
  return token;
}
const relevant = (clip: string, user?: string, project?: string) =>
  (open.get(clip) || []).some((e) => (!user || e.user === user) && (!project || e.project === project));
export function endDrain(clipId: string, token: string): void {
  const list = open.get(clipId) || [];
  const next = list.filter((e) => e.token !== token);
  if (next.length === list.length) return; // unknown or already released
  if (next.length > 0) open.set(clipId, next); else open.delete(clipId);
  const ready = waiters.filter((w) => w.clip === clipId && !relevant(w.clip, w.user, w.project));
  if (ready.length) { waiters = waiters.filter((w) => !ready.includes(w)); ready.forEach((w) => w.release()); }
}
export const isDraining = (clipId: string, user?: string, project?: string): boolean => relevant(clipId, user, project);
export const pendingWaiters = (): number => waiters.length;
/**
 * Resolves true only when every relevant drain token is released. Resolves false when `signal` aborts first
 * (the waiter is removed; no token is touched). onSlow fires once after slowMs while still waiting.
 */
export function waitForDrain(clipId: string, onSlow?: () => void, slowMs = 20000, opts?: { user?: string; project?: string; signal?: { aborted: boolean; addEventListener?: (t: 'abort', f: () => void) => void } }): Promise<boolean> {
  if (opts?.signal?.aborted) return Promise.resolve(false);
  if (!relevant(clipId, opts?.user, opts?.project)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const w: Waiter = { clip: clipId, user: opts?.user, project: opts?.project, release: () => { if (timer) clearTimeout(timer); resolve(true); } };
    timer = setTimeout(() => { if (relevant(clipId, opts?.user, opts?.project)) onSlow?.(); }, slowMs);
    waiters.push(w);
    opts?.signal?.addEventListener?.('abort', () => {
      if (!waiters.includes(w)) return;
      waiters = waiters.filter((x) => x !== w); if (timer) clearTimeout(timer); resolve(false);
    });
  });
}
