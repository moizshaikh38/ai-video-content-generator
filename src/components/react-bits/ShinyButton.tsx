import React from 'react';
import { cn } from '../../lib/utils';

export interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'clay' | 'sage' | 'ink';
  children: React.ReactNode;
  className?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const ShinyButton: React.FC<ShinyButtonProps> = ({
  variant = 'clay',
  children,
  className,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}) => {
  const variantStyles = {
    // Brand violet (Upgrade / Create / AI) — pressed goes darker, never white.
    clay: 'border border-white/[0.12] bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px',
    // Success green — confirming a positive state change.
    sage: 'border border-white/10 bg-emerald-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] hover:bg-emerald-500 active:bg-emerald-700 active:translate-y-px',
    // Primary confirm (Save, Publish) — same violet brand pill.
    ink: 'border border-white/[0.12] bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px',
  };

  return (
    <button
      disabled={disabled}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 font-medium transition-all duration-300 cursor-pointer disabled:pointer-events-none disabled:opacity-50 select-none',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {/* Light sweep flare */}
      <span
        className="pointer-events-none absolute -inset-full top-0 block -translate-x-full transform-gpu bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full motion-reduce:hidden"
        style={{ transform: 'skewX(-20deg)' }}
        aria-hidden="true"
      />
      {leftIcon && <span className="relative z-10 shrink-0">{leftIcon}</span>}
      <span className="relative z-10">{children}</span>
      {rightIcon && <span className="relative z-10 shrink-0">{rightIcon}</span>}
    </button>
  );
};
