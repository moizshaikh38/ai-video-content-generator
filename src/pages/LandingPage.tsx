import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Check,
  TrendingUp,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { TransformationVisual } from "../components/landing/ProductVisuals";
import { platformOutputs } from "../data/platforms";
import { plans } from "../data/marketing";
import { useLandingMotion } from "../components/landing/useLandingMotion";
import { LandingHero } from "../components/landing/LandingHero";
import { TiltedStreamShowcase } from "../components/landing/TiltedStreamShowcase";
import { ExploreMajorFeatures } from "../components/landing/ExploreMajorFeatures";
import { useCurrency, CurrencyProvider } from "../context/CurrencyContext";
import { CurrencyToggle } from "../components/CurrencyToggle";
import { getMarketingPlanRate } from "../utils/pricingUtils";
import "./landing.css";
import "./landing-motion.css";
import "./landing-foundation.css";

const faqs = [
  {
    q: "How does VireoClip differ from generic AI video clippers?",
    a: "Unlike tools that merely slice fixed 30-second segments, VireoClip uses multimodal acoustic, emotional, and facial tracking. It analyzes sentiment inflection points, removes dead pauses with sub-frame accuracy, frames speakers smoothly in 9:16 with Bézier camera easing, and generates word-level SubStation Alpha (ASS) kinetic captions.",
  },
  {
    q: "Can I edit the clips inside a browser timeline before publishing?",
    a: "Yes! VireoClip features a full multi-track studio timeline editor right in your browser. You can adjust video crop handles, drop in AI B-roll overlays, customize subtitle presets (Hormozi, Neon, Beast), tweak audio ducking levels, and add custom brand watermarks.",
  },
  {
    q: "Which platforms and video formats are supported?",
    a: "You can upload MP4, MOV, WEBM, or paste direct YouTube, Loom, and Google Drive links up to 2 GB. VireoClip formats clips and platform-specific content kits for YouTube Shorts, TikTok, Instagram Reels, LinkedIn, and X.",
  },
  {
    q: "What is Brand Brain and how does it maintain consistency?",
    a: "Brand Brain allows you to save custom brand color palettes, font pairings, logo watermarks, and brand voice guidelines once. Every clip and social kit generated automatically applies your saved assets, ensuring 100% brand compliance across client accounts or multiple channels.",
  },
  {
    q: "How does the A/B Testing Studio work?",
    a: "Our A/B Testing Studio generates variant hooks, titles, and thumbnail combinations. As your clips generate views and clicks, our engine runs two-proportion Z-score statistical tests to highlight which variant drives statistically significant higher retention.",
  },
];

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="lv-section-label">{children}</span>
);

function PlatformStrip() {
  const channelDetails = [
    { name: "YouTube Shorts", format: "9:16 Vertical • Viral SEO", logo: platformOutputs[0]?.logo },
    { name: "TikTok", format: "9:16 High Pacing • Fast Cuts", logo: platformOutputs[1]?.logo },
    { name: "Instagram Reels", format: "9:16 Aesthetic • Curated Hooks", logo: platformOutputs[2]?.logo },
    { name: "LinkedIn", format: "Square / Summary • Thought Leadership", logo: platformOutputs[3]?.logo },
    { name: "X (Twitter)", format: "Viral Snippet • Thread Format", logo: platformOutputs[4]?.logo },
  ];

  return (
    <section className="py-16 lg:py-20 bg-[#000000]" aria-label="Supported content platforms">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] mb-3">
            <span className="w-2 h-2 rounded-full bg-[#20E3A2] animate-ping" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#bba9e8] uppercase">
              Omnichannel Content Kits
            </span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
            Repurposed for the Algorithms{" "}
            <span className="text-[#bba9e8]">Where Your Audience Spends Hours Daily</span>
          </h3>
          <p className="text-sm text-slate-400 mt-2">
            Every clip is automatically calibrated with native pacing, aspect ratio, captions, and copy for each target platform.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {channelDetails.map((channel) => (
            <div
              key={channel.name}
              className="p-4 rounded-2xl bg-[#080B14]/80 hover:bg-[#0E1222] transition-all shadow-lg flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-xl bg-white/[0.04] flex items-center justify-center p-1.5">
                  <img src={channel.logo} alt="" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#20E3A2]" />
              </div>
              <div>
                <strong className="text-xs font-bold text-white block mb-0.5 group-hover:text-[#bba9e8] transition-colors truncate">
                  {channel.name}
                </strong>
                <small className="text-[10px] text-slate-400 leading-tight block">
                  {channel.format}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() {
  const [activeMode, setActiveMode] = useState<'after' | 'before'>('after');

  return (
    <section className="py-20 lg:py-28 bg-[#000000]">
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Label>SIDE-BY-SIDE TRANSFORMATION</Label>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-3 mb-4">
            See the Quality Difference <br />
            <em className="text-[#bba9e8] not-italic">In Real-Time.</em>
          </h2>
          <p className="text-base text-slate-300">
            Toggle between raw unprocessed camera footage and VireoClip's studio-polished short-form highlight.
          </p>

          {/* Mode Switcher */}
          <div className="inline-flex items-center p-1 rounded-full bg-[#090C16] mt-6 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveMode('after')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                activeMode === 'after'
                  ? 'bg-gradient-to-r from-[#6734c9] to-[#8753e3] text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={14} className={activeMode === 'after' ? 'text-white' : 'text-[#bba9e8]'} />
              <span>Vireo AI Viral Short (Engine Active)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('before')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                activeMode === 'before'
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Raw 16:9 Footage (Uncut)</span>
            </button>
          </div>
        </div>

        {/* Live Comparison Box (Clean borderless obsidian card) */}
        <div className="max-w-4xl mx-auto bg-[#070A14] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {activeMode === 'after' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 flex justify-center">
                <div className="w-[260px] h-[400px] rounded-[28px] bg-black shadow-[0_0_35px_rgba(139,92,246,0.25)] relative overflow-hidden flex flex-col justify-between p-3">
                  <img
                    src="https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=500&q=80"
                    alt="After preview"
                    className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full">
                      9:16 Active Speaker Focus
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#20E3A2]/20 text-[#20E3A2] text-[10px] font-mono font-bold">
                      Score: 98
                    </span>
                  </div>

                  <div className="relative z-10 text-center px-2">
                    <div className="text-xl font-black text-white uppercase drop-shadow-md">
                      THE REAL SECRET
                    </div>
                    <div className="text-2xl font-black text-[#FFE600] uppercase drop-shadow-lg scale-105 inline-block">
                      TO VIRAL REACH
                    </div>
                  </div>

                  <div className="relative z-10 text-[9px] font-mono text-[#20E3A2] text-center bg-black/70 py-1 rounded-lg">
                    Auto-Ducking Active (-14dB) • SubStation ASS
                  </div>
                </div>
              </div>

              <div className="md:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#20E3A2]/10 text-[#20E3A2] text-xs font-semibold">
                  <TrendingUp size={14} />
                  <span>High-Retention Optimization Applied</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Engineered for <span className="text-[#bba9e8]">98% Hook Retention</span>
                </h3>
                <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <Check size={16} className="text-[#20E3A2] shrink-0" />
                    <span>Dynamic 9:16 vertical face tracking with smooth Bézier camera easing</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={16} className="text-[#20E3A2] shrink-0" />
                    <span>Word-by-word kinetic karaoke captions with pop color emphasis</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={16} className="text-[#20E3A2] shrink-0" />
                    <span>Dead pauses and awkward filler words automatically removed</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={16} className="text-[#20E3A2] shrink-0" />
                    <span>Intelligent audio ducking ensures vocals remain crisp over background beats</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 flex justify-center">
                <div className="w-[300px] aspect-video rounded-xl bg-black relative overflow-hidden flex flex-col justify-between p-3 opacity-75">
                  <img
                    src="https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=500&q=80"
                    alt="Before preview"
                    className="absolute inset-0 w-full h-full object-cover filter brightness-50"
                  />
                  <span className="relative z-10 text-[10px] font-mono text-red-400 bg-black/80 px-2 py-0.5 rounded self-start">
                    16:9 Landscape (Uncut)
                  </span>
                  <div className="relative z-10 text-center text-xs text-slate-400">
                    [No Subtitles • 4s Dead Pause Detected]
                  </div>
                  <span className="relative z-10 text-[9px] font-mono text-slate-500 text-center">
                    Flat Unmastered Audio Track
                  </span>
                </div>
              </div>

              <div className="md:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-semibold">
                  <XCircle size={14} />
                  <span>High Drop-Off Risk Detected</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Why Raw Video <span className="text-red-400">Loses 80% of Viewers</span>
                </h3>
                <ul className="space-y-2.5 text-xs sm:text-sm text-slate-400">
                  <li className="flex items-center gap-2.5">
                    <XCircle size={16} className="text-red-400 shrink-0" />
                    <span>Horizontal format leaves black letterboxes on mobile screens</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <XCircle size={16} className="text-red-400 shrink-0" />
                    <span>Muted viewers swipe away within 2 seconds without animated subtitles</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <XCircle size={16} className="text-red-400 shrink-0" />
                    <span>Uncut pauses and rambling introductions destroy retention velocity</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      title: "Podcasters & Talk Shows",
      metric: "12+ Shorts / Ep",
      desc: "Transform long conversational recordings into high-converting highlight reels without scrubbing hours of video.",
    },
    {
      title: "YouTube & Content Creators",
      metric: "10x Faster Output",
      desc: "Repurpose past long-form videos into daily YouTube Shorts, TikToks, and Instagram Reels to capture new subscribers.",
    },
    {
      title: "Agencies & Media Networks",
      metric: "Multi-Client Kits",
      desc: "Manage high-volume client deliveries with dedicated workspaces, centralized brand kits, and automated publishing.",
    },
    {
      title: "Founders & Thought Leaders",
      metric: "5-Platform Kits",
      desc: "Turn keynotes and podcast appearances into high-authority LinkedIn posts, X threads, and vertical video clips.",
    },
  ];

  return (
    <section id="use-cases" className="py-20 lg:py-28 bg-[#000000]">
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Label>BUILT FOR SPEED & SCALE</Label>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-3 mb-4">
            Spend More Time Creating. <br />
            <em className="text-[#bba9e8] not-italic">Zero Time Repurposing.</em>
          </h2>
          <p className="text-base text-slate-300">
            Tailored workflows for creators, production houses, and fast-moving social teams.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl bg-[#080B14] p-6 hover:bg-[#0D1120] transition-all flex flex-col justify-between shadow-xl"
            >
              <div>
                <span className="inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#8753e3]/20 text-[#c4b5fd] mb-3">
                  {item.metric}
                </span>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between text-xs text-[#bba9e8]">
                <span>Automated Workflow</span>
                <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Paste URL or Upload",
      text: "Paste a YouTube, Loom, or Drive link, or drop any raw 4K video file up to 2 GB.",
    },
    {
      number: "02",
      title: "AI Finds Viral Hooks",
      text: "Neural models scan audio velocity, emotional spikes, and dialogue to rank top moments.",
    },
    {
      number: "03",
      title: "Auto-Reframe & Captions",
      text: "Speakers are centered in 9:16 with dynamic word-by-word karaoke captions.",
    },
    {
      number: "04",
      title: "Publish to 5 Channels",
      text: "Queue posts directly to TikTok, Shorts, Reels, and X with auto-generated copy.",
    },
  ];

  return (
    <section id="how" className="py-20 lg:py-28 bg-[#000000] relative">
      <div id="resources" className="absolute -top-24 left-0 pointer-events-none" aria-hidden="true" />
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Label>4-STEP ARCHITECTURE</Label>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-3 mb-4">
            From Raw Video to <br />
            <em className="text-[#bba9e8] not-italic">Everywhere in Minutes.</em>
          </h2>
          <p className="text-base text-slate-300">
            A frictionless pipeline engineered to deliver ready-to-publish vertical clips with zero friction.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl bg-[#080B14] p-6 hover:bg-[#0D1120] transition-all flex flex-col justify-between relative group shadow-xl"
            >
              <div>
                <span className="text-3xl font-black text-[#8753e3]/40 group-hover:text-[#bba9e8] transition-colors block mb-2 font-mono">
                  {step.number}
                </span>
                <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { currency } = useCurrency();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-[#000000]">
      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
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
              onClick={() => {
                if (currency !== 'INR') setBillingInterval('year');
              }}
              disabled={currency === 'INR'}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingInterval === 'year'
                  ? 'bg-[#8753e3] text-white shadow-md'
                  : currency === 'INR'
                  ? 'opacity-40 cursor-not-allowed text-slate-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-mono bg-[#20E3A2]/20 text-[#20E3A2] px-1.5 py-0.2 rounded">
                Save ~17%
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#090C16] px-3.5 py-1.5 rounded-full">
            <span className="text-xs text-slate-400">Currency:</span>
            <CurrencyToggle size="sm" />
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => {
            const planId = plan.name.toLowerCase() as 'free' | 'creator' | 'pro' | 'studio';
            const rate = getMarketingPlanRate(planId, billingInterval, currency);
            const isFeatured = plan.name === 'Pro';

            return (
              <div
                key={plan.name}
                className={`rounded-3xl p-6 flex flex-col justify-between transition-all relative ${
                  isFeatured
                    ? 'bg-gradient-to-b from-[#111424] to-[#080B15] shadow-[0_0_40px_rgba(139,92,246,0.25)] scale-[1.02]'
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
                    to="/signup"
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-bold text-center block transition-all ${
                      isFeatured
                        ? 'bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 text-white shadow-lg'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white'
                    }`}
                  >
                    {plan.name === 'Free' ? 'Start Free' : 'Choose Plan'}
                  </Link>
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
          <div className="lg:col-span-5 space-y-4">
            <Label>FREQUENTLY ASKED QUESTIONS</Label>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Good to Know <br />
              <em className="text-[#bba9e8] not-italic">Before You Begin.</em>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Have questions about audio models, video quality, rendering limits, or client workspaces? We've got you covered.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-3">
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

function FinalCTA() {
  return (
    <section className="py-24 lg:py-32 bg-[#000000] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-gradient-to-r from-[#6734c9]/20 via-[#8753e3]/20 to-[#20E3A2]/10 blur-[130px] rounded-full pointer-events-none -z-0" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-6">
        <div className="flex justify-center">
          <Logo light size="md" />
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04]">
          <Sparkles className="w-3.5 h-3.5 text-[#bba9e8]" />
          <span className="text-xs font-mono font-bold tracking-wider text-[#bba9e8] uppercase">
            One Recording • Every Social Platform
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
          Your Next Long-Form Video is Already <br />
          <span className="bg-gradient-to-r from-[#bba9e8] via-white to-[#20E3A2] bg-clip-text text-transparent">
            A Complete Library of Viral Content.
          </span>
        </h2>
        <p className="max-w-xl mx-auto text-base text-slate-300 leading-relaxed">
          Start turning interviews, podcasts, and recordings into high-converting vertical shorts in under 60 seconds.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition shadow-[0_0_30px_rgba(139,92,246,0.35)] flex items-center justify-center gap-2"
          >
            <span>Get Free Clips Now</span>
            <ArrowRight size={16} />
          </Link>
          <a
            href="#major-features"
            className="w-full sm:w-auto px-6 py-3.5 rounded-full text-sm font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition"
          >
            Explore Features
          </a>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const pageRef = useRef<HTMLElement>(null);
  useLandingMotion(pageRef);

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

        {/* CYLINDRICAL STREAM SHOWCASE (NO BOX, NO CARD BORDER) */}
        <TiltedStreamShowcase />

        {/* 100X BETTER INTERACTIVE MAJOR FEATURES STUDIO */}
        <ExploreMajorFeatures id="major-features" />

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

        {/* 100X BETTER REFINED PLATFORM PROOF STRIP */}
        <PlatformStrip />

        {/* INTERACTIVE BEFORE & AFTER SLIDER */}
        <BeforeAfter />

        {/* USE CASES */}
        <UseCases />

        {/* 4-STEP HOW IT WORKS */}
        <HowItWorks />

        {/* TRANSPARENT PRICING */}
        <Pricing />

        {/* ENHANCED FAQ ACCORDION */}
        <FAQ />

        {/* CINEMATIC FINAL CTA */}
        <FinalCTA />
      </main>
    </CurrencyProvider>
  );
}

export default LandingPage;
