import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export interface LoadingStateProps {
  message?: string;
  description?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Processing...',
  description,
  className,
  size = 'md',
}) => {
  const outerSizes = {
    sm: 'size-10',
    md: 'size-16',
    lg: 'size-24',
  };

  const iconSizes = {
    sm: 'size-4',
    md: 'size-6',
    lg: 'size-9',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center min-h-[260px] relative select-none',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Ambient background glow */}
      <div className="absolute w-44 h-44 rounded-full bg-gradient-to-tr from-violet-600/15 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* Futuristic dual-ring radar scanner */}
      <div className={cn('relative flex items-center justify-center mb-5', outerSizes[size])}>
        {/* Outer pulsating ring */}
        <div className="absolute inset-0 rounded-full border-2 border-violet-500/20 animate-ping opacity-30" />
        
        {/* Counter-rotating gradient rings */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 border-r-cyan-400 animate-spin" />
        <div className="absolute inset-1.5 rounded-full border border-transparent border-b-purple-400 border-l-emerald-400 animate-spin [animation-duration:1.5s] [animation-direction:reverse]" />

        {/* Center glowing icon badge */}
        <div className="relative size-3/5 rounded-full bg-[#0E1017] border border-white/10 flex items-center justify-center shadow-lg">
          <Sparkles className={cn('text-violet-400 animate-pulse', iconSizes[size])} />
        </div>
      </div>

      {/* Message with subtle gradient text */}
      <h4 className="text-base sm:text-lg font-bold font-['Sora',sans-serif] text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300 tracking-tight">
        {message}
      </h4>

      {description && (
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md leading-relaxed font-normal">
          {description}
        </p>
      )}

      {/* Monospace AI Status Pill */}
      <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-slate-400">
        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Vireo AI Engine Active</span>
      </div>
    </div>
  );
};
