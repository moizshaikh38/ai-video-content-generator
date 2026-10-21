import * as React from 'react';
import { cn } from '../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'ai'
    | 'violet'
    | 'studio'
    | 'sage'
    | 'clay'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'destructive'
    | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// Crisp titanium-white primary neutral action — the default CTA. Violet is reserved for AI.
const neutralPrimaryClass =
  'bg-[#F4F6FB] text-[#0B0C0F] hover:bg-white shadow-sm border border-white/10 active:scale-[0.99]';

// AI signature — reserved strictly for AI/brand-accent calls to action.
const aiActionClass =
  'bg-gradient-to-b from-[#9B6BFF] to-[#7C3AED] hover:from-[#A87CFF] hover:to-[#8B5CF6] text-white shadow-[0_8px_24px_rgba(139,92,246,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] border border-violet-400/30 active:scale-[0.99]';

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: neutralPrimaryClass,
  primary: neutralPrimaryClass,
  ai: aiActionClass,
  violet: aiActionClass,
  studio: aiActionClass,
  clay: aiActionClass, // brand/AI accent gradient
  secondary: 'bg-[#151C2C] hover:bg-[#1C253B] text-[#F4F6FB] border border-white/[0.08] shadow-sm active:scale-[0.99]',
  outline: 'border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-[#F4F6FB] shadow-sm active:scale-[0.99]',
  ghost: 'bg-transparent hover:bg-white/[0.08] text-[#F4F6FB] active:scale-[0.99]',
  sage: 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 shadow-sm active:scale-[0.99]',
  destructive: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500 border border-rose-500/30 active:scale-[0.99]',
  link: 'text-[#F4F6FB] underline-offset-4 hover:underline hover:text-white',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-10 px-5 text-sm',
  sm: 'h-9 px-3 text-xs',
  lg: 'h-12 px-7 text-base',
  icon: 'h-10 w-10 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      asChild = false,
      children,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080B12] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed select-none';
    const computedClassName = cn(baseClasses, variantStyles[variant], sizeStyles[size], className);

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      return React.cloneElement(child, {
        className: cn(computedClassName, child.props.className),
        ...props,
      });
    }

    return (
      <button ref={ref} className={computedClassName} disabled={disabled} {...props}>
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
