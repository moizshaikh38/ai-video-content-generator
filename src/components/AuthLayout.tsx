import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { Logo } from './Logo';

export interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  trustLine?: string;
}

interface CreatorShowcase {
  name: string;
  handle: string;
  stats: string;
  avatar: string;
  gradient: string;
}

const SHOWCASE_CREATORS: CreatorShowcase[] = [
  {
    name: 'MrBeast',
    handle: '@mrbeast',
    stats: '318M+ Subs',
    avatar: '/demo/landing/creators/mrbeast-card-v3.webp',
    gradient: 'from-blue-600 via-indigo-600 to-violet-600',
  },
  {
    name: 'Joe Rogan',
    handle: '@joerogan',
    stats: '15M+ Listeners',
    avatar: '/demo/landing/creators/joe-rogan-card-v3.webp',
    gradient: 'from-amber-600 via-orange-600 to-red-600',
  },
  {
    name: 'Ronaldo',
    handle: '@cristiano',
    stats: '600M+ Followers',
    avatar: '/demo/landing/creators/ronaldo-card-v3.webp',
    gradient: 'from-rose-600 via-red-600 to-pink-600',
  },
  {
    name: 'IShowSpeed',
    handle: '@ishowspeed',
    stats: '28M+ Subs',
    avatar: '/demo/landing/creators/ishowspeed-card-v3.webp',
    gradient: 'from-violet-600 via-purple-600 to-indigo-600',
  },
];

const CAPABILITY_PILLS = [
  { label: 'YouTube Shorts', dotColor: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' },
  { label: 'TikTok', dotColor: 'bg-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.8)]' },
  { label: 'Instagram Reels', dotColor: 'bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 shadow-[0_0_8px_rgba(244,63,94,0.7)]' },
  { label: '9:16 Smart Reframe', dotColor: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]' },
  { label: 'Word-Pop Captions', dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' },
];

export function AuthLayout({
  children,
  title,
  subtitle,
  trustLine,
}: AuthLayoutProps) {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (name: string) => {
    setImgErrors((prev) => ({ ...prev, [name]: true }));
  };

  return (
    <div className="min-h-[100svh] w-full bg-[#07080D] text-[#F4F6FB] relative overflow-x-hidden overflow-y-auto flex flex-col justify-between px-4 sm:px-8 py-3 sm:py-5 selection:bg-violet-500/30 selection:text-white">
      {/* 1. ATMOSPHERIC BACKDROP & LIGHTING */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        {/* Giant subtle watermark behind layout */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[14vw] font-black tracking-tighter text-white/[0.02] leading-none whitespace-nowrap">
          VireoClip
        </div>

        {/* Ambient radial violet & indigo glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[400px] bg-violet-600/15 blur-[130px] rounded-full" />
        <div className="absolute bottom-8 left-1/3 w-[500px] h-[340px] bg-indigo-500/10 blur-[110px] rounded-full" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-purple-600/10 blur-[120px] rounded-full" />

        {/* Stage floor illumination */}
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-violet-950/20 via-violet-900/5 to-transparent" />

        {/* Floating vertical creator cards in ambient background */}
        {/* Left Outer: Gaming / Vloggers */}
        <div className="hidden 2xl:block absolute left-[-1%] top-1/2 -translate-y-1/2 -rotate-12 opacity-20 blur-[5px] w-[170px] aspect-[9/15] rounded-3xl border border-white/10 bg-[#12131A] overflow-hidden shadow-2xl">
          <img
            src="/demo/landing/creators/ishowspeed-card-v3.webp"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center pb-3">
            <span className="text-xs font-semibold text-slate-200">Gaming / Vloggers</span>
          </div>
        </div>

        {/* Left Inner: MrBeast */}
        <div className="hidden md:block absolute left-[1%] lg:left-[2.5%] xl:left-[5%] top-[54%] -translate-y-1/2 -rotate-6 opacity-25 lg:opacity-35 blur-[2.5px] w-[150px] lg:w-[165px] aspect-[9/15] rounded-3xl border border-white/10 bg-[#12131A] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
          <img
            src="/demo/landing/creators/mrbeast-card-v3.webp"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center pb-3">
            <span className="text-xs font-semibold text-slate-200">MrBeast</span>
          </div>
        </div>

        {/* Right Inner: Ronaldo */}
        <div className="hidden md:block absolute right-[1%] lg:right-[2.5%] xl:right-[5%] top-[54%] -translate-y-1/2 rotate-6 opacity-25 lg:opacity-35 blur-[2.5px] w-[150px] lg:w-[165px] aspect-[9/15] rounded-3xl border border-white/10 bg-[#12131A] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
          <img
            src="/demo/landing/creators/ronaldo-card-v3.webp"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center pb-3">
            <span className="text-xs font-semibold text-slate-200">Ronaldo</span>
          </div>
        </div>

        {/* Right Outer: Joe Rogan */}
        <div className="hidden 2xl:block absolute right-[-1%] top-1/2 -translate-y-1/2 rotate-12 opacity-20 blur-[5px] w-[170px] aspect-[9/15] rounded-3xl border border-white/10 bg-[#12131A] overflow-hidden shadow-2xl">
          <img
            src="/demo/landing/creators/joe-rogan-card-v3.webp"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center pb-3">
            <span className="text-xs font-semibold text-slate-200">Joe Rogan</span>
          </div>
        </div>
      </div>

      {/* 2. TOP BRAND HEADER */}
      <header className="relative z-20 w-full max-w-6xl mx-auto flex items-center justify-between">
        <Logo variant="light" size="md" />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition-colors group"
        >
          <span>Back to Home</span>
          <ArrowRight className="size-3.5 sm:size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      {/* 3. TWO-COLUMN DESKTOP / CENTERED MOBILE GRID */}
      <main className="max-w-6xl mx-auto w-full my-auto py-3 sm:py-5 grid lg:grid-cols-12 gap-8 xl:gap-12 items-center relative z-10">
        {/* Left Column: Spatial Glass Modal Card */}
        <section className="lg:col-span-5 w-full max-w-[430px] mx-auto">
          <div className="rounded-[24px] bg-[#12141E]/80 backdrop-blur-2xl border border-white/[0.09] shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_50px_rgba(139,92,246,0.10),inset_0_1px_0_0_rgba(255,255,255,0.16)] p-6 sm:p-7 relative overflow-hidden">
            {/* Top subtle highlight */}
            <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />

            {/* Centered Heading & Subtitle */}
            <h1 className="text-xl sm:text-[23px] font-bold tracking-tight text-white text-center leading-snug">
              {title}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-400 text-center leading-relaxed">
              {subtitle || trustLine || 'Free plan available. No credit card required.'}
            </p>

            {/* Auth Form Children */}
            <div className="relative z-10">
              {children}
            </div>
          </div>
        </section>

        {/* Right Column: OpusClip-Style Social Proof Showcase */}
        <section className="hidden lg:flex lg:col-span-7 flex-col items-center text-center pl-4">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/80 mb-2.5 shadow-[0_0_20px_rgba(139,92,246,0.20)]">
            <Sparkles className="size-3 text-violet-400 shrink-0" />
            <span>BEST FREE AI VIDEO CLIPPING STUDIO</span>
          </div>

          {/* Social Proof Headline */}
          <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-white max-w-lg leading-tight">
            Trusted by{' '}
            <span className="bg-gradient-to-r from-[#C4B5FD] via-[#A78BFA] to-[#8B5CF6] bg-clip-text text-transparent">
              top creators
            </span>{' '}
            and studios worldwide
          </h2>

          <p className="mt-3 text-sm text-slate-400 max-w-md leading-relaxed">
            Generate viral, platform-optimized short clips in seconds. 9:16 dynamic smart reframe, kinetic word-pop captions, and AI virality hooks calibrated for algorithm growth.
          </p>

          {/* Creator Avatar Showcase Row */}
          <div className="mt-7 grid grid-cols-4 gap-4 xl:gap-5 w-full max-w-lg">
            {SHOWCASE_CREATORS.map((creator) => {
              const hasError = imgErrors[creator.name];
              return (
                <div key={creator.name} className="flex flex-col items-center group">
                  <div className="relative">
                    {/* Glowing outer gradient ring */}
                    <div className="p-0.5 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-500 to-purple-400 shadow-[0_0_18px_rgba(139,92,246,0.35)] group-hover:shadow-[0_0_26px_rgba(139,92,246,0.55)] transition-shadow">
                      <div className="size-15 xl:size-17 rounded-full overflow-hidden bg-neutral-900 border border-white/20 relative">
                        {!hasError ? (
                          <img
                            src={creator.avatar}
                            alt={creator.name}
                            onError={() => handleImageError(creator.name)}
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className={`size-full bg-gradient-to-br ${creator.gradient} flex items-center justify-center text-white font-bold text-lg`}>
                            {creator.name[0]}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Small play badge overlay */}
                    <div className="absolute -bottom-0.5 -right-0.5 size-4.5 rounded-full bg-violet-600 border-2 border-[#12141E] flex items-center justify-center text-white shadow-md">
                      <Play className="size-2 fill-white" />
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-white mt-2 whitespace-nowrap">
                    {creator.name}
                  </span>
                  <span className="text-[10px] text-violet-300 font-mono bg-violet-950/70 border border-violet-500/25 px-2 py-0.5 rounded-full mt-1 whitespace-nowrap shadow-sm">
                    {creator.stats}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Capability Pills (Non-truncating glassmorphic chips) */}
          <div className="mt-7 flex flex-wrap justify-center items-center gap-2 max-w-lg">
            {CAPABILITY_PILLS.map((pill) => (
              <span
                key={pill.label}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.09] text-xs font-medium text-slate-300 transition-colors flex items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
              >
                <span className={`size-1.5 rounded-full shrink-0 ${pill.dotColor}`} />
                <span>{pill.label}</span>
              </span>
            ))}
          </div>
        </section>
      </main>

      {/* 4. BOTTOM FOOTER */}
      <footer className="relative z-20 w-full max-w-6xl mx-auto py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <p>© {new Date().getFullYear()} VireoClip AI. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link to="/terms" target="_blank" className="hover:text-slate-400 transition-colors">
            Terms of Service
          </Link>
          <span>·</span>
          <Link to="/privacy" target="_blank" className="hover:text-slate-400 transition-colors">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
