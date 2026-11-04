import React from 'react';
import { AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  STATE_WRAP,
  STATE_ICON,
  STATE_TITLE,
  STATE_HINT,
  ACTION_PRIMARY,
  ACTION_GHOST,
} from './panelTokens';

export const PanelEmpty: React.FC<{
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon: Icon, title, hint, action }) => (
  <div className={STATE_WRAP}>
    <span className={STATE_ICON}>
      <Icon className="w-4 h-4" />
    </span>
    <p className={STATE_TITLE}>{title}</p>
    {hint && <p className={STATE_HINT}>{hint}</p>}
    {action && (
      <button type="button" onClick={action.onClick} className={`${ACTION_PRIMARY} mt-1`}>
        {action.label}
      </button>
    )}
  </div>
);

/**
 * A real failure state. Panels must not substitute placeholder data on error — a dead endpoint
 * that renders like real content is worse than an honest error the user can retry.
 */
export const PanelError: React.FC<{
  title: string;
  detail?: string;
  onRetry?: () => void;
}> = ({ title, detail, onRetry }) => (
  <div className={`${STATE_WRAP} border-amber-500/30`}>
    <span className={`${STATE_ICON} text-amber-300 border-amber-500/25`}>
      <AlertTriangle className="w-4 h-4" />
    </span>
    <p className={STATE_TITLE}>{title}</p>
    {detail && <p className={STATE_HINT}>{detail}</p>}
    {onRetry && (
      <button type="button" onClick={onRetry} className={`${ACTION_GHOST} mt-1`}>
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </button>
    )}
  </div>
);
