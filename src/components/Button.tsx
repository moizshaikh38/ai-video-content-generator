import * as React from 'react';
import { cn } from '../lib/utils';
import {
  BTN_PILL_AI,
  BTN_PILL_BRAND,
  BTN_PILL_DESTRUCTIVE,
  BTN_PILL_GHOST,
  BTN_PILL_PRIMARY,
  BTN_PILL_SECONDARY,
} from '../lib/buttonStyles';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'brand'
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
  /** Text buttons are pills; icon buttons are rounded-xl. `rounded` opts a text button
   *  sitting in a dense toolbar into the tool radius. */
  shape?: 'pill' | 'rounded';
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// Primary actions are the violet brand pill; secondary actions are quiet glass.
const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: BTN_PILL_PRIMARY,
  primary: BTN_PILL_PRIMARY,
  brand: BTN_PILL_BRAND,
  ai: BTN_PILL_AI,
  violet: BTN_PILL_AI,
  studio: BTN_PILL_AI,
  clay: BTN_PILL_AI, // brand/AI accent
  secondary: BTN_PILL_SECONDARY,
  outline: BTN_PILL_SECONDARY,
  ghost: BTN_PILL_GHOST,
  sage: `${BTN_PILL_SECONDARY} border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-500/40`,
  destructive: BTN_PILL_DESTRUCTIVE,
  link: 'text-vc-text-primary underline-offset-4 hover:underline hover:text-white',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  // On coarse-pointer screens keep tap targets >= 40px (44px for primary/icon),
  // then restore the denser desktop sizing from sm up.
  default: 'h-11 px-5 text-sm sm:h-10',
  sm: 'h-10 px-3.5 text-xs sm:h-9 sm:px-3',
  lg: 'h-12 px-7 text-base',
  icon: 'h-11 w-11 p-0 sm:h-10 sm:w-10',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      shape,
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
      'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold cursor-pointer select-none disabled:cursor-not-allowed';
    // Recipes are pills; icon buttons and opted-in toolbar buttons take the tool radius.
    const resolvedShape = shape ?? (size === 'icon' ? 'rounded' : 'pill');
    const computedClassName = cn(
      baseClasses,
      variantStyles[variant],
      resolvedShape === 'rounded' && 'rounded-xl',
      sizeStyles[size],
      className
    );

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
