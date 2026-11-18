import React from 'react';
import {
  Coins,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { CreditEstimate, CreditBalanceSummary } from '../../services/creditService';
import { useNavigate } from 'react-router-dom';

interface CostTransparencySummaryProps {
  estimate: CreditEstimate | null;
  wallet: CreditBalanceSummary | null;
  durationSeconds?: number;
  isReusedTranscript?: boolean;
  isLoading?: boolean;
  operationLabel?: string;
  className?: string;
  compact?: boolean;
}

export const CostTransparencySummary: React.FC<CostTransparencySummaryProps> = ({
  estimate,
  wallet,
  durationSeconds = 0,
  isReusedTranscript = false,
  isLoading = false,
  operationLabel = 'Video Processing',
  className = '',
  compact = false,
}) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className={`p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center gap-2 text-xs text-zinc-400 ${className}`}>
        <Loader2 className="size-4 animate-spin text-violet-400" />
        <span>Calculating credit requirements based on video duration...</span>
      </div>
    );
  }

  if (!estimate && !wallet) return null;

  if (compact) {
    if (!estimate) return <div className="p-3 rounded-xl bg-white/[0.03] text-xs text-amber-200">Credit estimate unavailable. No amount has been confirmed.</div>;
    return <details className={`rounded-xl bg-white/[0.03] border border-white/10 text-xs text-zinc-300 ${className}`}>
      <summary className="p-3 cursor-pointer">Estimated: {estimate.estimated_credits} credits · Available: {wallet?.is_unlimited ? 'Unlimited' : estimate.available_credits}{!estimate.has_sufficient_credits ? ' · Check your balance' : ''} <span className="text-violet-300">Details</span></summary>
      <CostTransparencySummary estimate={estimate} wallet={wallet} durationSeconds={durationSeconds} isReusedTranscript={isReusedTranscript} operationLabel={operationLabel}/>
    </details>;
  }

  const estimatedCredits = estimate?.estimated_credits ?? (isReusedTranscript ? 0 : Math.max(1, Math.ceil(durationSeconds / 15)));
  const availableCredits = wallet?.available_credits ?? estimate?.available_credits ?? 0;
  const isUnlimited = wallet?.is_unlimited ?? false;
  const hasSufficientCredits = isUnlimited || availableCredits >= estimatedCredits;
  const remainingAfter = isUnlimited ? '∞' : Math.max(0, availableCredits - estimatedCredits);

  const formatSecs = (sec: number) => {
    if (!sec || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className={`rounded-xl bg-[var(--vc-surface-2,#1a1824)] border ${
        !hasSufficientCredits
          ? 'border-amber-500/40 bg-amber-500/[0.03]'
          : 'border-white/[0.08]'
      } p-4 space-y-3.5 ${className}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-violet-400" />
          <span className="font-semibold text-white">Pre-Flight Credit Transparency</span>
          <span className="text-[10px] text-zinc-500">({operationLabel})</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span>Rate: </span>
          <strong className="text-zinc-200">1 credit / 15s</strong>
          <span className="text-zinc-500">(min 1)</span>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        {/* 1. Measured Duration */}
        <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 block uppercase">Source Duration</span>
          <span className="font-mono font-bold text-zinc-200 text-sm mt-0.5 block">
            {formatSecs(durationSeconds)}
            <span className="text-[10px] text-zinc-500 font-normal ml-1">({Math.ceil(durationSeconds)}s)</span>
          </span>
        </div>

        {/* 2. Billing Units */}
        <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 block uppercase">Interval Units</span>
          <span className="font-mono font-bold text-zinc-200 text-sm mt-0.5 block">
            {isReusedTranscript ? '0 (Reused)' : `${Math.max(1, Math.ceil(durationSeconds / 15))} intervals`}
          </span>
        </div>

        {/* 3. Estimated Cost */}
        <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 block uppercase">Required Credits</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`font-mono font-extrabold text-sm ${isReusedTranscript ? 'text-cyan-400' : 'text-violet-300'}`}>
              {isReusedTranscript ? '0 credits' : `${estimatedCredits} ${estimatedCredits === 1 ? 'credit' : 'credits'}`}
            </span>
          </div>
        </div>

        {/* 4. Wallet Remaining */}
        <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 block uppercase">Balance After Job</span>
          <span
            className={`font-mono font-bold text-sm mt-0.5 block ${
              hasSufficientCredits ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {isUnlimited ? '∞' : `${remainingAfter} remaining`}
          </span>
        </div>
      </div>

      {/* Reused transcript note */}
      {isReusedTranscript && (
        <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-2 text-xs text-cyan-200">
          <CheckCircle2 className="size-4 shrink-0 text-cyan-400" />
          <span>
            <strong>Free Transcript Reuse:</strong> An existing transcript is linked to this video. Zero credits will be charged for speech-to-text!
          </span>
        </div>
      )}

      {/* Insufficient Credit Warning */}
      {!hasSufficientCredits && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
            <span>
              <strong>Insufficient Credits:</strong> You need <strong>{estimatedCredits} credits</strong>, but only have <strong>{availableCredits} credits</strong> available.
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-semibold text-[11px] whitespace-nowrap self-start sm:self-auto transition-colors cursor-pointer"
          >
            View Plans & Upgrades
          </button>
        </div>
      )}

      {/* Atomic Reservation & Safety Guarantee */}
      <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
        <ShieldCheck className="size-3.5 text-zinc-400 shrink-0" />
        <span>
          <strong>Atomic Safety Guarantee:</strong> Credits are reserved at job start and settled on completion. Any unrendered duration or failed job is 100% refunded automatically.
        </span>
      </div>
    </div>
  );
};
