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
    imgUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=800&q=80",
    alt: "AI Virality Scoring & Hook Discovery",
    badge: "VIRALITY: 98 / 100",
    title: "AI Virality Scoring",
    description: "Neural hook detection scans emotional spikes and speech velocity.",
    details: {
      id: "virality",
      badge: "VIRALITY: 98 / 100",
      title: "AI Virality Scoring & Hook Discovery",
      summary: "Predicts viral retention before publishing by analyzing sentiment inflection points, hook density, and viewer engagement drop-off risks.",
      metrics: "98.4% Hook Retention Snapping",
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
    imgUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
    alt: "Word-by-Word Kinetic Subtitles",
    badge: "KINETIC ASS",
    title: "Kinetic Captions",
    description: "Hormozi Pop, Neon Cyber, and Beast Pill dynamic karaoke subtitles.",
    details: {
      id: "captions",
      badge: "KINETIC SUBTITLES",
      title: "Word-by-Word Kinetic Karaoke Captions",
      summary: "Dynamic SubStation Alpha (ASS) engine renders active-word highlight pops, drop-shadow glows, and emoji overlays with zero desync.",
      metrics: "60 FPS Native Hardware Render",
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
    imgUrl: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=80",
    alt: "Smart 9:16 Active Speaker Reframe",
    badge: "9:16 FACE-TRACKING",
    title: "Smart 9:16 Reframe",
    description: "Smooth Bézier camera tracking keeps speakers centered in vertical format.",
    details: {
      id: "reframe",
      badge: "SMART 9:16 REFRAME",
      title: "Multi-Speaker Active Face Tracking",
      summary: "Converts landscape 16:9 videos into native 9:16 vertical shorts. Intelligently tracks active speakers with smooth cinematic easing.",
      metrics: "99.8% Facial Tracking Precision",
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
    imgUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
    alt: "Browser Multi-Track Timeline Editor",
    badge: "NLE STUDIO",
    title: "Multi-Track Editor",
    description: "4K multi-track timeline with keyframes, transitions, and handles in browser.",
    details: {
      id: "editor",
      badge: "MULTI-TRACK STUDIO",
      title: "Browser Multi-Track Studio Editor",
      summary: "Professional timeline editing without leaving the browser. Dedicated tracks for primary video, B-roll overlays, captions, and audio.",
      metrics: "Full 4K In-Browser Playback",
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
    imgUrl: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
    alt: "Contextual AI B-Roll Insertion",
    badge: "AUTO CUTAWAYS",
    title: "AI B-Roll Overlays",
    description: "Auto-detects conversation topics and overlays relevant stock cutaways.",
    details: {
      id: "broll",
      badge: "AI B-ROLL OVERLAYS",
      title: "Contextual AI B-Roll Insertion",
      summary: "Eliminates visual monotony by understanding speech concepts and dropping in contextual high-resolution cutaways during dialogue pauses.",
      metrics: "3x Higher Viewer Retention",
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
    imgUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
    alt: "Adaptive Audio Ducking & Speech Polish",
    badge: "CLEAN AUDIO",
    title: "Audio Ducking & Polish",
    description: "Background music automatically dips -14dB beneath spoken dialogue.",
    details: {
      id: "audio",
      badge: "AUDIO DUCKING & POLISH",
      title: "Adaptive Audio Ducking & Voice Isolation",
      summary: "Studio-grade sound processing isolates speech, removes ambient room hum, and automatically dips background music during speech bursts.",
      metrics: "-14dB Smart Ducking Curve",
      icon: AudioLines,
      bullets: [
        "Zero-click speech isolation removes background noise and hum",
        "Automatic loudness normalization to standard social broadcast levels",
        "Smooth sidechain ducking curve preserves musical ambiance",
      ],
      ctaText: "Test Audio Studio",
      ctaLink: "/projects/new",
    },
  },
  {
    imgUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80",
    alt: "Brand Brain Voice & Watermark Kit",
    badge: "BRAND IDENTITY",
    title: "Brand Brain Kit",
    description: "Lock in custom font pairings, color palettes, and logo watermarks once.",
    details: {
      id: "brand",
      badge: "BRAND BRAIN KIT",
      title: "Centralized Brand Brain Consistency",
      summary: "Store brand guidelines once. Every generated clip automatically adheres to your saved fonts, color palettes, and watermark positions.",
      metrics: "100% Brand Compliance",
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
    imgUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
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
    imgUrl: "https://images.unsplash.com/photo-1593697821252-0c9137d9fc45?auto=format&fit=crop&w=800&q=80",
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
    imgUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
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
