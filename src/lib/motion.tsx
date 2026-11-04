import React, { useEffect, useRef, useState } from 'react';

/**
 * Shared motion system (landing + app). Dependency-free: IntersectionObserver
 * + CSS keyframes defined in motion.css. Everything respects
 * prefers-reduced-motion via the stylesheet.
 *
 *   <Reveal variant="up" delay={120}>…</Reveal>
 *   <AnimatedNumber value={42} suffix="M+" />
 *   useStaggerReady(ref) — gates a CSS staggered grid until mounted
 */

export type RevealVariant = 'up' | 'down' | 'left' | 'right' | 'scale' | 'blur' | 'fade';

interface RevealProps {
  variant?: RevealVariant;
  /** Transition delay in ms (stagger manually or via parent). */
  delay?: number;
  /** Fire once (default) or re-trigger every time it enters the viewport. */
  once?: boolean;
  /** Fraction of the element that must be visible before revealing. */
  threshold?: number;
  className?: string;
  as?: 'div' | 'span' | 'section' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'li' | 'a';
  children: React.ReactNode;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
}

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up: 'mv-up',
  down: 'mv-down',
  left: 'mv-left',
  right: 'mv-right',
  scale: 'mv-scale',
  blur: 'mv-blur',
  fade: 'mv-fade',
};

export const Reveal: React.FC<RevealProps> = ({
  variant = 'up',
  delay = 0,
  once = true,
  threshold = 0.15,
  className = '',
  as: Tag = 'div',
  children,
  style,
  ...rest
}) => {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -6% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`mv-reveal ${VARIANT_CLASS[variant]} ${visible ? 'mv-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
};

/** Counts up to `value` when scrolled into view. Integers by default. */
export const AnimatedNumber: React.FC<{
  value: number;
  durationMs?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ value, durationMs = 1400, decimals = 0, prefix = '', suffix = '', className = '' }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setDisplay(value);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return;
        started.current = true;
        observer.disconnect();
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
          setDisplay(value);
          return;
        }
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / durationMs);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
};

/** Adds a class once the component mounts — gates entrance staggers. */
export function useMountedGate<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return [ref, ready];
}

/** Subtle parallax: returns a ref; children get translate3d via CSS var --mv-parallax. */
export function useParallax(strength = 24): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const viewportMid = window.innerHeight / 2;
        const progress = (rect.top + rect.height / 2 - viewportMid) / window.innerHeight;
        el.style.setProperty('--mv-parallax', `${(-progress * strength).toFixed(2)}px`);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [strength]);
  return ref;
}
