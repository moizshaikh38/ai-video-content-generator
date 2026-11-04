import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  ChevronDown,
  Film,
  Maximize2,
  Menu,
  Mic,
  Palette,
  Sliders,
  Sparkles,
  Split,
  Subtitles,
  Users,
  Video,
  Workflow,
  X,
  Briefcase,
  Cpu,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import '../pages/landing-foundation.css';

interface NavDropdownItem {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  badge?: string;
  isExternal?: boolean;
}

const creationStudioItems: NavDropdownItem[] = [
  {
    icon: Sparkles,
    title: 'AI Clipping & Virality',
    description: 'Autonomous sweet-spot & hook detection (0-100 score)',
    href: '/#clipping',
  },
  {
    icon: Subtitles,
    title: 'Kinetic Captions',
    description: 'Word-by-word animated ASS presets (Hormozi, Neon, Beast)',
    href: '/#captions',
  },
  {
    icon: Maximize2,
    title: 'AI Auto-Reframe (9:16)',
    description: 'Multi-speaker facial tracking & smart layout switching',
    href: '/#reframe',
  },
  {
    icon: Film,
    title: 'AI B-Roll Overlays',
    description: 'Contextual stock footage insertion at key moments',
    href: '/#broll',
  },
  {
    icon: AudioLines,
    title: 'Audio Polish & Ducking',
    description: 'Studio voice isolation and intelligent music ducking',
    href: '/#audio',
  },
  {
    icon: Sliders,
    title: 'Pro Timeline Editor',
    description: 'Multi-track timeline with keyframes in your browser',
    href: '/dashboard',
    badge: 'Pro',
  },
];

const intelligenceItems: NavDropdownItem[] = [
  {
    icon: Palette,
    title: 'Brand Brain',
    description: 'Custom font rules, brand voice, and watermark styling',
    href: '/brand',
    badge: 'Live',
  },
  {
    icon: Split,
    title: 'A/B Testing Studio',
    description: 'Empirical hook & title optimization with Z-score stats',
    href: '/ab-testing',
    badge: 'Live',
  },
  {
    icon: BarChart3,
    title: 'Performance Analytics',
    description: 'Cross-channel retention metrics and audience analytics',
    href: '/analytics',
    badge: 'Live',
  },
  {
    icon: Workflow,
    title: 'Autopilot Workflows',
    description: 'Automated video ingestion, clipping, and publishing queues',
    href: '/workflows',
    badge: 'New',
  },
];

const useCasesItems: NavDropdownItem[] = [
  {
    icon: Mic,
    title: 'Podcasters & Talk Shows',
    description: 'Turn hours of conversation into high-engagement viral snippets',
    href: '/#use-cases',
  },
  {
    icon: Video,
    title: 'YouTube & Content Creators',
    description: 'Repurpose long videos into YouTube Shorts, Reels, and TikToks',
    href: '/#use-cases',
  },
  {
    icon: Briefcase,
    title: 'Agencies & Social Teams',
    description: 'Scale client output with centralized brand kits and multi-tenancy',
    href: '/#use-cases',
  },
  {
    icon: Users,
    title: 'Founders & Thought Leaders',
    description: 'Extract punchy LinkedIn posts, X threads, and key soundbites',
    href: '/#use-cases',
  },
];

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const cinematic = location.pathname === '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'features' | 'useCases' | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setActiveDropdown(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const handleLinkClick = (href: string) => {
    setActiveDropdown(null);
    setOpen(false);
    if (href.startsWith('/#')) {
      const hash = href.replace('/#', '');
      const el = document.getElementById(hash);
      if (el) {
        const offset = 80;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  };

  const ctaPath = isAuthenticated ? '/projects/new' : '/signup';
  const ctaLabel = isAuthenticated ? 'Clip a video' : 'Get free clips';

  return (
    <header className={`lp-navbar${cinematic ? ' is-cinematic' : ''}${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <nav className="lp-nav-inner" aria-label="Main navigation" ref={dropdownRef}>
        <Logo className="lp-nav-logo" size="sm" variant={cinematic ? 'light' : 'dark'} onClick={() => { setOpen(false); setActiveDropdown(null); }} />

        <div className="lp-nav-links">
          {/* 1. Features Mega Dropdown */}
          <div
            className="lp-dropdown-wrapper relative"
            onMouseEnter={() => setActiveDropdown('features')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button
              type="button"
              className={`lp-dropdown-trigger flex items-center gap-1.5 py-2 text-xs lg:text-[13px] font-semibold transition-colors ${
                activeDropdown === 'features' ? 'text-white' : 'text-[#d9d6e1] hover:text-white'
              }`}
              onClick={() => setActiveDropdown(activeDropdown === 'features' ? null : 'features')}
              aria-expanded={activeDropdown === 'features'}
            >
              <span>Features</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 text-[#bba9e8] ${
                  activeDropdown === 'features' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {/* Desktop Mega Dropdown Panel */}
            {activeDropdown === 'features' && (
              <div className="lp-mega-menu absolute top-[calc(100%+12px)] -left-20 w-[680px] p-5 rounded-2xl bg-[#090B13]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_30px_rgba(124,58,237,0.12)] z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="grid grid-cols-2 gap-6">
                  {/* Column 1: Creation Studio */}
                  <div>
                    <div className="flex items-center gap-1.5 px-2.5 pb-2.5 mb-1.5 border-b border-white/[0.08]">
                      <Cpu className="w-3.5 h-3.5 text-[#bba9e8]" />
                      <span className="text-[11px] font-mono font-bold tracking-wider text-[#bba9e8] uppercase">
                        Creation Studio
                      </span>
                    </div>
                    <div className="space-y-1">
                      {creationStudioItems.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          onClick={() => handleLinkClick(item.href)}
                          className="group flex items-start gap-3 p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 group-hover:border-[#bba9e8]/50 group-hover:bg-[#8753e3]/10 transition-colors">
                            <item.icon size={14} className="text-[#d9d6e1] group-hover:text-white transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white group-hover:text-[#bba9e8] transition-colors truncate">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#8753e3]/20 text-[#c4b5fd] border border-[#8753e3]/30">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Column 2: Creator Intelligence */}
                  <div>
                    <div className="flex items-center gap-1.5 px-2.5 pb-2.5 mb-1.5 border-b border-white/[0.08]">
                      <Sparkles className="w-3.5 h-3.5 text-[#20E3A2]" />
                      <span className="text-[11px] font-mono font-bold tracking-wider text-[#20E3A2] uppercase">
                        Creator Intelligence
                      </span>
                    </div>
                    <div className="space-y-1">
                      {intelligenceItems.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          onClick={() => handleLinkClick(item.href)}
                          className="group flex items-start gap-3 p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 group-hover:border-[#20E3A2]/50 group-hover:bg-[#20E3A2]/10 transition-colors">
                            <item.icon size={14} className="text-[#d9d6e1] group-hover:text-white transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white group-hover:text-[#20E3A2] transition-colors truncate">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#20E3A2]/20 text-[#20E3A2] border border-[#20E3A2]/30">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>

                    {/* Bottom Quick Feature Link */}
                    <div className="mt-3 p-2.5 rounded-xl bg-gradient-to-r from-purple-900/30 to-violet-900/20 border border-purple-500/20 flex items-center justify-between">
                      <span className="text-[11px] text-slate-300 font-medium">Explore All 12 Capabilities</span>
                      <a
                        href="/#major-features"
                        onClick={() => handleLinkClick('/#major-features')}
                        className="text-[11px] font-bold text-[#bba9e8] hover:text-white flex items-center gap-1"
                      >
                        Studio View <ArrowRight size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Solutions / Use Cases Dropdown */}
          <div
            className="lp-dropdown-wrapper relative"
            onMouseEnter={() => setActiveDropdown('useCases')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button
              type="button"
              className={`lp-dropdown-trigger flex items-center gap-1.5 py-2 text-xs lg:text-[13px] font-semibold transition-colors ${
                activeDropdown === 'useCases' ? 'text-white' : 'text-[#d9d6e1] hover:text-white'
              }`}
              onClick={() => setActiveDropdown(activeDropdown === 'useCases' ? null : 'useCases')}
              aria-expanded={activeDropdown === 'useCases'}
            >
              <span>Use Cases</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 text-[#bba9e8] ${
                  activeDropdown === 'useCases' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {/* Use Cases Dropdown Panel */}
            {activeDropdown === 'useCases' && (
              <div className="lp-dropdown-panel absolute top-[calc(100%+12px)] left-0 w-[340px] p-3 rounded-2xl bg-[#090B13]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_30px_rgba(124,58,237,0.12)] z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="space-y-1">
                  {useCasesItems.map((item) => (
                    <a
                      key={item.title}
                      href={item.href}
                      onClick={() => handleLinkClick(item.href)}
                      className="group flex items-start gap-3 p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 group-hover:border-[#bba9e8]/50 group-hover:bg-[#8753e3]/10 transition-colors">
                        <item.icon size={14} className="text-[#d9d6e1] group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-white group-hover:text-[#bba9e8] transition-colors truncate block">
                          {item.title}
                        </span>
                        <p className="text-[11px] text-slate-400 leading-tight line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. How It Works Pipeline */}
          <a
            href="/#how"
            onClick={() => handleLinkClick('/#how')}
            className="text-xs lg:text-[13px] font-semibold text-[#d9d6e1] hover:text-white transition-colors"
          >
            How It Works
          </a>

          {/* 4. Pricing */}
          <a
            href="/#pricing"
            onClick={() => handleLinkClick('/#pricing')}
            className="text-xs lg:text-[13px] font-semibold text-[#d9d6e1] hover:text-white transition-colors"
          >
            Pricing
          </a>

          {/* 5. FAQ */}
          <a
            href="/#faq"
            onClick={() => handleLinkClick('/#faq')}
            className="text-xs lg:text-[13px] font-semibold text-[#d9d6e1] hover:text-white transition-colors hidden xl:inline-block"
          >
            FAQ
          </a>
        </div>

        {/* Right side actions */}
        <div className="lp-nav-actions">
          {isAuthenticated ? (
            <Link className="lp-nav-login" to="/dashboard">Dashboard</Link>
          ) : (
            <Link className="lp-nav-login" to="/login">{cinematic ? 'Login' : 'Log in'}</Link>
          )}
          <Link className="lp-button lp-button-dark" to={ctaPath}>
            {ctaLabel} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile menu hamburger button */}
        <button
          className="lp-menu-button"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </nav>

      {/* Mobile drawer with organized sections */}
      {open && (
        <div className="lp-mobile-menu" id="lp-mobile-menu">
          <div className="space-y-4 py-2">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#bba9e8] font-bold block mb-2 px-1">
                Creation Studio
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {creationStudioItems.slice(0, 4).map((item) => (
                  <a
                    key={item.title}
                    href={item.href}
                    onClick={() => { setOpen(false); handleLinkClick(item.href); }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] text-xs text-slate-200"
                  >
                    <item.icon size={13} className="text-[#bba9e8]" />
                    <span className="truncate">{item.title}</span>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#20E3A2] font-bold block mb-2 px-1">
                Creator Intelligence
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {intelligenceItems.map((item) => (
                  <a
                    key={item.title}
                    href={item.href}
                    onClick={() => { setOpen(false); handleLinkClick(item.href); }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] text-xs text-slate-200"
                  >
                    <item.icon size={13} className="text-[#20E3A2]" />
                    <span className="truncate">{item.title}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2">
              <a href="/#use-cases" onClick={() => { setOpen(false); handleLinkClick('/#use-cases'); }} className="text-sm font-semibold text-slate-200 px-1 py-1">
                Use Cases & Creators
              </a>
              <a href="/#how" onClick={() => { setOpen(false); handleLinkClick('/#how'); }} className="text-sm font-semibold text-slate-200 px-1 py-1">
                4-Step Pipeline Architecture
              </a>
              <a href="/#pricing" onClick={() => { setOpen(false); handleLinkClick('/#pricing'); }} className="text-sm font-semibold text-slate-200 px-1 py-1">
                Plans & Pricing
              </a>
              <a href="/#faq" onClick={() => { setOpen(false); handleLinkClick('/#faq'); }} className="text-sm font-semibold text-slate-200 px-1 py-1">
                FAQ
              </a>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
              <Link
                to={isAuthenticated ? '/dashboard' : '/login'}
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg border border-white/10"
              >
                {isAuthenticated ? 'Dashboard' : 'Log in'}
              </Link>
              <Link
                className="lp-button lp-button-dark flex-1 text-center justify-center"
                to={ctaPath}
                onClick={() => setOpen(false)}
              >
                {ctaLabel} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
