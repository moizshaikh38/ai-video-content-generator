import React, { useState } from 'react';
import {
  Coins,
  History,
  Clock,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { CreditBalanceSummary, PlanEntitlements } from '../../services/creditService';
import { CreditTransactionHistoryModal } from './CreditTransactionHistoryModal';

interface CreditOverviewCardProps {
  wallet: CreditBalanceSummary | null;
  entitlements?: PlanEntitlements | null;
  onUpgradeClick?: () => void;
  className?: string;
}

export const CreditOverviewCard: React.FC<CreditOverviewCardProps> = ({
  wallet,
  entitlements,
  onUpgradeClick,
  className = '',
}) => {
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  const available = wallet?.available_credits ?? 0;
  const reserved = wallet?.reserved_credits ?? 0;
  const consumed = wallet?.consumed_credits ?? 0;
  const allowance = entitlements?.monthlyCredits ?? wallet?.total_credits ?? 60;
  const isUnlimited = wallet?.is_unlimited || entitlements?.isUnlimited;

  // Percentage of allowance consumed
  const consumedPct = isUnlimited
    ? 0
    : Math.min(100, Math.round((consumed / Math.max(1, allowance)) * 100));

  const formatPeriodEnd = (dateStr?: string | null) => {
    if (!dateStr) return 'End of billing cycle';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  };

  return (
    <>
      <div
        className={`rounded-2xl bg-[var(--vc-surface-1,#121118)] border border-[var(--vc-border,#2a2738)] p-6 shadow-xl relative overflow-hidden ${className}`}
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-12 -right-12 size-40 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-violet-500/15 border border-violet-500/25 grid place-items-center">
              <Coins className="size-5 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Unified Credit Wallet</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {entitlements?.displayName || 'Active Plan'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                1 unified credit = 15 seconds of AI clipping or transcription.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsLedgerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-xs font-semibold text-zinc-200 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <History className="size-3.5 text-violet-400" />
            <span>Transaction Ledger</span>
          </button>
        </div>

        {/* Metric Badges Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5">
          {/* 1. Available Credits */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Available Credits
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
                {isUnlimited ? '∞' : available.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-500">ready</span>
            </div>
          </div>

          {/* 2. Reserved in Jobs */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Reserved in Jobs
              </span>
              {reserved > 0 && <Clock className="size-3.5 text-amber-400 animate-pulse" />}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                  reserved > 0 ? 'text-amber-300' : 'text-zinc-500'
                }`}
              >
                {reserved.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-500">locked</span>
            </div>
          </div>

          {/* 3. Consumed this cycle */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Consumed
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-zinc-300 tracking-tight">
                {consumed.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-500">used</span>
            </div>
          </div>

          {/* 4. Monthly Allowance (Provisional) */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Monthly Allowance
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700"
                title="Configurable plan allowance during launch preview"
              >
                Provisional
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-violet-300 tracking-tight">
                {isUnlimited ? '∞' : allowance.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-500">/mo</span>
            </div>
          </div>
        </div>

        {/* Usage Progress Bar */}
        {!isUnlimited && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Monthly Credit Allocation</span>
              <span className="font-mono text-zinc-300">
                {available} available of {allowance} granted ({consumedPct}% consumed)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  consumedPct > 85 ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, 100 - (available / Math.max(1, allowance)) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer info: Renewal date + Atomic reservation guarantee */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-zinc-500" />
            <span>
              Next renewal: <strong className="text-zinc-200">{formatPeriodEnd(entitlements?.currentPeriodEnd)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 hidden md:inline">
              Atomic reservation: credits are locked at launch, settled upon completion, refunded on error.
            </span>
            {onUpgradeClick && (
              <button
                type="button"
                onClick={onUpgradeClick}
                className="text-violet-400 hover:text-violet-300 font-semibold inline-flex items-center gap-1 text-xs"
              >
                <span>Upgrade</span>
                <ArrowRight className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ledger Modal */}
      <CreditTransactionHistoryModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
        walletSummary={wallet}
      />
    </>
  );
};
