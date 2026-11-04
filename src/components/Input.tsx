import * as React from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  rightLabel?: React.ReactNode;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, rightLabel, error, helperText, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = inputId ? `${inputId}-error` : undefined;

    return (
      <div className="w-full space-y-1.5">
        {(label || rightLabel) && (
          <div className="flex items-center justify-between">
            {label && (
              <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300">
                {label}
              </label>
            )}
            {rightLabel && (
              <span className="text-xs text-zinc-400 font-mono">
                {rightLabel}
              </span>
            )}
          </div>
        )}
        <input
          id={inputId}
          type={type}
          aria-invalid={Boolean(error)}
          aria-describedby={error && errorId ? errorId : undefined}
          className={cn(
            'flex h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] px-3.5 py-2 text-sm text-vc-text-primary transition-all placeholder:text-zinc-500 focus-visible:outline-none focus-visible:border-white/25 focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-rose-500/80 focus-visible:border-rose-500 focus-visible:ring-rose-500/20',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p id={errorId} className="text-xs text-rose-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-zinc-400">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
