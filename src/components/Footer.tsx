import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';

interface FooterLinkItem {
  label: string;
  href: string;
  badge?: string;
  isExternal?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLinkItem[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  { title: 'Explore', links: [
    {label:'Features',href:'/features'}, {label:'Tools',href:'/tools'},
    {label:'Use Cases',href:'/use-cases'}, {label:'Resources',href:'/resources'}, {label:'Plans & Pricing',href:'/pricing'},
  ]},
  { title: 'Editing workflows', links: [
    {label:'Captions',href:'/tools/captions'}, {label:'Reframe',href:'/tools/reframe'},
    {label:'Gaming layout demos',href:'/tools/ai-gaming-clip-generator/'},
  ]},
  { title: 'Made for your recording', links: [
    {label:'Podcasters',href:'/use-cases/podcasters'}, {label:'Streamers',href:'/use-cases/streamers'},
    {label:'Agencies',href:'/use-cases/agencies'},
  ]},
  { title: 'Resources & help', links: [
    {label:'Help Centre',href:'/resources/help-centre'}, {label:'Learning Center',href:'/resources/learning-center'}, {label:'Blog',href:'/resources/blog'},
    {label:'FAQ',href:'/#faq'}, {label:'Support',href:'/support'},
    {label:'Terms of Service',href:'/terms'}, {label:'Privacy Policy',href:'/privacy'},
  ]},
];

export const Footer: React.FC = () => {
  const waitlistMode = import.meta.env.VITE_WAITLIST_ENABLED === 'true';
  const location = useLocation();
  const navigate = useNavigate();

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    if (href.startsWith('/#') || href.startsWith('#')) {
      const targetHash = href.replace('/#', '').replace('#', '');
      const isHome = location.pathname === '/' || location.pathname === '';

      if (isHome) {
        e.preventDefault();
        const slideIds = ['clipping', 'captions', 'reframe', 'broll', 'audio', 'voice'];
        if (slideIds.includes(targetHash)) {
          window.dispatchEvent(new CustomEvent('vireo:goto-slide', { detail: { slideId: targetHash } }));
          const showcaseEl = document.getElementById('showcase') || document.querySelector('.vireo-showcase');
          if (showcaseEl) {
            showcaseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          const el = document.getElementById(targetHash);
          if (el) {
            const navbarOffset = 80;
            const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }
        window.history.pushState(null, '', `#${targetHash}`);
      } else {
        // Navigating from another route
        navigate(`/#${targetHash}`);
      }
    }
  };

  return (
    <footer
      id="features-footer"
      className="w-full border-t border-white/10 bg-[#080B12] text-[#F4F6FC] overflow-x-hidden vireo-features-footer"
      aria-label="Features and Navigation Footer"
    >
      {/* Top Brand Banner */}
      <div className="mx-auto max-w-7xl px-5 pt-12 pb-8 sm:px-8 lg:px-10 border-b border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <Logo light />
            <p className="max-w-md text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
              Turn long videos into scroll-stopping clips and complete social kits for YouTube, Instagram, TikTok, LinkedIn, and X.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {waitlistMode ? (
              <a
                href="/#waitlist"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-900/30 hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                Join waitlist
              </a>
            ) : (
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-900/30 hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                Start Creating Free
              </Link>
            )}
            {!waitlistMode && (
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main 5-Column Navigation Section Built Around Actual 40-Phase Features */}
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-8 xl:gap-10">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="vireo-footer-col flex flex-col space-y-4">
              {/* Pink / Purple Gradient Heading Matching Reference */}
              <h3 className="text-xs font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400">
                {col.title}
              </h3>

              <ul className="space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                {col.links.map((link) => {
                  const isInternalRoute = false; // Static marketing routes need a document navigation, not the SPA router.

                  return (
                    <li key={link.label}>
                      {isInternalRoute ? (
                        <Link
                          to={link.href}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                          {link.badge && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      ) : link.isExternal ? (
                        <a
                          href={link.href}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                        </a>
                      ) : (
                        <a
                          href={link.href}
                          onClick={(e) => handleLinkClick(e, link.href)}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                          {link.badge && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30">
                              {link.badge}
                            </span>
                          )}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Legal & Copyright Bar */}
      <div className="border-t border-white/[0.08] bg-black/30">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:px-10 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>© {new Date().getFullYear()} VireoClip by Vertex Digitals. All rights reserved.</span>
            <span>Support: support@vireoclip.com</span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              to="/terms"
              className="inline-flex items-center py-2.5 sm:py-0 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center py-2.5 sm:py-0 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Privacy Policy
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center py-2.5 sm:py-0 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Official Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
