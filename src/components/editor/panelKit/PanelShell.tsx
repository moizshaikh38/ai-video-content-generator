import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  PANEL_SHELL,
  PANEL_SURFACE,
  PANEL_HEADER,
  PANEL_HEADER_TITLE,
  PANEL_HEADER_SUBTITLE,
  PANEL_BODY,
  PANEL_TOOLBAR,
  BADGE,
  TONE,
  type PanelTone,
} from './panelTokens';

interface PanelShellProps {
  /** Which edge the panel docks to — picks the glass surface with the correct single border. */
  side?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}

/**
 * Outer frame for a side panel. Deliberately `overflow-hidden`: PanelBody is the only scroller,
 * which is what stops the nested-scrollbar problem (panels currently sit inside an
 * `overflow-y-auto` drawer and sometimes add two more of their own).
 */
export const PanelShell: React.FC<PanelShellProps> = ({ side = 'left', className = '', children }) => (
  <div className={`${PANEL_SHELL} ${PANEL_SURFACE[side]} ${className}`}>{children}</div>
);

interface PanelHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone?: PanelTone };
  actions?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  badge,
  actions,
}) => (
  <div className={PANEL_HEADER}>
    <span className="shrink-0 w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-vc-text-secondary">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <div className="min-w-0 flex-1">
      <h3 className={PANEL_HEADER_TITLE}>{title}</h3>
      {subtitle && <p className={PANEL_HEADER_SUBTITLE}>{subtitle}</p>}
    </div>
    {badge && <span className={`${BADGE} ${TONE[badge.tone ?? 'neutral']}`}>{badge.label}</span>}
    {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
  </div>
);

/** The single scroll container for a panel. */
export const PanelBody: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => <div className={`${PANEL_BODY} ${className}`}>{children}</div>;

/** Sticky strip under the header for search/tabs — never scrolls with the body. */
export const PanelToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={PANEL_TOOLBAR}>{children}</div>
);
