import React, { useEffect, useState } from 'react';
import {
  X,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { CreditService, CreditTransactionRecord, CreditBalanceSummary } from '../../services/creditService';
import { BTN_PILL_BRAND_SOFT } from '../../lib/buttonStyles';

interface CreditTransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletSummary?: CreditBalanceSummary | null;
}

export const CreditTransactionHistoryModal: React.FC<CreditTransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  walletSummary,
}) => {
  const [transactions, setTransactions] = useState<CreditTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'grant' | 'reservation' | 'settlement' | 'refund'>('all');

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await CreditService.getTransactionHistory(50);
      setTransactions(data || []);
    } catch (err) {
      console.error('Failed to load transaction ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTransactions = transactions.filter((t) => {
    if (filter === 'all') return true;
    const type = t.type.toLowerCase();
    if (filter === 'grant') return type === 'grant' || type === 'monthly_grant';
    if (filter === 'settlement') return type === 'settlement' || type === 'consumption';
    if (filter === 'refund') return type === 'refund' || type === 'reservation_release';
    return type === filter;
  });

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const renderTypeBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'grant' || t === 'monthly_grant') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <ArrowDownLeft className="size-3 text-emerald-400" />
          {t === 'monthly_grant' ? 'Monthly Grant' : 'Grant'}
        </span>
      );
    }
    if (t === 'reservation') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Clock className="size-3 text-amber-400" />
          Reserved
        </span>
      );
    }
    if (t === 'settlement' || t === 'consumption') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
          <ArrowUpRight className="size-3 text-violet-400" />
          Settled
        </span>
      );
    }
    if (t === 'refund' || t === 'reservation_release') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <CheckCircle2 className="size-3 text-cyan-400" />
          Refund
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-zinc-300 border border-white/10">
        {type}
      </span>
    );
  };

  const renderAmount = (t: CreditTransactionRecord) => {
    const type = t.type.toLowerCase();
    if (type === 'grant' || type === 'monthly_grant' || type === 'refund' || type === 'reservation_release') {
      return <span className="font-mono font-bold text-emerald-400">+{Math.abs(t.amount)}</span>;
    }
    if (type === 'settlement' || type === 'consumption') {
      return <span className="font-mono font-bold text-rose-400">-{Math.abs(t.amount)}</span>;
    }
    if (type === 'reservation') {
      return <span className="font-mono font-medium text-amber-300">~{Math.abs(t.amount)}</span>;
    }
    return <span className="font-mono font-medium text-zinc-200">{t.amount}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-3xl rounded-2xl bg-[var(--vc-surface-1,#121118)] border border-[var(--vc-border,#2a2738)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--vc-border,#2a2738)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-violet-600/20 border border-violet-500/30 grid place-items-center">
              <Coins className="size-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Credit Transaction Ledger
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  Live Audit
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Transparent record of every grant, processing reservation, settlement, and automatic refund.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Current Wallet Summary Pill */}
        {walletSummary && (
          <div className="px-5 py-3 bg-white/[0.02] border-b border-[var(--vc-border,#2a2738)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <span className="text-zinc-500 block text-[11px]">Available</span>
              <span className="font-mono font-bold text-white text-base">
                {walletSummary.is_unlimited ? '∞' : walletSummary.available_credits.toLocaleString()}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <span className="text-zinc-500 block text-[11px]">Reserved</span>
              <span className="font-mono font-bold text-amber-300 text-base">
                {walletSummary.reserved_credits.toLocaleString()}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <span className="text-zinc-500 block text-[11px]">Consumed</span>
              <span className="font-mono font-bold text-zinc-300 text-base">
                {walletSummary.consumed_credits.toLocaleString()}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <span className="text-zinc-500 block text-[11px]">Total Granted</span>
              <span className="font-mono font-bold text-violet-300 text-base">
                {walletSummary.is_unlimited ? '∞' : walletSummary.total_credits.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Filters and Refresh */}
        <div className="px-5 py-3 border-b border-[var(--vc-border,#2a2738)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            {(['all', 'grant', 'reservation', 'settlement', 'refund'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded-full font-medium transition-colors capitalize ${
                  filter === tab
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                {tab === 'all' ? 'All Transactions' : `${tab}s`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadTransactions}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Transaction Table / List */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {loading ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <RefreshCw className="size-6 animate-spin mx-auto text-violet-400" />
              <p className="text-xs">Loading transaction ledger...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <HelpCircle className="size-8 mx-auto text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No transactions found</p>
              <p className="text-xs max-w-sm mx-auto text-zinc-500">
                {filter === 'all'
                  ? 'Your credit ledger is empty. Credit grants, processing reservations, and settlements will appear here.'
                  : `No ${filter} transactions match your current filter.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[580px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-zinc-400">
                    <th className="pb-2.5 font-medium">Date</th>
                    <th className="pb-2.5 font-medium">Type</th>
                    <th className="pb-2.5 font-medium">Description</th>
                    <th className="pb-2.5 font-medium text-right">Amount</th>
                    <th className="pb-2.5 font-medium text-right">Available After</th>
                    <th className="pb-2.5 font-medium text-right">Reserved After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 text-zinc-400 whitespace-nowrap">{formatDate(tx.created_at)}</td>
                      <td className="py-3 whitespace-nowrap">{renderTypeBadge(tx.type)}</td>
                      <td className="py-3 text-zinc-200 max-w-xs truncate" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">{renderAmount(tx)}</td>
                      <td className="py-3 text-right font-mono text-zinc-300 whitespace-nowrap">
                        {tx.balance_after.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-mono text-amber-300/80 whitespace-nowrap">
                        {tx.reserved_after.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="p-4 bg-white/[0.02] border-t border-[var(--vc-border,#2a2738)] flex items-center justify-between text-[11px] text-zinc-500">
          <span>Formula: 1 credit per 15s interval. Reserved at launch, settled upon completion.</span>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1 text-xs font-semibold ${BTN_PILL_BRAND_SOFT}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
