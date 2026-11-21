/** Keep a pending landing-page creation URL through login or signup. */
export function landingReturnPath(search: string, from?: { pathname?: string; search?: string }): string {
  const next = new URLSearchParams(search).get('next') || `${from?.pathname || ''}${from?.search || ''}`;
  if (next === '/projects/new' || next.startsWith('/projects/new?')) return next;
  // Tools-pages paste-link handoff: keep the video URL (and tool preselection) through sign-in.
  if (/^\/dashboard\?url=/.test(next)) return next;
  return '/dashboard';
}

export function authPathWithReturn(base: '/login' | '/signup', destination: string): string {
  return destination === '/dashboard' ? base : `${base}?next=${encodeURIComponent(destination)}`;
}
