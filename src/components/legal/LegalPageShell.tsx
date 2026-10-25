import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react';

/**
 * Shared shell for legal/support pages: premium header band, reading-progress
 * bar, auto-generated table of contents (from rendered h2[id] elements), and
 * anchor-aware smooth scrolling. Content stays in the page files — the shell
 * only adds chrome, so legal text is never duplicated or drifts.
 */

export interface LegalPageShellProps {
  /** Small uppercase eyebrow, e.g. "Legal Agreement". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  lastUpdated: string;
  /** Optional badge chip next to the meta row (e.g. draft warning). */
  statusChip?: { label: string; tone: 'draft' | 'ok' };
  children: React.ReactNode;
}

const toneStyles: Record<'draft' | 'ok', string> = {
  draft: 'bg-amber-100 text-amber-900 border-amber-300',
  ok: 'bg-emerald-100 text-emerald-900 border-emerald-300',
};

export const LegalPageShell: React.FC<LegalPageShellProps> = ({
  eyebrow,
  title,
  subtitle,
  lastUpdated,
  statusChip,
  children,
}) => {
  const [toc, setToc] = useState<Array<{ id: string; text: string }>>([]);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Auto-TOC from rendered h2[id] sections
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const headings = Array.from(container.querySelectorAll('h2[id]'));
    setToc(
      headings.map((h) => ({
        id: h.id,
        text: h.textContent || '',
      }))
    );

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(100, (doc.scrollTop / max) * 100) : 0);

      // Active section = last heading above the viewport middle
      let current: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top < window.innerHeight * 0.4) {
          current = h.id;
        }
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [children]);

  return (
    <div className="min-h-screen bg-[#f4f6f1] text-[#1a2e22]">
      {/* Reading progress */}
      <div
        className="fixed top-0 left-0 right-0 h-1 z-50 bg-transparent"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full bg-gradient-to-r from-[#36764c] to-[#5ea477] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header band */}
      <header className="relative overflow-hidden bg-[#0d1f15] text-white">
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#36764c]/25 blur-[100px] pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#20E3A2]/10 blur-[90px] pointer-events-none mv-float-slow"
          aria-hidden="true"
        />
        <div className="max-w-5xl mx-auto px-5 lg:px-8 pt-10 pb-14 relative">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft size={15} />
            Back to VireoClip home
          </Link>

          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#8fd6a8]">
            <ShieldCheck size={14} aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-3 mv-rise">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-sm text-white/60 max-w-2xl leading-relaxed">{subtitle}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70">
              <Clock size={12} aria-hidden="true" />
              Last updated: {lastUpdated}
            </span>
            {statusChip && (
              <span className={`px-2.5 py-1 rounded-full border font-semibold uppercase tracking-wide ${toneStyles[statusChip.tone]}`}>
                {statusChip.label}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70">
              vireoclip.ai
            </span>
          </div>
        </div>
      </header>

      {/* Body: TOC + content */}
      <div className="max-w-5xl mx-auto px-5 lg:px-8 py-12 flex gap-10 items-start">
        {toc.length > 1 && (
          <nav
            aria-label="Table of contents"
            className="hidden lg:block w-60 shrink-0 sticky top-8"
          >
            <div className="rounded-2xl border border-[#dfe7da] bg-white/70 backdrop-blur p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#36764c] mb-2.5">
                On this page
              </p>
              <ol className="space-y-1.5">
                {toc.map((item, i) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`block text-[11px] leading-snug rounded-md px-2 py-1 transition-colors ${
                        activeId === item.id
                          ? 'bg-[#36764c]/10 text-[#183d2d] font-semibold'
                          : 'text-[#5c6e60] hover:text-[#183d2d] hover:bg-black/[0.03]'
                      }`}
                    >
                      <span className="font-mono text-[9px] text-[#8aa192] mr-1.5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {item.text}
                    </a>
                  </li>
                ))}
              </ol>
              <Link
                to="/support"
                className="mt-3 block text-center text-[11px] font-semibold px-3 py-2 rounded-xl bg-[#183d2d] text-white hover:bg-[#22543a] transition-colors"
              >
                Need help? Support →
              </Link>
            </div>
          </nav>
        )}

        <div ref={contentRef} className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
};

/** Standard section styling for legal body copy (h2 must carry the id for the TOC). */
export const LegalSection: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children,
}) => (
  <section className="scroll-mt-16">
    <h2 id={id} className="text-xl font-bold text-[#183d2d] mb-3">
      {title}
    </h2>
    {children}
  </section>
);
