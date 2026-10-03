import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { Button } from './Button';

export const Navbar: React.FC = () => {
  return (
    <header className="w-full bg-background/80 backdrop-blur-md sticky top-0 z-50 border-b border-border/40">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
        <Logo />

        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="/#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="/#features" className="hover:text-foreground transition-colors">Formats</a>
          <a href="/#pricing" className="hover:text-foreground transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden text-sm font-medium text-muted-foreground sm:block hover:text-foreground transition-colors px-2 py-1"
          >
            Sign in
          </Link>
          <Button variant="sage" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
};
