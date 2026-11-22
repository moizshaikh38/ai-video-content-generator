import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export const isPageAssetLoadError = (error: Error | null): boolean =>
  /Unable to preload CSS|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk [\w-]+ failed|CSS_CHUNK_LOAD_FAILED|ChunkLoadError/i.test(error?.message || '');

export const getErrorRecoveryLink = (pathname: string): { href: string; label: string } => {
  const privatePaths = ['/dashboard', '/workflows', '/workspaces', '/projects', '/subtitles',
    '/studio', '/clips', '/history', '/media-library', '/brand', '/publishing', '/analytics',
    '/ab-testing', '/billing', '/settings', '/help', '/admin', '/new'];
  const isPrivatePath = privatePaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  return isPrivatePath ? { href: '/dashboard', label: 'Dashboard' } : { href: '/', label: 'Back to Home' };
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Root ErrorBoundary: catches rendering errors and shows a recovery screen
 * instead of a blank page. Wrap around the router to catch everything.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Rendering error caught:', error.message, info.componentStack);
  }

  private handleRetry = () => {
    if (isPageAssetLoadError(this.state.error)) {
      // User-initiated only. A full reload replaces a rejected lazy-import promise
      // and preserves the current path, query and hash without clearing storage.
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isAssetError = isPageAssetLoadError(this.state.error);
      const recoveryLink = getErrorRecoveryLink(typeof window === 'undefined' ? '/' : window.location.pathname);
      return (
        <div className="min-h-screen bg-[#080B12] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-[#0E1017] p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="size-6 text-rose-400" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-white font-['Sora',sans-serif]">
              {isAssetError ? "Page update couldn't load" : 'Something went wrong'}
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {isAssetError
                ? 'A required page file could not load. Refresh to try the latest page. Unsaved changes may be lost.'
                : 'The page encountered an unexpected error. You can try again or refresh the page. Unsaved changes may be lost when refreshing.'}
            </p>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-[11px] font-mono text-slate-500 cursor-pointer hover:text-slate-300">
                  Technical details
                </summary>
                <pre className="mt-2 text-[10px] font-mono text-rose-300/70 bg-white/[0.03] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
                </pre>
              </details>
            )}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
              >
                <RefreshCw size={15} aria-hidden="true" />
                {isAssetError ? 'Refresh page' : 'Try again'}
              </button>
              <a
                href={recoveryLink.href}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-sm font-semibold transition-colors"
              >
                <Home size={15} aria-hidden="true" />
                {recoveryLink.label}
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
