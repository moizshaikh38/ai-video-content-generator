import React, { useState } from 'react';
import { AlertCircle, Calendar, Zap, X, ArrowUpRight } from 'lucide-react';
import { Button } from './Button';

export interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitMinutes: number;
  remainingMinutes: number;
  requestedMinutes?: number;
  resetDate?: string;
}

export const QuotaExceededModal: React.FC<QuotaExceededModalProps> = ({
  isOpen,
  onClose,
  limitMinutes,
  remainingMinutes,
  requestedMinutes,
  resetDate,
}) => {
  const [showPlanNotice, setShowPlanNotice] = useState(false);

  if (!isOpen) return null;

  const formattedResetDate = resetDate
    ? new Date(resetDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'the 1st of next month';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quota-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-scrim animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-3xl glass-float p-6 space-y-5 animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-xl p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
          aria-label="Close modal"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 id="quota-modal-title" className="text-lg font-semibold font-display text-foreground">
              Monthly processing limit reached
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your account has exhausted its available processing quota for this billing cycle.
            </p>
          </div>
        </div>

        {/* Quota Stats Ledger Card */}
        <div className="rounded-xl bg-white/[0.04] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-vireo-green" /> Monthly Quota:
            </span>
            <span className="font-semibold font-mono text-foreground">{limitMinutes} minutes</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Remaining Quota:</span>
            <span className="font-semibold font-mono text-destructive">
              {remainingMinutes.toFixed(1)} minutes
            </span>
          </div>

          {requestedMinutes !== undefined && requestedMinutes > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Video Duration Required:</span>
              <span className="font-semibold font-mono text-foreground">
                ~{requestedMinutes.toFixed(1)} minutes
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="size-3.5 text-violet-300" /> Quota Resets:
            </span>
            <span className="font-semibold text-foreground">{formattedResetDate}</span>
          </div>
        </div>

        {showPlanNotice && (
          <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300 dark:text-amber-300">
            <strong>Paid plans coming soon!</strong> Higher quota tiers and team seats are currently in private beta.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Dismiss
          </Button>
          <Button
            variant="clay"
            size="sm"
            onClick={() => setShowPlanNotice(true)}
            className="flex items-center gap-1"
          >
            <span>View plan</span>
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
