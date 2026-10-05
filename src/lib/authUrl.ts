/**
 * Resolves the canonical OAuth redirect URL.
 * Uses window.location.origin dynamically so that:
 * - In local development: redirects to http://localhost:5173/dashboard
 * - In production / preview (Vercel): redirects to https://<current-domain>/dashboard
 */
export function getOAuthRedirectUrl(targetPath = '/dashboard'): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '');
    const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    return `${origin}${cleanPath}`;
  }
  return `http://localhost:5173${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
}
