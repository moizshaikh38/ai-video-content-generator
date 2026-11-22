import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  ChevronDown,
  Check,

  Sparkles,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { apiBase } from "../services/backendClient";
import { TransformationVisual } from "../components/landing/ProductVisuals";
import { plans } from "../data/marketing";
import { useLandingMotion } from "../components/landing/useLandingMotion";
import { Reveal } from "../lib/motion";
import { LandingHero } from "../components/landing/LandingHero";
import { CombinedWorkflowShowcase } from "../components/landing/CombinedWorkflowShowcase";
import { CurrencyProvider } from "../context/CurrencyContext";
import { getMarketingPlanRate } from "../utils/pricingUtils";
import "./landing.css";
import "./landing-motion.css";
import "./landing-foundation.css";

const faqs = [
  {
    q: "How does VireoClip differ from generic AI video clippers?",
    a: "Unlike tools that slice fixed 30-second segments, VireoClip analyzes the full recording to find standout moments, removes dead air, reframes speakers into vertical 9:16, and generates word-by-word captions. Detection quality and timing precision are still being validated on real uploads, so we do not quote accuracy figures yet.",
  },
  {
    q: "Can I edit the clips inside a browser timeline before publishing?",
    a: "VireoClip includes a browser-based studio for refining generated clips, including crop, caption, and branding adjustments before export. The editor is in active development, so its exact feature set may change before release.",
  },
  {
    q: "Which platforms and video formats are supported?",
    a: "You can upload MP4, MOV, WEBM, or paste direct YouTube, Loom, and Google Drive links up to 2 GB. VireoClip formats clips and platform-specific content kits for YouTube Shorts, TikTok, Instagram Reels, LinkedIn, and X.",
  },
  // FAQ entries for Brand Brain and the A/B Testing Studio were removed 2026-11-22:
  // both asserted working automation and performance comparisons that are not yet
  // verified against the live backend. Reinstate only after backend-owner verification.
];

const Label = ({ children }: { children: React.ReactNode }) => (
  <Reveal variant="fade" as="span" className="lv-section-label inline-block">{children}</Reveal>
);



function Pricing() {
  const waitlistMode = import.meta.env.VITE_WAITLIST_ENABLED === 'true';
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-[#000000]">
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 lv-reveal">
          <Label>TRANSPARENT PLANS</Label>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-3 mb-4">
            Simple, Transparent <br />
            <em className="text-[#bba9e8] not-italic">Creator Pricing.</em>
          </h2>
          <p className="text-base text-slate-300">
            Get started for free with 15 processing minutes. Upgrade as your production grows.
          </p>
        </div>

        {/* Cadence & Currency Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <div className="inline-flex items-center p-1 rounded-full bg-[#090C16]">
            <button
              type="button"
              onClick={() => setBillingInterval('month')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                billingInterval === 'month' ? 'bg-[#8753e3] text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('year')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingInterval === 'year'
                  ? 'bg-[#8753e3] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-mono bg-[#20E3A2]/20 text-[#20E3A2] px-1.5 py-0.2 rounded">
                Save 50%
              </span>
            </button>
          </div>

        </div>

        {/* Pricing Cards Grid */}
        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-7xl lv-reveal-group overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-auto md:px-0 pb-4 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {plans.map((plan) => {
            const planId = plan.name.toLowerCase() as 'free' | 'creator' | 'pro' | 'studio';
            const rate = getMarketingPlanRate(planId, billingInterval, 'USD');
            const isFeatured = plan.name === 'Pro';

            return (
              <div
                key={plan.name}
                className={`rounded-3xl p-6 flex flex-col justify-between transition-all relative shrink-0 w-[85%] sm:w-[70%] md:w-auto snap-center md:snap-align-none ${
                  isFeatured
                    ? 'bg-gradient-to-b from-[#111424] to-[#080B15] shadow-[0_0_40px_rgba(139,92,246,0.25)] md:scale-[1.02]'
                    : 'bg-[#080B14] hover:bg-[#0D1120]'
                }`}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-[#6734c9] to-[#8753e3] text-[10px] font-mono font-bold text-white uppercase tracking-wider shadow-md">
                    Most Popular
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    {plan.badge && !isFeatured && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-slate-300">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-extrabold text-white">
                      {rate.symbol}{rate.amount}
                    </span>
                    <span className="text-xs text-slate-400 ml-1.5">{rate.periodText}</span>
                    {rate.billedNote && (
                      <span className="block mt-1 text-[11px] text-slate-400">{rate.billedNote}</span>
                    )}
                    {rate.savingsBadge && (
                      <span className="block mt-1.5 text-[10px] font-mono text-[#20E3A2]">{rate.savingsBadge}</span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">{plan.description}</p>

                  <ul className="space-y-2.5 mb-8 text-xs text-slate-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check size={14} className="text-[#20E3A2] shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <Link
                    to={waitlistMode ? '/#waitlist' : '/signup'}
                    onClick={waitlistMode ? event => {
                      event.preventDefault();
                      document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' });
                    } : undefined}
                    className={`w-full py-3.5 sm:py-2.5 px-4 rounded-full text-xs font-bold text-center block transition-all ${
                      isFeatured
                        ? 'bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 text-white shadow-lg'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white'
                    }`}
                  >
                    {waitlistMode ? 'Join waitlist' : (plan.name === 'Free' ? 'Start Free' : 'Choose Plan')}
                  </Link>
                  <p className="mt-3 text-[10px] text-slate-500 text-center leading-relaxed">{plan.statusNote}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="py-20 lg:py-28 bg-[#000000]">
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4 lv-reveal-left">
            <Label>FREQUENTLY ASKED QUESTIONS</Label>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Good to Know <br />
              <em className="text-[#bba9e8] not-italic">Before You Begin.</em>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Have questions about formats, exports, or the editor? We've got you covered.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-3 lv-reveal-right">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-2xl bg-[#080B14] overflow-hidden transition-colors shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4"
                  >
                    <span className="text-sm font-semibold text-white">{faq.q}</span>
                    <ChevronDown
                      size={18}
                      className={`text-[#bba9e8] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/[0.04]">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Waitlist() {
  const enabled = import.meta.env.VITE_WAITLIST_ENABLED === 'true';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'joined' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled || state === 'submitting') return;
    setState('submitting');
    setErrorText('');
    try {
      const res = await fetch(`${apiBase}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, source: 'landing' }),
      });
      const body = await res.json().catch(() => null);
      // Only validation copy is user-meaningful; never surface raw server/fixture detail.
      if (!res.ok) throw new Error(body?.code === 'WAITLIST_EMAIL_INVALID' ? 'Enter a valid email address.' : 'Could not join right now. Please try again.');
      // Strict success contract: any 2xx without the exact JSON status (static
      // fallback HTML, malformed or unknown body) is a failure, never a join.
      if (body?.status !== 'joined') throw new Error('Could not join right now. Please try again.');
      setState('joined');
    } catch (err) {
      setState('error');
      setErrorText(err instanceof Error ? err.message : 'Could not join right now. Please try again.');
    }
  }

  return (
    <section id="waitlist" style={{ scrollMarginTop: '96px' }} className="py-20 lg:py-24 bg-[#000000] relative overflow-hidden">
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-5">
        <Reveal variant="up">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
            Join the waitlist
          </h2>
        </Reveal>
        <Reveal variant="up" delay={120}>
          <p className="text-sm text-slate-300 leading-relaxed">
            Leave your email and we will tell you when VireoClip access opens.
          </p>
        </Reveal>
        {state === 'joined' ? (
          <p className="text-sm font-semibold text-[#20E3A2]">You're on the list. We'll email you when access opens.</p>
        ) : (
          <Reveal variant="up" delay={200}>
            <form onSubmit={submit} className="flex flex-col sm:flex-row items-stretch justify-center gap-3">
              <input
                type="email"
                required
                disabled={!enabled}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="flex-1 px-4 py-3 rounded-full bg-white/[0.06] text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#8753e3]"
              />
              <button
                type="submit"
                disabled={!enabled || state === 'submitting'}
                className="px-6 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition disabled:opacity-60"
              >
                {state === 'submitting' ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>
            {state === 'error' && <p className="mt-3 text-xs text-red-400">{errorText}</p>}
          </Reveal>
        )}
        {!enabled && <p role="status" className="text-xs text-slate-400">Preview only. Waitlist signup is not connected yet, and no email is collected here.</p>}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          By joining you agree to receive waitlist and launch emails from VireoClip. No spam.
        </p>
      </div>
    </section>
  );
}

function FinalCTA() {
  const waitlistMode = import.meta.env.VITE_WAITLIST_ENABLED === 'true';
  return (
    <section className="py-24 lg:py-32 bg-[#000000] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-gradient-to-r from-[#6734c9]/20 via-[#8753e3]/20 to-[#20E3A2]/10 blur-[130px] rounded-full pointer-events-none -z-0" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-6 lv-reveal-group">
        <div className="flex justify-center">
          <Logo light size="md" />
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04]">
          <Sparkles className="w-3.5 h-3.5 text-[#bba9e8]" />
          <span className="text-xs font-mono font-bold tracking-wider text-[#bba9e8] uppercase">
            One Recording • Every Social Platform
          </span>
        </div>
        <Reveal variant="up">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
            Your Next Long-Form Video is Already <br />
            <span className="bg-gradient-to-r from-[#bba9e8] via-white to-[#20E3A2] bg-clip-text text-transparent">
              A Complete Library of Viral Content.
            </span>
          </h2>
        </Reveal>
        <Reveal variant="up" delay={140}>
          <p className="max-w-xl mx-auto text-base text-slate-300 leading-relaxed">
            Start turning interviews, podcasts, and recordings into vertical shorts ready for every platform.
          </p>
        </Reveal>
        <Reveal variant="up" delay={260}>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
          {waitlistMode ? (
            <a
              href="#waitlist"
              className="mv-glow w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <span>Get Free Clips Now</span>
              <ArrowRight size={16} />
            </a>
          ) : (
            <Link
              to="/signup"
              className="mv-glow w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <span>Get Free Clips Now</span>
              <ArrowRight size={16} />
            </Link>
          )}
          <a
            href="#major-features"
            className="w-full sm:w-auto px-6 py-3.5 rounded-full text-sm font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition"
          >
            Explore Features
          </a>
        </div>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingPage() {
  const pageRef = useRef<HTMLElement>(null);
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  useLandingMotion(pageRef);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const navEntries = performance.getEntriesByType('navigation');
    const isReload =
      navEntries.length > 0
        ? (navEntries[0] as PerformanceNavigationTiming).type === 'reload'
        : (performance as any).navigation?.type === 1;

    if (isReload) {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }

    const hash = window.location.hash.replace('#', '');
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }

    const slideIds = ['clipping', 'captions', 'reframe', 'broll', 'audio', 'voice'];
    if (slideIds.includes(hash)) {
      window.dispatchEvent(new CustomEvent('vireo:goto-slide', { detail: { slideId: hash } }));
      const sc = document.getElementById('showcase') || document.querySelector('.vireo-showcase');
      sc?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const el = document.getElementById(hash);
      if (el) {
        const navbarOffset = 80;
        const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const el = document.getElementById(hash);
        if (el) {
          const navbarOffset = 80;
          const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <CurrencyProvider>
      <main className="lv-page" ref={pageRef}>
        {/* HERO SECTION IS UNTOUCHED AND PRISTINE */}
        <LandingHero />
        {/* ProofStrip stat band removed 2026-11-22: stats (1.2M+ clips, 60s turnaround, 98% caption accuracy) were unverified placeholder numbers. Re-add only with measured figures. */}

        {/* ONE combined source-journey animation (user 12:34: "Bas ek hi rakhenge animation dono nhi") */}
        <CombinedWorkflowShowcase />

        {/* CLEAN BORDERLESS TRANSFORMATION FLOW */}
        <section className="lv-transformation">
          <div className="lv-container">
            <div className="lv-transformation-heading lv-reveal">
              <Label>THE TRANSFORMATION</Label>
              <h2>
                One upload.
                <br />
                <em>Every platform covered.</em>
              </h2>
            </div>
            <TransformationVisual />
          </div>
        </section>

        {/* INTERACTIVE BEFORE & AFTER SLIDER — removed per user request (23:26): the
            SIDE-BY-SIDE TRANSFORMATION section is out of the candidate. Component kept
            unused below; do not re-add without explicit approval. */}

        {/* TRANSPARENT PRICING */}
        <Pricing />

        {/* ENHANCED FAQ ACCORDION */}
        <FAQ />

        {/* WAITLIST CAPTURE (real, stored server-side) */}
        <Waitlist />

        {/* CINEMATIC FINAL CTA */}
        <FinalCTA />
      </main>
    </CurrencyProvider>
  );
}

export default LandingPage;
