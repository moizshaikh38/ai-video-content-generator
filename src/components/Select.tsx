import * as React from 'react';
import { cn } from '../lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, children, options, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = selectId ? `${selectId}-error` : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-zinc-300">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            aria-invalid={Boolean(error)}
            aria-describedby={error && errorId ? errorId : undefined}
            className={cn(
              'flex h-10 w-full appearance-none rounded-xl border border-white/[0.08] bg-white/[0.03] bg-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] px-3.5 pr-9 py-2 text-sm text-vc-text-primary transition-all focus-visible:outline-none focus-visible:border-white/25 focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
              error && 'border-rose-500/80 focus-visible:border-rose-500 focus-visible:ring-rose-500/20 text-rose-100',
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-vc-surface2 text-vc-text-primary"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        </div>
        {error && <p id={errorId} className="text-xs text-rose-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-zinc-400">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
