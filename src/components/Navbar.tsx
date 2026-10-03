import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Video, Menu, X, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { Container } from './Container';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md transition-all">
      <Container size="lg">
        <div className="flex h-16 sm:h-20 items-center justify-between">
          {/* Logo / Brand Name Placeholder */}
          <Link
            to="/"
            onClick={closeMenu}
            className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg p-1"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-white">
                OmniVid
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                AI
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
            {isHome ? (
              <>
                <a
                  href="#features"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
                >
                  Features
                </a>
                <a
                  href="#how-it-works"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
                >
                  How It Works
                </a>
              </>
            ) : (
              <>
                <Link
                  to="/#features"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
                >
                  Features
                </Link>
                <Link
                  to="/#how-it-works"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
                >
                  How It Works
                </Link>
              </>
            )}
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
            >
              Dashboard
            </Link>
          </nav>

          {/* Desktop Auth / CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary" size="sm" rightIcon={<Sparkles className="w-3.5 h-3.5" />}>
                Get Started
              </Button>
            </Link>
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex md:hidden items-center gap-2">
            <Link to="/login" className="text-sm font-medium text-slate-300 mr-1 sm:hidden">
              Login
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 py-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col space-y-3 px-1">
              {isHome ? (
                <>
                  <a
                    href="#features"
                    onClick={closeMenu}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-slate-900 min-h-[44px]"
                  >
                    Features
                  </a>
                  <a
                    href="#how-it-works"
                    onClick={closeMenu}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-slate-900 min-h-[44px]"
                  >
                    How It Works
                  </a>
                </>
              ) : (
                <>
                  <Link
                    to="/#features"
                    onClick={closeMenu}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-slate-900 min-h-[44px]"
                  >
                    Features
                  </Link>
                  <Link
                    to="/#how-it-works"
                    onClick={closeMenu}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-slate-900 min-h-[44px]"
                  >
                    How It Works
                  </Link>
                </>
              )}
              <Link
                to="/dashboard"
                onClick={closeMenu}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-slate-900 min-h-[44px]"
              >
                Dashboard
              </Link>
              <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2.5">
                <Link to="/login" onClick={closeMenu} className="w-full">
                  <Button variant="outline" size="md" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link to="/signup" onClick={closeMenu} className="w-full">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </Container>
    </header>
  );
};
