import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Flame,
  Subtitles,
  Maximize2,
  Sliders,
  Film,
  AudioLines,
  Palette,
  Split,
  Workflow,
  Users,
  ArrowRight,
  Check,
  type LucideProps,
} from "lucide-react";
import SocialCards, { type CardItem } from "@/components/ui/card-fan-carousel";
import cardCaptions from "../../assets/landing/card-captions.webp";
import cardReframe from "../../assets/landing/card-reframe.webp";
import editorUi from "../../assets/landing/editor-ui.webp";
import cardBrandBrain from "../../assets/landing/card-brand-brain.webp";
import cardTeamWorkspaces from "../../assets/landing/card-team-workspaces.webp";
import streamPodcastCaptions from "../../assets/landing/stream-podcast-captions.webp";
import streamRawRig from "../../assets/landing/stream-raw-rig.webp";
import stepHooks from "../../assets/landing/step-hooks.webp";
import streamTitleCaption from "../../assets/landing/stream-title-caption.webp";
import stepPublish from "../../assets/landing/step-publish.webp";

interface CapabilityDetails {
  id: string;
  badge: string;
  title: string;
  summary: string;
  metrics: string;
  icon: ComponentType<LucideProps>;
  bullets: string[];
  ctaText: string;
  ctaLink: string;
}

const CAPABILITY_CARDS: (CardItem & { details: CapabilityDetails })[] = [
  {
    imgUrl: streamPodcastCaptions,
    alt: "AI Virality Scoring & Hook Discovery",
    badge: "HOOK SCORING",
    title: "AI Virality Scoring",
    description: "Neural hook detection scans emotional spikes and speech velocity.",
    details: {
      id: "virality",
      badge: "HOOK SCORING",
      title: "AI Virality Scoring & Hook Discovery",
      summary: "Scores each clip's hook strength by analyzing sentiment inflection points, hook density, and pacing.",
      metrics: "0-100 Score Per Clip",
      icon: Flame,
      bullets: [
        "Identifies conversational climax and standout punchlines",
        "Calculates 0-100 sweet-spot ranking for every clip",
        "Sub-frame word boundary trimming eliminates awkward pauses",
      ],
      ctaText: "Test Virality Engine",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: cardCaptions,
    alt: "Word-by-Word Kinetic Subtitles",
    badge: "KINETIC ASS",
    title: "Kinetic Captions",
    description: "Hormozi Pop, Neon Cyber, and Beast Pill dynamic karaoke subtitles.",
    details: {
      id: "captions",
      badge: "KINETIC SUBTITLES",
      title: "Word-by-Word Kinetic Karaoke Captions",
      summary: "Dynamic SubStation Alpha (ASS) engine renders active-word highlight pops and drop-shadow glows, timed to word boundaries.",
      metrics: "Active-Word Karaoke Timing",
      icon: Subtitles,
      bullets: [
        "15+ production presets including Hormozi, Neon, and Beast",
        "Granular line-by-line and token-level custom styling",
        "Available as burned-in hardsubs or editable softsub files",
      ],
      ctaText: "Preview Presets",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: cardReframe,
    alt: "Smart 9:16 Active Speaker Reframe",
    badge: "9:16 FACE-TRACKING",
    title: "Smart 9:16 Reframe",
    description: "Smooth Bézier camera tracking keeps speakers centered in vertical format.",
    details: {
      id: "reframe",
      badge: "SMART 9:16 REFRAME",
      title: "Multi-Speaker Active Face Tracking",
      summary: "Converts landscape 16:9 videos into native 9:16 vertical shorts. Intelligently tracks active speakers with smooth cinematic easing.",
      metrics: "Speaker-Centered 9:16 Output",
      icon: Maximize2,
      bullets: [
        "Solo speaker auto-centering with zero manual keyframing",
        "Dual-speaker conversational split-screen layout",
        "Picture-in-picture mode for gaming streams and screen shares",
      ],
      ctaText: "See Framing In Action",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: editorUi,
    alt: "Browser Multi-Track Timeline Editor",
    badge: "NLE STUDIO",
    title: "Multi-Track Editor",
    description: "Multi-track timeline with keyframes, transitions, and handles in browser.",
    details: {
      id: "editor",
      badge: "MULTI-TRACK STUDIO",
      title: "Browser Multi-Track Studio Editor",
      summary: "Professional timeline editing without leaving the browser. Dedicated tracks for primary video, B-roll overlays, captions, and audio.",
      metrics: "Real-Time In-Browser Preview",
      icon: Sliders,
      bullets: [
        "Adjust video handles, ripple cuts, and keyframe transitions",
        "Real-time scrubbing with interactive audio waveform visualization",
        "Export high-bitrate MP4 renders ready for social feeds",
      ],
      ctaText: "Launch Studio Editor",
      ctaLink: "/dashboard",
    },
  },
  {
    imgUrl: streamRawRig,
    alt: "Contextual AI B-Roll Insertion",
    badge: "AUTO CUTAWAYS",
    title: "AI B-Roll Overlays",
    description: "Auto-detects conversation topics and overlays relevant stock cutaways.",
    details: {
      id: "broll",
      badge: "AI B-ROLL OVERLAYS",
      title: "Contextual AI B-Roll Insertion",
      summary: "Eliminates visual monotony by understanding speech concepts and dropping in contextual high-resolution cutaways during dialogue pauses.",
      metrics: "Semantic Cutaway Matching",
      icon: Film,
      bullets: [
        "Semantic matching aligns stock footage with spoken keywords",
        "Automatic opacity cross-fades and Ken Burns motion effects",
        "Replace, trim, or move cutaway clips on the editor timeline",
      ],
      ctaText: "Explore B-Roll Engine",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: stepHooks,
    alt: "Adaptive Audio Ducking & Speech Polish",
    badge: "CLEAN AUDIO",
    title: "Audio Ducking & Polish",
    description: "Background music automatically dips beneath spoken dialogue.",
    details: {
      id: "audio",
      badge: "AUDIO DUCKING & POLISH",
      title: "Adaptive Audio Ducking & Voice Isolation",
      summary: "Automatically dips background music beneath spoken dialogue, then restores it during pauses.",
      metrics: "Smart Ducking Curve",
      icon: AudioLines,
      bullets: [
        "Sidechain compression follows dialogue automatically",
        "Automatic loudness limiting on the final mix",
        "Smooth sidechain ducking curve preserves musical ambiance",
      ],
      ctaText: "Test Audio Studio",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: cardBrandBrain,
    alt: "Brand Brain Voice & Watermark Kit",
    badge: "BRAND IDENTITY",
    title: "Brand Brain Kit",
    description: "Lock in custom font pairings, color palettes, and logo watermarks once.",
    details: {
      id: "brand",
      badge: "BRAND BRAIN KIT",
      title: "Centralized Brand Brain Consistency",
      summary: "Store brand guidelines once. Every generated clip automatically adheres to your saved fonts, color palettes, and watermark positions.",
      metrics: "Reusable Brand Kits",
      icon: Palette,
      bullets: [
        "Custom font pairings (Plus Jakarta Sans, Inter, Montserrat)",
        "Hex-precise brand color tokens and caption highlights",
        "Positioned logo watermarks and automated branded outro cards",
      ],
      ctaText: "Configure Brand Brain",
      ctaLink: "/brand",
    },
  },
  {
    imgUrl: streamTitleCaption,
    alt: "Empirical A/B Testing Studio",
    badge: "Z-SCORE CONFIDENCE",
    title: "A/B Testing Studio",
    description: "Evaluate hook and thumbnail variants with statistical significance.",
    details: {
      id: "ab-testing",
      badge: "A/B TESTING STUDIO",
      title: "Empirical A/B Testing Studio",
      summary: "Generate multiple hook and thumbnail combinations. Measure audience conversion with rigorous two-proportion Z-score confidence.",
      metrics: "Statistical Significance Scoring",
      icon: Split,
      bullets: [
        "Automated creation of variant opening hooks and title tags",
        "Live conversion tracking across connected publishing channels",
        "Actionable recommendations to scale top-performing variants",
      ],
      ctaText: "Open A/B Studio",
      ctaLink: "/ab-testing",
    },
  },
  {
    imgUrl: stepPublish,
    alt: "Omnichannel Social Publishing Queue",
    badge: "1-CLICK QUEUE",
    title: "Social Scheduler",
    description: "Directly schedule posts to TikTok, Shorts, Reels, X, and LinkedIn.",
    details: {
      id: "publishing",
      badge: "SOCIAL SCHEDULER",
      title: "1-Click Multi-Platform Publishing Queue",
      summary: "Push approved clips directly to your connected social channels with algorithm-tested captions, hashtags, and scheduled release dates.",
      metrics: "5 Connected Platform Queues",
      icon: Workflow,
      bullets: [
        "Direct API integration with YouTube Shorts, TikTok, and Instagram",
        "Auto-generated SEO summaries, chapters, and relevant hashtags",
        "Centralized content calendar for cross-channel distribution",
      ],
      ctaText: "Explore Publishing Queue",
      ctaLink: "/publishing",
    },
  },
  {
    imgUrl: cardTeamWorkspaces,
    alt: "Team Workspaces & Role-Based Permissions",
    badge: "MULTI-TENANCY",
    title: "Team Workspaces",
    description: "Collaborate across client workspaces with granular role permissions.",
    details: {
      id: "workspaces",
      badge: "TEAM WORKSPACES",
      title: "Team Workspaces & RBAC Permissions",
      summary: "Manage multiple client brands or creative teams within secure, isolated workspaces featuring Owner, Admin, Editor, and Viewer access.",
      metrics: "Multi-Tenant Client Isolation",
      icon: Users,
      bullets: [
        "Isolated asset storage, video projects, and brand kits per workspace",
        "Granular role-based access control and invite management",
        "Consolidated usage monitoring and seat management",
      ],
      ctaText: "Manage Workspaces",
      ctaLink: "/workspaces",
    },
  },
];

export function ExploreMajorFeatures({ id = 'major-features' }: { id?: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number>(3);
  const activeCapability = CAPABILITY_CARDS[selectedIndex]?.details || CAPABILITY_CARDS[0].details;

  return (
    <section id={id} className="relative py-20 lg:py-28 bg-[#000000] text-[#FAF9FF] overflow-hidden">
      {/* Subtle atmospheric ambient glows matching Hero Section */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[550px] bg-gradient-to-r from-[#6734c9]/15 via-[#8753e3]/12 to-[#20E3A2]/10 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] mb-3 shadow-[0_0_20px_rgba(139,92,246,0.12)]">
            <Sparkles className="w-3.5 h-3.5 text-[#bba9e8] animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#bba9e8] uppercase">
              The AI Clipping Engine
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Explore All <em className="text-[#bba9e8] not-italic">Major Capabilities</em>
          </h2>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            Experience the automated workflow that replaces hours of tedious editing with intelligent, sub-second autonomous clipping.
          </p>
        </div>

        {/* GSAP Fanned Arc Carousel (Card Fan Carousel Component) */}
        <div className="w-full flex justify-center mb-8">
          <SocialCards cards={CAPABILITY_CARDS} onCardSelect={(idx) => setSelectedIndex(idx)} />
        </div>

        {/* Active Capability Spotlight Drawer (Clean borderless obsidian card) */}
        <div className="max-w-4xl mx-auto bg-[#070914]/85 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
          {(() => {
            const ActiveIcon = activeCapability.icon;
            return (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 space-y-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#8753e3]/20 text-[#c4b5fd] flex items-center justify-center">
                      <ActiveIcon size={15} />
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[#8753e3]/20 text-[#c4b5fd]">
                      {activeCapability.badge}
                    </span>
                    <span className="text-xs font-mono text-[#20E3A2] font-semibold flex items-center gap-1">
                      <Check size={13} /> {activeCapability.metrics}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {activeCapability.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {activeCapability.summary}
                  </p>
                  <ul className="space-y-1.5 pt-1 text-xs text-slate-300">
                    {activeCapability.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#bba9e8] shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="md:col-span-4 flex flex-col justify-center items-start md:items-end gap-3 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-white/[0.06] md:pl-6">
                  <span className="text-xs text-slate-400">Integrated in Vireo Studio</span>
                  <Link
                    to={activeCapability.ctaLink}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                  >
                    <span>{activeCapability.ctaText}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}

export default ExploreMajorFeatures;
