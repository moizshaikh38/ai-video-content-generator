import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080B12] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-[#0E1017] p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="size-6 text-rose-400" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-white font-['Sora',sans-serif]">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              The page encountered an unexpected error. Try refreshing — your work is saved on the server.
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
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Try again
              </button>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-sm font-semibold transition-colors"
              >
                <Home size={15} aria-hidden="true" />
                Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
