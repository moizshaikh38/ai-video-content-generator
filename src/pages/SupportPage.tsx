import React from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '../lib/motion';
import { SupportChatWidget } from '../components/support/SupportChatWidget';
import {
  ArrowLeft,
  Sparkles,
  Mail,
  BookOpen,
  LifeBuoy,
} from 'lucide-react';

/**
 * Vira — VireoClip AI support assistant. Grounded product Q&A via
 * POST /api/support/chat; stateless client-side history; explicit human
 * escalation path. Reduced-motion friendly.
 */

/** Full support page (public route /support). */
export const SupportPage: React.FC = () => {
  const quickLinks = [
    { to: '/projects/new', icon: Sparkles, title: 'Create clips', desc: 'Paste a link or upload a video to start.' },
    { to: '/billing', icon: LifeBuoy, title: 'Billing & plans', desc: 'Manage your plan, country, and payment method.' },
    { to: '/privacy', icon: BookOpen, title: 'Privacy policy', desc: 'How your data and media are handled.' },
  ];

  const faqs = [
    {
      q: 'Which videos can I clip?',
      a: 'Paste a public YouTube link (watch, Shorts, youtu.be) or upload MP4/MOV/WEBM/MKV up to 2 GB and 2 hours. The server verifies the link before any download starts.',
    },
    {
      q: 'How are processing minutes counted?',
      a: 'Minutes are charged for the transcribed audio duration of each video. The estimate is reserved when processing starts and settled with the measured duration — failed jobs release the reservation automatically.',
    },
    {
      q: 'Which payment provider will I get?',
      a: 'Billing country India pays via Razorpay in INR. Other supported countries pay via Paddle in USD. Your country is confirmed in Billing → Country, and an active subscription locks its provider.',
    },
    {
      q: 'The AI gave a wrong answer or clipped the wrong moment — what do I do?',
      a: 'Every clip is editable: re-run analysis with tuned genre/keyword settings, adjust boundaries in the editor, or remove fillers. AI output is a draft — you always have the final cut.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f1] text-[#1a2e22]">
      {/* Header band */}
      <header className="relative overflow-hidden bg-[#0d1f15] text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#36764c]/25 blur-[100px] pointer-events-none" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#20E3A2]/10 blur-[90px] pointer-events-none mv-float-slow" aria-hidden="true" />
        <div className="max-w-5xl mx-auto px-5 lg:px-8 pt-10 pb-14 relative">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white mb-8 transition-colors">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to VireoClip home
          </Link>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#8fd6a8]">
            <LifeBuoy size={14} aria-hidden="true" />
            Help Center
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-3">
            Support
          </h1>
          <p className="mt-3 text-sm text-white/60 max-w-2xl leading-relaxed">
            Ask Vira, our AI assistant, anything about clipping, captions, billing, or the editor — or reach a human anytime.
          </p>
          <button
            type="button"
            onClick={() => {
              document.getElementById('vira-open-hint')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              document.querySelector<HTMLButtonElement>('[aria-label="Open AI support chat"]')?.click();
            }}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#183d2d] text-sm font-bold hover:bg-[#e8f0e6] transition-colors"
          >
            <Sparkles size={16} aria-hidden="true" />
            Chat with Vira now
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 lg:px-8 py-12 space-y-12">
        {/* Quick links */}
        <Reveal variant="fade" as="section" className="grid sm:grid-cols-3 gap-4" aria-label="Quick links">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="mv-lift group rounded-2xl border border-[#dfe7da] bg-white p-5 hover:border-[#36764c]/40 transition-colors"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#36764c]/10 text-[#36764c] group-hover:bg-[#36764c] group-hover:text-white transition-colors">
                <l.icon size={18} aria-hidden="true" />
              </span>
              <p className="mt-3 font-bold text-sm">{l.title}</p>
              <p className="mt-1 text-xs text-[#5c6e60] leading-relaxed">{l.desc}</p>
            </Link>
          ))}
        </Reveal>

        {/* Chat hint */}
        <section id="vira-open-hint" className="rounded-3xl border border-[#dfe7da] bg-white p-6 sm:p-8 scroll-mt-16">
          <div className="flex items-start gap-4">
            <span className="hidden sm:grid size-12 place-items-center rounded-2xl bg-[#183d2d] text-white shrink-0">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold">Vira knows VireoClip inside out</h2>
              <p className="mt-1.5 text-sm text-[#5c6e60] leading-relaxed max-w-2xl">
                Ask about supported formats, the editor, caption styles, minutes, or billing — Vira answers
                instantly from the product itself. For anything involving your account (refunds, deletion,
                plan disputes), Vira hands you off to a human at{' '}
                <a className="font-semibold text-[#36764c] underline" href="mailto:vertexdigitals07@gmail.com">
                  vertexdigitals07@gmail.com
                </a>
                .
              </p>
              <p className="mt-2 text-[11px] text-[#8aa192]">
                Tap “Ask Vira AI” in the bottom-right corner to start.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-label="Frequent questions" className="space-y-3">
          <h2 className="text-lg font-bold">Frequent questions</h2>
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-[#dfe7da] bg-white px-5 py-4 open:shadow-sm"
            >
              <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between gap-3">
                {f.q}
                <span className="text-[#36764c] group-open:rotate-45 transition-transform text-lg leading-none">+</span>
              </summary>
              <p className="mt-2.5 text-[13px] text-[#5c6e60] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </section>

        {/* Human contact */}
        <section className="rounded-3xl border border-[#dfe7da] bg-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Mail size={18} className="text-[#36764c]" aria-hidden="true" />
              Talk to a human
            </h2>
            <p className="mt-1.5 text-sm text-[#5c6e60] max-w-xl leading-relaxed">
              Account actions, refunds, data requests, or a bug with details (browser + steps) — email us and
              we'll get back to you.
            </p>
          </div>
          <a
            href="mailto:vertexdigitals07@gmail.com?subject=VireoClip%20Support%20Request"
            className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#183d2d] text-white text-sm font-bold hover:bg-[#22543a] transition-colors mv-lift"
          >
            <Mail size={15} aria-hidden="true" />
            Email support
          </a>
        </section>
      </div>

      <SupportChatWidget />
    </div>
  );
};

