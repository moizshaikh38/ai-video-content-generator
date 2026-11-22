import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import '../pages/landing-foundation.css';
import './public-navigation.css';
// Dark cinematic navbar styles (all rules are .is-cinematic scoped); needed on
// non-landing dark pages (legal/support) where the hero CSS is not loaded.
import './landing/cinematic-hero.css';
import '../styles/glass-surfaces.css';

// One shared public menu structure, mirrored by the static site pages
// (scripts/build-site-pages.mjs) and the gaming demos page, so the menu
// button and dropdowns look and behave the same across the whole app.
const navGroups = [
  {
    label: 'Features',
    links: [
      { href: '/features', label: 'Features overview' },
      { href: '/#major-features', label: 'See the workflow' },
    ],
  },
  {
    label: 'Tools',
    links: [
      { href: '/tools', label: 'All tools' },
      { href: '/tools/captions', label: 'Captions' },
      { href: '/tools/reframe', label: 'Reframe' },
      { href: '/tools/video-trimmer', label: 'Video trimmer' },
      { href: '/tools/split-screen', label: 'Split-screen' },
      { href: '/tools/ai-gaming-clip-generator/', label: 'Gaming clips' },
      { href: '/tools/gaming-clips/fortnite', label: 'Fortnite clip guide' },
      { href: '/tools/gaming-clips/gta-v', label: 'GTA V clip guide' },
      { href: '/tools/gaming-clips/valorant', label: 'Valorant clip guide' },
    ],
  },
  {
    label: 'Use Cases',
    links: [
      { href: '/use-cases', label: 'Use cases overview' },
      { href: '/use-cases/podcasters', label: 'Podcasters' },
      { href: '/use-cases/streamers', label: 'Streamers' },
      { href: '/use-cases/agencies', label: 'Agencies' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { href: '/resources', label: 'Resources overview' },
      { href: '/resources/learning-center', label: 'Learning center' },
      { href: '/resources/help-centre', label: 'Help centre' },
      { href: '/resources/blog', label: 'Blog' },
      { href: '/privacy', label: 'Privacy & storage' },
    ],
  },
];

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const cinematic = location.pathname === '/' || location.pathname === '/terms' || location.pathname === '/privacy' || location.pathname === '/support';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  const waitlistMode = import.meta.env.VITE_WAITLIST_ENABLED === 'true';
  const ctaPath = isAuthenticated ? '/dashboard' : (waitlistMode ? '/#waitlist' : '/signup');
  const ctaLabel = isAuthenticated ? 'Open workspace' : (waitlistMode ? 'Join waitlist' : 'Get started');
  const isCurrent = (href: string) => location.pathname === href || (href !== '/' && href.startsWith(location.pathname + '/'));
  return (
    <header className={`lp-navbar vc-public-nav${cinematic ? ' is-cinematic' : ''}${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <nav className="lp-nav-inner" aria-label="Main navigation">
        <Logo className="lp-nav-logo" size="sm" variant={cinematic ? 'light' : 'dark'} onClick={() => setOpen(false)} />
        <div className="lp-nav-links">
          {navGroups.map((group) => (
            <details className="nav-group" key={group.label}>
              <summary aria-current={group.links.some((l) => isCurrent(l.href)) ? 'page' : undefined}>{group.label}</summary>
              <div className="nav-drop vc-glass-popover">
                {group.links.map((link) => (
                  <a key={link.href} href={link.href} aria-current={location.pathname === link.href ? 'page' : undefined}>{link.label}</a>
                ))}
              </div>
            </details>
          ))}
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div className="lp-nav-actions">
          {(!waitlistMode || isAuthenticated) && (
            <Link className="lp-nav-login" to={isAuthenticated ? '/dashboard' : '/login'}>{isAuthenticated ? 'Dashboard' : 'Sign in'}</Link>
          )}
          {waitlistMode && !isAuthenticated ? (
            <a className="lp-button lp-button-dark" href="/#waitlist">{ctaLabel} <ArrowRight size={15} aria-hidden="true" /></a>
          ) : (
            <Link className="lp-button lp-button-dark" to={ctaPath}>{ctaLabel} <ArrowRight size={15} aria-hidden="true" /></Link>
          )}
        </div>
        <button className="lp-menu-button vc-glass-control" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="lp-mobile-menu" onClick={() => setOpen(v => !v)}>
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </nav>
      {open && <div className="lp-mobile-menu vc-clean-menu vc-glass-popover" id="lp-mobile-menu">
        <div className="vc-clean-menu-label">EXPLORE VIREOCLIP</div>
        {navGroups.map((group) => (
          <details className="nav-group" key={group.label}>
            <summary>{group.label}</summary>
            <div className="nav-drop vc-glass-popover">
              {group.links.map((link) => (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                  <ArrowRight size={13} aria-hidden="true" />
                </a>
              ))}
            </div>
          </details>
        ))}
        <a className="vc-plain-link" href="/#pricing" onClick={() => setOpen(false)}>Pricing<ArrowRight size={13} aria-hidden="true" /></a>
        <a className="vc-plain-link" href="/#faq" onClick={() => setOpen(false)}>FAQ<ArrowRight size={13} aria-hidden="true" /></a>
        <a className="vc-plain-link" href="/privacy" onClick={() => setOpen(false)}>Privacy &amp; storage<ArrowRight size={13} aria-hidden="true" /></a>
        <div className="vc-clean-menu-actions">{(!waitlistMode || isAuthenticated) && (<Link to={isAuthenticated ? '/dashboard' : '/login'} onClick={() => setOpen(false)}>{isAuthenticated ? 'Dashboard' : 'Sign in'}</Link>)}{waitlistMode && !isAuthenticated ? (<a className="lp-button lp-button-dark" href="/#waitlist" onClick={() => setOpen(false)}>{ctaLabel} <ArrowRight size={14} aria-hidden="true" /></a>) : (<Link className="lp-button lp-button-dark" to={ctaPath} onClick={() => setOpen(false)}>{ctaLabel} <ArrowRight size={14} aria-hidden="true" /></Link>)}</div>
      </div>}
    </header>
  );
}
export default Navbar;
