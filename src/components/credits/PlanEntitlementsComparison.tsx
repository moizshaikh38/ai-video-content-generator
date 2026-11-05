import React, { useEffect, useState } from 'react';
import {
  Check,
  X,
  Info,
  Loader2,
} from 'lucide-react';
import { CreditService, PlanEntitlements } from '../../services/creditService';
import { BTN_PILL_BRAND, BTN_PILL_BRAND_SOFT } from '../../lib/buttonStyles';

interface PlanEntitlementsComparisonProps {
  currentPlanId?: string;
  onSelectPlan?: (planId: string) => void;
  className?: string;
}

export const PlanEntitlementsComparison: React.FC<PlanEntitlementsComparisonProps> = ({
  currentPlanId = 'free',
  onSelectPlan,
  className = '',
}) => {
  const [plans, setPlans] = useState<PlanEntitlements[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    CreditService.getAllPlans()
      .then((data) => {
        if (active && data?.length) setPlans(data);
      })
      .catch((err) => {
        console.warn('Could not fetch server plan entitlements:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  const formatDurationMin = (seconds: number) => {
    return `${Math.round(seconds / 60)} min`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Notice Banner: Payment Activation Deferred & Provisional Allowances */}
      <div className="p-4 rounded-2xl bg-violet-950/40 border border-violet-500/30 flex items-start gap-3 text-xs text-violet-200">
        <Info className="size-4 text-violet-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">
            Pre-Launch Sandbox &amp; Provisional Credit Allowances
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Payment gateway activation is currently deferred. Credit allowances (60, 500, 1,500, 4,000 credits/mo) and feature limits are provisional estimates subject to adjustment prior to commercial activation.
          </p>
        </div>
      </div>

      {/* Plans Comparison Grid */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-6 animate-spin text-violet-400" />
          <span>Loading plan entitlements...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const isCurrent = (currentPlanId || 'free').toLowerCase() === p.planId.toLowerCase();
          const isPopular = p.planId === 'creator';

          return (
            <div
              key={p.planId}
              className={`rounded-2xl p-5 flex flex-col justify-between border transition-all relative ${
                isCurrent
                  ? 'bg-violet-900/20 border-violet-500/80 shadow-[0_0_25px_-5px_rgba(139,92,246,0.3)] ring-1 ring-violet-500/40'
                  : isPopular
                  ? 'bg-white/[0.04] border-violet-500/40'
                  : 'bg-[var(--vc-surface-1,#121118)] border-white/[0.08]'
              }`}
            >
              {/* Badges */}
              <div className="flex items-center justify-between min-h-[22px] mb-2">
                {isPopular ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-600 text-white">
                    Most Popular
                  </span>
                ) : <span />}

                {isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Current Plan
                  </span>
                )}
              </div>

              {/* Plan Title & Credit Allowance */}
              <div>
                <h4 className="text-lg font-bold text-white capitalize">{p.displayName}</h4>
                <div className="mt-3 pb-4 border-b border-white/[0.08] space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold font-mono text-white">
                      {p.isUnlimited ? '∞' : p.monthlyCredits.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-400">credits / mo</span>
                  </div>
                  <span className="inline-block text-[10px] text-zinc-500 italic">
                    *Provisional allowance (1 credit / 15s)
                  </span>
                </div>

                {/* Feature Entitlements Checklist */}
                <ul className="py-4 space-y-2.5 text-xs text-zinc-300">
                  {/* Watermark Policy */}
                  <li className="flex items-center gap-2">
                    {p.watermarkRequired ? (
                      <span className="size-4 rounded-full bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                        !
                      </span>
                    ) : (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    )}
                    <span className={p.watermarkRequired ? 'text-amber-300 font-medium' : 'text-zinc-200'}>
                      {p.watermarkRequired ? 'VireoClip Watermark' : 'Clean Export (No Watermark)'}
                    </span>
                  </li>

                  {/* Subtitle Presets */}
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    <span>
                      {p.planId === 'free'
                        ? 'Standard Presets (Simple, Clean)'
                        : 'All 9 Viral Subtitle Presets'}
                    </span>
                  </li>

                  {/* Max Source Duration */}
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    <span>
                      Max video: <strong>{formatDurationMin(p.limits.maxUploadDurationSeconds)}</strong>
                    </span>
                  </li>

                  {/* Max File Size */}
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    <span>
                      Upload limit: <strong>{formatFileSize(p.limits.maxFileSizeBytes)}</strong>
                    </span>
                  </li>

                  {/* AI Smart Reframe */}
                  <li className="flex items-center gap-2">
                    {p.features.smartReframe ? (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <X className="size-4 text-zinc-600 shrink-0" />
                    )}
                    <span className={p.features.smartReframe ? 'text-zinc-200' : 'text-zinc-500'}>
                      AI Smart Face Reframe
                    </span>
                  </li>

                  {/* Animated Captions */}
                  <li className="flex items-center gap-2">
                    {p.features.animatedCaptions ? (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <X className="size-4 text-zinc-600 shrink-0" />
                    )}
                    <span className={p.features.animatedCaptions ? 'text-zinc-200' : 'text-zinc-500'}>
                      Kinetic Animated Captions
                    </span>
                  </li>

                  {/* Priority Processing Queue */}
                  <li className="flex items-center gap-2">
                    {p.features.priorityQueue ? (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <span className="size-4 rounded-full bg-white/[0.04] text-zinc-500 grid place-items-center text-[10px] shrink-0">
                        -
                      </span>
                    )}
                    <span className={p.features.priorityQueue ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>
                      {p.features.priorityQueue ? 'Priority AI Rendering Queue' : 'Standard Shared Queue'}
                    </span>
                  </li>

                  {/* Multi-Brand Kits */}
                  <li className="flex items-center gap-2">
                    {p.features.multiBrandKits ? (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <span className="size-4 rounded-full bg-white/[0.04] text-zinc-500 grid place-items-center text-[10px] shrink-0">
                        -
                      </span>
                    )}
                    <span className={p.features.multiBrandKits ? 'text-zinc-200' : 'text-zinc-500'}>
                      {p.planId === 'studio' ? 'Unlimited Brand Kits' : p.planId === 'pro' ? '3 Brand Kits' : p.planId === 'creator' ? '1 Brand Kit' : '0 Brand Kits'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Action Button */}
              <div className="pt-4 mt-auto border-t border-white/[0.06]">
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-semibold text-zinc-400 cursor-default text-center"
                  >
                    Active Plan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectPlan && onSelectPlan(p.planId)}
                    className={`w-full py-2 text-xs font-semibold ${
                      isPopular ? BTN_PILL_BRAND : BTN_PILL_BRAND_SOFT
                    }`}
                  >
                    Select {p.displayName} (Preview)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
