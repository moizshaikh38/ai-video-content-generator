import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Globe2,
  Loader2,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import {
  BillingContext,
  BillingInterval,
  BillingInvoice,
  BillingService,
  BillingUsage,
  PlanOffer,
  UserEntitlement,
} from '../services/billingService';
import { openRazorpaySubscriptionCheckout } from '../services/razorpayService';

type Notice = { tone: 'success' | 'info' | 'warning' | 'error'; message: string } | null;

const PAID_ACCESS = ['active', 'trialing'];
const CONFIRM_POLL_MS = 3000;
const CONFIRM_TIMEOUT_MS = 90_000;

const NON_BILLING_REGIONS = new Set(['EU', 'UN', 'EZ', 'QO', 'ZZ', 'XA', 'XB', 'AQ']);

/** Every ISO 3166-1 alpha-2 region the browser can name, sorted by display name. */
function countryOptions(): Array<{ code: string; name: string }> {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return [];
  }
  const out: Array<{ code: string; name: string }> = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NON_BILLING_REGIONS.has(code)) continue;
      const name = names.of(code);
      if (name && name !== code) out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

function formatMoney(amount: number, currency: 'INR' | 'USD' | string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-emerald-500/15 text-emerald-300' },
  trialing: { label: 'Trial', tone: 'bg-emerald-500/15 text-emerald-300' },
  past_due: { label: 'Payment failed', tone: 'bg-amber-500/15 text-amber-300' },
  canceled: { label: 'Canceled', tone: 'bg-white/[0.08] text-zinc-300' },
  incomplete: { label: 'Awaiting payment', tone: 'bg-white/[0.08] text-zinc-300' },
  paused: { label: 'Paused', tone: 'bg-white/[0.08] text-zinc-300' },
  unpaid: { label: 'Unpaid', tone: 'bg-rose-500/15 text-rose-300' },
};

const GATEWAY_COPY = {
  razorpay: 'Prices in Indian rupees. Payments are processed securely by Razorpay (UPI, cards, netbanking).',
  paddle: 'Prices in US dollars. Payments are processed by Paddle, our reseller; local taxes may be added at checkout.',
} as const;

const NOTICE_TONE = {
  success: 'bg-emerald-500/10 text-emerald-200',
  info: 'bg-white/[0.05] text-zinc-200',
  warning: 'bg-amber-500/10 text-amber-200',
  error: 'bg-rose-500/10 text-rose-200',
} as const;

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-2xl bg-white/[0.04] ${className}`} />
);

export const BillingPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [context, setContext] = useState<BillingContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [notice, setNotice] = useState<Notice>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const [countryDraft, setCountryDraft] = useState('');
  const [countryBusy, setCountryBusy] = useState(false);
  const [editingCountry, setEditingCountry] = useState(false);
  const countries = useMemo(countryOptions, []);
  const pollTimer = useRef<number | null>(null);

  const loadAll = useCallback(async () => {
    setContextError(null);
    const [ctx, sub, use, inv] = await Promise.allSettled([
      BillingService.getBillingContext(),
      BillingService.getSubscription(),
      BillingService.getUsage(),
      BillingService.getInvoices(),
    ]);
    if (ctx.status === 'fulfilled') {
      setContext(ctx.value);
      setCountryDraft(ctx.value.country || '');
    } else {
      setContextError(ctx.reason?.message || 'Could not load billing details.');
    }
    if (sub.status === 'fulfilled') setEntitlement(sub.value.entitlement);
    if (use.status === 'fulfilled') setUsage(use.value);
    if (inv.status === 'fulfilled') setInvoices(inv.value);
    setLoading(false);
    return sub.status === 'fulfilled' ? sub.value.entitlement : null;
  }, []);

  /** Access is granted by verified webhooks; after checkout we only watch for it to land. */
  const awaitActivation = useCallback(() => {
    setConfirming(true);
    setNotice({ tone: 'info', message: 'Payment received. Confirming with your payment provider…' });
    const started = Date.now();
    const tick = async () => {
      const ent = await loadAll().catch(() => null);
      if (ent?.subscription && PAID_ACCESS.includes(ent.subscription.status)) {
        setConfirming(false);
        setNotice({ tone: 'success', message: `You're on ${ent.display_name}. Your new limits are active.` });
        return;
      }
      if (Date.now() - started > CONFIRM_TIMEOUT_MS) {
        setConfirming(false);
        setNotice({
          tone: 'warning',
          message: "We haven't received confirmation yet. This can take a few minutes — refresh this page shortly. You won't be charged twice.",
        });
        return;
      }
      pollTimer.current = window.setTimeout(tick, CONFIRM_POLL_MS);
    };
    tick();
  }, [loadAll]);

  useEffect(() => {
    loadAll();
    if (searchParams.get('success') === 'true') {
      awaitActivation();
    } else if (searchParams.get('canceled') === 'true') {
      setNotice({ tone: 'info', message: 'Checkout canceled. Nothing was charged and your plan is unchanged.' });
    }
    if (searchParams.has('success') || searchParams.has('canceled')) {
      const next = new URLSearchParams(searchParams);
      next.delete('success');
      next.delete('canceled');
      next.delete('provider');
      setSearchParams(next, { replace: true });
    }
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscription = entitlement?.subscription || null;
  const hasPaidAccess = Boolean(subscription && PAID_ACCESS.includes(subscription.status));
  const isPastDue = subscription?.status === 'past_due';
  const blocksCheckout = Boolean(subscription && ['active', 'trialing', 'past_due'].includes(subscription.status));
  const yearlyOffered = Boolean(context?.plans.some((p) => p.id !== 'free' && p.prices.year.available));

  useEffect(() => {
    if (!yearlyOffered && billingInterval === 'year') setBillingInterval('month');
  }, [yearlyOffered, billingInterval]);

  const saveCountry = async (code: string, confirmConflict = false) => {
    if (!code) return;
    setCountryBusy(true);
    try {
      const res = await BillingService.confirmBillingCountry(code, confirmConflict);
      if (!res.ok) {
        if (res.conflict && window.confirm(`${res.message}\n\nUse ${res.conflict.confirmedCountry} as your billing country anyway?`)) {
          await saveCountry(code, true);
        } else {
          setNotice({ tone: 'warning', message: res.message });
        }
        return;
      }
      setContext(res.data.context);
      setEditingCountry(false);
      setNotice(null);
    } catch (err: any) {
      setNotice({ tone: 'error', message: err.message || 'Could not save your billing country.' });
    } finally {
      setCountryBusy(false);
    }
  };

  const startCheckout = async (plan: PlanOffer) => {
    if (plan.id === 'free') return;
    setCheckoutPlan(plan.id);
    setNotice(null);
    try {
      const checkout = await BillingService.createCheckout(plan.id, billingInterval);
      if (checkout.provider === 'razorpay') {
        if (!checkout.subscriptionId || !checkout.keyId) throw new Error('Razorpay checkout could not be started.');
        await openRazorpaySubscriptionCheckout({
          subscriptionId: checkout.subscriptionId,
          keyId: checkout.keyId,
          description: `${plan.display_name} plan`,
          prefill: { email: user?.email || undefined },
          theme: { color: '#7C3AED' },
          onPaymentSuccess: () => awaitActivation(),
          onError: (err) => setNotice({ tone: 'error', message: `${err.message} You have not been charged for a plan.` }),
          onDismiss: () => setNotice({ tone: 'info', message: 'Checkout closed. Nothing was charged.' }),
        });
      } else {
        if (!checkout.url) throw new Error('Paddle did not return a checkout link. Please try again.');
        window.location.assign(checkout.url);
      }
    } catch (err: any) {
      setNotice({ tone: 'error', message: err.message || 'Could not start checkout.' });
    } finally {
      setCheckoutPlan(null);
    }
  };

  const cancelPlan = async () => {
    if (!subscription) return;
    if (!window.confirm(`Cancel your ${entitlement?.display_name} plan? You keep access until ${formatDate(subscription.current_period_end)}.`)) return;
    setCancelBusy(true);
    try {
      await BillingService.cancelSubscription();
      await loadAll();
      setNotice({ tone: 'info', message: `Cancellation scheduled. Your plan stays active until ${formatDate(subscription.current_period_end)}.` });
    } catch (err: any) {
      setNotice({ tone: 'error', message: err.message || 'Could not cancel the subscription.' });
    } finally {
      setCancelBusy(false);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { url } = await BillingService.createPortal();
      window.location.assign(url);
    } catch (err: any) {
      setNotice({ tone: 'error', message: err.message || 'Could not open the billing portal.' });
      setPortalBusy(false);
    }
  };

  const usedPct = usage && !usage.is_unlimited && usage.limit_minutes > 0
    ? Math.min(100, Math.round((usage.total_used_minutes / usage.limit_minutes) * 100))
    : 0;
  const status = subscription ? STATUS_LABEL[subscription.status] || STATUS_LABEL.incomplete : null;
  const provider = subscription?.provider || context?.provider || null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-vc-text-primary">Billing</h1>
          <p className="mt-1 text-sm text-vc-text-secondary">Your plan, usage and payments in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscription?.provider === 'paddle' && (
            <Button variant="secondary" size="sm" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
              Manage payment & invoices
            </Button>
          )}
          {subscription && blocksCheckout && !subscription.cancel_at_period_end && (
            <Button variant="ghost" size="sm" onClick={cancelPlan} disabled={cancelBusy}>
              {cancelBusy && <Loader2 className="size-3.5 animate-spin" />}
              Cancel plan
            </Button>
          )}
        </div>
      </header>

      {notice && (
        <div role="status" aria-live="polite" className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm ${NOTICE_TONE[notice.tone]}`}>
          {confirming ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          ) : notice.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : notice.tone === 'info' ? (
            <Clock className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      {isPastDue && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Your last payment didn't go through.{' '}
            {subscription?.provider === 'paddle'
              ? 'Update your payment method in the billing portal to keep your plan.'
              : 'Razorpay will retry the charge automatically; make sure your UPI mandate or card is active.'}{' '}
            Access continues for a short grace period.
          </span>
        </div>
      )}

      {/* Overview */}
      <section className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-vc-surface1 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[12px] font-medium text-vc-text-secondary">Current plan</p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="text-2xl font-semibold tracking-tight text-vc-text-primary">{entitlement?.display_name || 'Free'}</span>
                {status && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>}
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[12px] text-vc-text-muted">Billing</dt>
                  <dd className="mt-0.5 text-vc-text-primary">
                    {subscription ? (subscription.billing_interval === 'year' ? 'Yearly' : 'Monthly') : 'Free forever'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-vc-text-muted">
                    {subscription?.cancel_at_period_end || subscription?.status === 'canceled' ? 'Access ends' : 'Renews'}
                  </dt>
                  <dd className="mt-0.5 text-vc-text-primary">{subscription ? formatDate(subscription.current_period_end) : '—'}</dd>
                </div>
              </dl>
              {subscription?.cancel_at_period_end && (
                <p className="mt-4 text-[12.5px] text-vc-text-secondary">
                  Canceled — you keep {entitlement?.display_name} until {formatDate(subscription.current_period_end)}, then move to Free.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-vc-surface1 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[12px] font-medium text-vc-text-secondary">Processing this month</p>
              {usage?.is_unlimited ? (
                <p className="mt-2 text-2xl font-semibold text-vc-text-primary">Unlimited</p>
              ) : usage ? (
                <>
                  <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-vc-text-primary">
                    {Math.round(usage.total_used_minutes)}
                    <span className="text-base font-medium text-vc-text-secondary"> / {usage.limit_minutes} min</span>
                  </p>
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]"
                    role="progressbar"
                    aria-valuenow={usedPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Minutes used"
                  >
                    <div className={`h-full rounded-full ${usedPct >= 90 ? 'bg-amber-400' : 'bg-violet-500'}`} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="mt-3 text-[12.5px] text-vc-text-secondary">
                    {Math.max(0, Math.round(usage.remaining_minutes))} min left · resets {formatDate(usage.reset_date)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-vc-text-secondary">Usage is unavailable right now.</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* Billing country & gateway */}
      <section className="rounded-2xl bg-vc-surface1 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {loading ? (
          <Skeleton className="h-10" />
        ) : contextError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-rose-300">{contextError}</span>
            <Button variant="secondary" size="sm" onClick={() => loadAll()}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        ) : context && (context.requiresCountry || editingCountry) ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-vc-text-primary">Where are you billed?</p>
              <p className="mt-1 text-[12.5px] text-vc-text-secondary">
                Choose the country on your payment method's billing address. It decides your currency and how you pay.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="billing-country">Billing country</label>
              <select
                id="billing-country"
                value={countryDraft}
                onChange={(e) => setCountryDraft(e.target.value)}
                className="h-10 w-full rounded-full bg-white/[0.05] px-4 text-sm text-vc-text-primary shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-violet-500/50 sm:max-w-xs"
              >
                <option value="">Select a country…</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <Button variant="primary" size="default" disabled={!countryDraft || countryBusy} onClick={() => saveCountry(countryDraft)}>
                {countryBusy && <Loader2 className="size-3.5 animate-spin" />}
                Save country
              </Button>
              {editingCountry && !context.requiresCountry && (
                <Button variant="ghost" size="default" onClick={() => { setEditingCountry(false); setCountryDraft(context.country || ''); }}>
                  Keep {context.countryName}
                </Button>
              )}
            </div>
          </div>
        ) : context ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 place-items-center rounded-xl bg-white/[0.06] text-vc-text-secondary">
                <Globe2 className="size-4" />
              </span>
              <div>
                <p className="text-sm text-vc-text-primary">
                  Billing country: <span className="font-semibold">{context.countryName}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-vc-text-secondary">
                  {context.provider ? GATEWAY_COPY[context.provider] : context.unsupportedReason}
                </p>
              </div>
            </div>
            {context.countryLocked ? (
              <span className="text-[12px] text-vc-text-muted">Locked while your subscription is active</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditingCountry(true)}>Change</Button>
            )}
          </div>
        ) : null}

        {context?.conflict && !editingCountry && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-amber-500/10 p-4 text-[13px] text-amber-200 sm:flex-row sm:items-center sm:justify-between">
            <span>
              You're billed in {context.countryName}, but you appear to be in {context.ipCountryName}. Confirm your billing country before
              checkout.
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => saveCountry(context.conflict!.confirmedCountry, true)} disabled={countryBusy}>
                Keep {context.countryName}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingCountry(true)}>Change</Button>
            </div>
          </div>
        )}
      </section>

      {/* Plans */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-vc-text-primary">Plans</h2>
            {context?.provider && <p className="mt-0.5 text-[12.5px] text-vc-text-secondary">{GATEWAY_COPY[context.provider]}</p>}
          </div>
          {yearlyOffered && (
            <div role="radiogroup" aria-label="Billing interval" className="flex gap-0.5 rounded-full bg-black/40 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]">
              {(['month', 'year'] as BillingInterval[]).map((iv) => (
                <button
                  key={iv}
                  type="button"
                  role="radio"
                  aria-checked={billingInterval === iv}
                  onClick={() => setBillingInterval(iv)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
                    billingInterval === iv ? 'bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-vc-text-muted hover:text-white'
                  }`}
                >
                  {iv === 'month' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
          </div>
        ) : !context || context.requiresCountry ? (
          <p className="rounded-2xl bg-vc-surface1 px-5 py-8 text-center text-sm text-vc-text-secondary">
            Choose your billing country above to see prices in your currency.
          </p>
        ) : !context.provider ? (
          <p className="rounded-2xl bg-vc-surface1 px-5 py-8 text-center text-sm text-vc-text-secondary">{context.unsupportedReason}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {context.plans.map((plan) => {
              const price = plan.prices[billingInterval];
              const isCurrent = entitlement?.plan_id === plan.id && (plan.id === 'free' ? !hasPaidAccess : hasPaidAccess);
              const busy = checkoutPlan === plan.id;
              let cta: React.ReactNode;
              if (isCurrent) {
                cta = <Button variant="secondary" className="w-full" disabled>Current plan</Button>;
              } else if (plan.id === 'free') {
                cta = <p className="text-center text-[12px] text-vc-text-muted">{hasPaidAccess ? 'Cancel your plan to return to Free' : 'Included'}</p>;
              } else if (blocksCheckout) {
                cta = (
                  <p className="text-center text-[12px] text-vc-text-muted">
                    {subscription?.provider === 'paddle' ? 'Switch plans from the billing portal' : 'Cancel your current plan to switch'}
                  </p>
                );
              } else if (!price.available || !context.providerReady) {
                cta = <Button variant="secondary" className="w-full" disabled>Not available yet</Button>;
              } else {
                cta = (
                  <Button variant="brand" className="w-full" onClick={() => startCheckout(plan)} disabled={Boolean(checkoutPlan) || confirming}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Upgrade to {plan.display_name}
                  </Button>
                );
              }
              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                    plan.is_recommended ? 'bg-violet-500/[0.08] ring-1 ring-violet-500/40' : 'bg-vc-surface1'
                  }`}
                >
                  {plan.is_recommended && (
                    <span className="absolute -top-2.5 left-6 rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-base font-semibold text-vc-text-primary">{plan.display_name}</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular-nums tracking-tight text-vc-text-primary">
                      {formatMoney(price.amount, price.currency)}
                    </span>
                    <span className="text-sm text-vc-text-secondary">/{billingInterval === 'year' ? 'yr' : 'mo'}</span>
                  </p>
                  <p className="mt-1 text-[12.5px] text-vc-text-secondary">{plan.monthly_minutes.toLocaleString()} source minutes / month</p>
                  <ul className="mt-5 flex-1 space-y-2 text-[13px] text-vc-text-secondary">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">{cta}</div>
                </article>
              );
            })}
          </div>
        )}
        {context?.provider && !context.providerReady && !loading && (
          <p className="text-[12.5px] text-amber-200/80">
            Checkout through {context.provider === 'razorpay' ? 'Razorpay' : 'Paddle'} isn't configured on this server yet.
          </p>
        )}
      </section>

      {/* Payment history */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-vc-text-primary">Payment history</h2>
        {loading ? (
          <Skeleton className="h-24" />
        ) : invoices.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-vc-surface1 px-5 py-6 text-sm text-vc-text-secondary">
            <Receipt className="size-4 text-vc-text-muted" /> No payments yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-vc-surface1">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[12px] text-vc-text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Paid via</th>
                  <th className="px-5 py-3 font-medium sr-only">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 text-vc-text-primary">{formatDate(inv.created_at)}</td>
                    <td className="px-5 py-3 tabular-nums text-vc-text-primary">
                      {formatMoney(inv.status === 'paid' ? inv.amount_paid : inv.amount_due, inv.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inv.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {inv.status === 'paid' ? 'Paid' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-vc-text-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <CreditCard className="size-3.5" />
                        {inv.provider === 'razorpay' ? 'Razorpay' : inv.provider === 'paddle' ? 'Paddle' : 'Card'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {inv.hosted_invoice_url && (
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-violet-300 hover:text-violet-200">
                          Receipt <ExternalLink className="size-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {provider && (
        <p className="text-[12px] text-vc-text-muted">
          Questions about a charge? Payments are handled by {provider === 'razorpay' ? 'Razorpay' : 'Paddle'}.{' '}
          <Link to="/support" className="text-violet-300 hover:text-violet-200">Contact support</Link> and we'll sort it out.
        </p>
      )}
    </div>
  );
};
