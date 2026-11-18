import { Fragment, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import '../pages/landing-foundation.css';
import './public-navigation.css';

const resourceLinks = [{href:'/resources/help-centre',label:'Help Centre'},{href:'/resources/learning-center',label:'Learning Center'},{href:'/resources/blog',label:'Blog'}];
const publicLinks = [
  { href: '/features', label: 'Features', detail: 'Clipping, captions and framing' },
  { href: '/tools', label: 'Tools', detail: 'Find the right editing workflow' },
  { href: '/use-cases', label: 'Use Cases', detail: 'Podcasters, streamers and agencies' },
  { href: '/resources', label: 'Resources', detail: 'Help Centre, Learning Center and Blog' },
  { href: '/pricing', label: 'Pricing', detail: 'Plan information and availability' },
  { href: '/#faq', label: 'FAQ', detail: 'Before you start' },
];

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const cinematic = location.pathname === '/';
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
  const ctaPath = isAuthenticated ? '/dashboard' : '/signup';
  const ctaLabel = isAuthenticated ? 'Open workspace' : 'Get started';
  return (
    <header className={`lp-navbar vc-public-nav${cinematic ? ' is-cinematic' : ''}${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <nav className="lp-nav-inner" aria-label="Main navigation">
        <Logo className="lp-nav-logo" size="sm" variant={cinematic ? 'light' : 'dark'} onClick={() => setOpen(false)} />
        <div className="lp-nav-links">
          {publicLinks.map(item => item.href === '/resources' ? <details className="vc-resources" key={item.href}><summary>Resources</summary><div><a href="/resources">All resources</a>{resourceLinks.map(link=><a key={link.href} href={link.href}>{link.label}</a>)}</div></details> : <a key={item.href} href={item.href} aria-current={location.pathname === item.href ? 'page' : undefined}>{item.label}</a>)}
        </div>
        <div className="lp-nav-actions">
          <Link className="lp-nav-login" to={isAuthenticated ? '/dashboard' : '/login'}>{isAuthenticated ? 'Dashboard' : 'Log in'}</Link>
          <Link className="lp-button lp-button-dark" to={ctaPath}>{ctaLabel} <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <button className="lp-menu-button" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="lp-mobile-menu" onClick={() => setOpen(v => !v)}>
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </nav>
      {open && <div className="lp-mobile-menu vc-clean-menu" id="lp-mobile-menu">
        <div className="vc-clean-menu-label">EXPLORE VIREOCLIP</div>
        {publicLinks.map((item, index) => <Fragment key={item.href}><a className="vc-clean-menu-link" href={item.href} onClick={() => setOpen(false)}><span className="vc-menu-number">0{index + 1}</span><span><b>{item.label}</b><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a>{item.href === "/resources" && <div className="vc-resource-mobile" aria-label="Resources">{resourceLinks.map(link=><a key={link.href} href={link.href} onClick={()=>setOpen(false)}>{link.label}<ArrowRight size={13} aria-hidden="true" /></a>)}</div>}</Fragment>)}
        <div className="vc-clean-menu-actions"><Link to={isAuthenticated ? '/dashboard' : '/login'} onClick={() => setOpen(false)}>{isAuthenticated ? 'Dashboard' : 'Log in'}</Link><Link className="lp-button lp-button-dark" to={ctaPath} onClick={() => setOpen(false)}>{ctaLabel} <ArrowRight size={14} aria-hidden="true" /></Link></div>
      </div>}
    </header>
  );
}
export default Navbar;
