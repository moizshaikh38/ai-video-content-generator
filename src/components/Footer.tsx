import React from 'react';
import { Link } from 'react-router-dom';
import { Video } from 'lucide-react';
import { Container } from './Container';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-slate-800/80 bg-slate-950/80 py-12 transition-all">
      <Container size="lg">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Video className="w-4 h-4" />
            </div>
            <span className="font-semibold text-slate-200 tracking-tight">OmniVid AI</span>
            <span className="text-xs text-slate-500">| Project Foundation (Phase 1)</span>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
            <Link to="/" className="hover:text-slate-200 transition-colors">
              Home
            </Link>
            <a href="#features" className="hover:text-slate-200 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-slate-200 transition-colors">
              How It Works
            </a>
            <Link to="/dashboard" className="hover:text-slate-200 transition-colors">
              Dashboard
            </Link>
            <Link to="/login" className="hover:text-slate-200 transition-colors">
              Login
            </Link>
            <Link to="/signup" className="hover:text-slate-200 transition-colors">
              Sign Up
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {currentYear} OmniVid AI. All rights reserved.</p>
          <p className="text-slate-400">
            Phase 1 Foundation • Clean Architecture & Responsive UI
          </p>
        </div>
      </Container>
    </footer>
  );
};
