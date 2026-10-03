import React from 'react';
import { Logo } from './Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border mt-20 bg-background/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <Logo to="/" />
        <p className="text-center sm:text-left">
          Vireo — one video, every platform. Made for creators who'd rather make things than post them.
        </p>
        <p className="text-center sm:text-right">
          © {new Date().getFullYear()} Vireo Studio. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
