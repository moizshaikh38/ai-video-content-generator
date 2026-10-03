import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from './Logo';

const links = [
  { label: 'Product', href: '/#product' },
  { label: 'Use Cases', href: '/#platforms' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Resources', href: '/#faq' },
];
export const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-50 border-b border-border bg-[#fffdf9]/90 backdrop-blur-md"><nav className="mx-auto flex h-[72px] max-w-[1350px] items-center justify-between px-5 lg:px-10"><Logo /><div className="hidden items-center gap-9 lg:flex">{links.map(x => <a key={x.label} href={x.href} className="text-sm font-medium text-[#344249] hover:text-forest">{x.label}</a>)}</div><div className="hidden items-center gap-6 sm:flex"><Link to="/login" className="text-sm font-medium hover:text-clay">Sign in</Link><Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-clay px-5 py-3 text-sm font-semibold text-white shadow-clay hover:bg-[#c93f1e]">Start Creating <ArrowRight className="size-4" /></Link></div><button onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="rounded-lg p-2 sm:hidden">{open ? <X /> : <Menu />}</button></nav>{open && <div className="border-t border-border bg-white p-5 sm:hidden"><div className="flex flex-col gap-4">{links.map(x => <a onClick={() => setOpen(false)} key={x.label} href={x.href} className="text-sm font-medium">{x.label}</a>)}<Link to="/login" className="text-sm font-medium">Sign in</Link><Link to="/signup" className="rounded-xl bg-clay px-4 py-3 text-center text-sm font-semibold text-white">Start Creating</Link></div></div>}</header>;
};
