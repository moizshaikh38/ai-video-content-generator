import React from 'react';
import { Film } from 'lucide-react';
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
      {/* Neutral spinner: one bright arc over a faint track */}
      <div className={cn('relative flex items-center justify-center mb-5', outerSizes[size])}>
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/80 animate-spin [animation-duration:0.9s]" />

        <div className="relative size-3/5 rounded-full bg-vc-surface1 border border-white/10 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Film className={cn('text-zinc-400', iconSizes[size])} />
        </div>
      </div>

      <h4 className="text-base sm:text-lg font-semibold font-['Sora',sans-serif] text-vc-text-primary tracking-tight">
        {message}
      </h4>

      {description && (
        <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 max-w-md leading-relaxed font-normal">
          {description}
        </p>
      )}

      <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] text-[11px] font-mono text-zinc-400">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span>Vireo AI Engine Active</span>
      </div>
    </div>
  );
};
