import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';

const STORAGE_KEY = 'vireo_cookie_notice_dismissed';

export const CookieNotice: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
      setDismissed(isDismissed);
    } catch {
      // LocalStorage access restricted (private mode, etc.)
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore write errors
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <aside
      aria-label="Privacy and storage notice"
      role="region"
      className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-xl rounded-xl border border-white/10 bg-[#0E1017]/95 p-3 sm:p-3.5 text-slate-200 shadow-2xl backdrop-blur-xl transition-all sm:bottom-6 sm:left-6 sm:right-6"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="size-4 shrink-0 text-neutral-300 mt-0.5" aria-hidden="true" />
          <div className="text-[11px] leading-relaxed text-slate-300">
            <span className="font-semibold text-white">Browser storage: </span>
            VireoClip uses browser storage for sign-in, preferences, project recovery and cached previews. Dismissing this notice saves your choice on this browser. See our{' '}
            <Link
              to="/privacy"
              className="font-medium text-white underline hover:text-neutral-200 transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg bg-[#F4F6FB] text-[#0B0C0F] hover:bg-white px-2.5 py-1.5 text-[10px] font-semibold transition-all shadow-[0_4px_14px_rgba(0,0,0,0.45)] focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[#0E1017]"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss privacy notice"
            className="hidden sm:block rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors focus:outline-none"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
