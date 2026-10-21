import React from 'react';
import { ChevronDown } from 'lucide-react';
import { SECTION_LABEL, SECTION_TRIGGER, SECTION_SUMMARY } from './panelTokens';
import { usePanelPref } from '../../../lib/panelPrefs';

export const SectionLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({
  children,
  hint,
}) => (
  <div className="px-0.5 mb-1.5">
    <div className={SECTION_LABEL}>{children}</div>
    {hint && <p className="text-[10.5px] text-vc-text-muted mt-0.5 leading-snug">{hint}</p>}
  </div>
);

interface CollapsibleSectionProps {
  /** Stable key — the open/closed state persists under this id across remounts. */
  id: string;
  title: string;
  /**
   * Current value shown on the right when collapsed (e.g. "Center · 2 lines"), so collapsing
   * hides the controls without hiding what they're set to.
   */
  summary?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  summary,
  count,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = usePanelPref<boolean>(`section.${id}`, defaultOpen);
  const contentId = `panel-section-${id}`;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className={SECTION_TRIGGER}
      >
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-vc-text-muted transition-transform duration-150 ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className={SECTION_LABEL}>{title}</span>
        {typeof count === 'number' && (
          <span className="text-[10px] text-vc-text-muted tabular-nums">{count}</span>
        )}
        {!open && summary && <span className={SECTION_SUMMARY}>{summary}</span>}
      </button>

      {open && (
        <div id={contentId} className="pt-1 pb-1 space-y-2.5">
          {children}
        </div>
      )}
    </section>
  );
};
