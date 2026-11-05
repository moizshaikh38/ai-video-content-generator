import React from 'react';
import { AlertCircle, ArrowUpRight, RefreshCw, X, ShieldAlert, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface SaasErrorAlertProps {
  error: string | { code?: string; message?: string; details?: any } | null | undefined;
  onRetry?: () => void;
  onDismiss?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

export const SaasErrorAlert: React.FC<SaasErrorAlertProps> = ({
  error,
  onRetry,
  onDismiss,
  onAction,
  actionLabel,
  className = '',
}) => {
  const navigate = useNavigate();

  if (!error) return null;

  const rawMsg = typeof error === 'string' ? error : error.message || 'An unexpected error occurred.';
  const code = (typeof error === 'object' && error?.code ? error.code : '').toUpperCase();

  // Determine error category and specialized guidance
  let title = 'Operation Failed';
  let description = rawMsg;
  let primaryAction: { label: string; onClick: () => void; isPrimary?: boolean } | null = null;
  let tone: 'amber' | 'rose' | 'violet' = 'rose';

  if (code === 'INSUFFICIENT_CREDITS' || rawMsg.toLowerCase().includes('insufficient credit')) {
    title = 'Insufficient Credits';
    description = rawMsg || 'You do not have enough available credits to start this operation. Unused credits are never lost, and 100% of reserved credits are refunded on error.';
    tone = 'amber';
    primaryAction = {
      label: 'View Credit Plans',
      onClick: () => navigate('/billing'),
      isPrimary: true,
    };
  } else if (code === 'PRESET_RESTRICTED' || rawMsg.toLowerCase().includes('preset') && rawMsg.toLowerCase().includes('not available')) {
    title = 'Premium Subtitle Preset';
    description = rawMsg || 'This subtitle preset is available on the Creator and Pro plans. Free plan users have access to Simple, Clean, and None.';
    tone = 'violet';
    primaryAction = {
      label: 'Compare Plans',
      onClick: () => navigate('/billing'),
      isPrimary: true,
    };
  } else if (code === 'WATERMARK_REQUIRED_RERENDER' || rawMsg.toLowerCase().includes('watermark') && rawMsg.toLowerCase().includes('re-render')) {
    title = 'Re-Render Required (Free Plan)';
    description = 'This video was exported under a paid subscription without a watermark. Under your current plan, a permanent watermark is required. Re-rendering will produce your watermarked export at 0 additional cost.';
    tone = 'amber';
    if (onRetry) {
      primaryAction = {
        label: 'Re-Render with Watermark',
        onClick: onRetry,
        isPrimary: true,
      };
    }
  } else if (code === 'MONTHLY_RENDER_LIMIT_EXCEEDED' || rawMsg.toLowerCase().includes('monthly clip render limit')) {
    title = 'Monthly Render Limit Reached';
    description = rawMsg || 'You have reached your monthly clip render limit. Upgrade to Creator or Pro to unlock higher monthly render allowances.';
    tone = 'amber';
    primaryAction = {
      label: 'Upgrade Plan',
      onClick: () => navigate('/billing'),
      isPrimary: true,
    };
  } else if (code === 'MAX_PROJECTS_EXCEEDED' || rawMsg.toLowerCase().includes('project limit')) {
    title = 'Project Limit Reached';
    description = rawMsg || 'You have reached the maximum number of active projects allowed on your current tier. Archive older projects or upgrade for higher capacity.';
    tone = 'amber';
    primaryAction = {
      label: 'Upgrade Capacity',
      onClick: () => navigate('/billing'),
      isPrimary: true,
    };
  } else if (code === 'FILE_SIZE_EXCEEDED' || code === 'DURATION_LIMIT_EXCEEDED') {
    title = 'File Limit Exceeded';
    description = rawMsg;
    tone = 'amber';
    primaryAction = {
      label: 'View Upload Limits',
      onClick: () => navigate('/billing'),
      isPrimary: true,
    };
  } else if (onRetry) {
    primaryAction = {
      label: actionLabel || 'Retry',
      onClick: onRetry,
      isPrimary: false,
    };
  }

  // Override primaryAction if caller supplied custom onAction
  if (onAction && actionLabel) {
    primaryAction = {
      label: actionLabel,
      onClick: onAction,
      isPrimary: true,
    };
  }

  const borderTone =
    tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : tone === 'violet'
      ? 'border-violet-500/30 bg-violet-500/10 text-violet-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  const iconTone =
    tone === 'amber'
      ? 'text-amber-400'
      : tone === 'violet'
      ? 'text-violet-400'
      : 'text-rose-400';

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 p-4 rounded-2xl border ${borderTone} shadow-lg backdrop-blur-md transition-all ${className}`}
    >
      <div className="mt-0.5 shrink-0">
        {tone === 'violet' ? (
          <Sparkles className={`size-5 ${iconTone}`} />
        ) : tone === 'amber' ? (
          <AlertCircle className={`size-5 ${iconTone}`} />
        ) : (
          <ShieldAlert className={`size-5 ${iconTone}`} />
        )}
      </div>

      <div className="flex-1 min-w-0 pr-6">
        <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-zinc-300">{description}</p>

        {primaryAction && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={primaryAction.onClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                primaryAction.isPrimary
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-md'
                  : 'bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white'
              }`}
            >
              <span>{primaryAction.label}</span>
              <ArrowUpRight className="size-3.5" />
            </button>
            {onRetry && primaryAction.label !== 'Retry' && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RefreshCw className="size-3" />
                <span>Try again</span>
              </button>
            )}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3.5 right-3.5 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Dismiss alert"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};
