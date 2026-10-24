/**
 * Theme colours are CSS variables (some hold rgba values), so Tailwind cannot split them
 * into channels. This makes opacity modifiers (`bg-destructive/10`, `border-border/60`)
 * work by mixing the variable with transparent instead of silently emitting nothing.
 */
const withAlpha = (variable) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `var(${variable})`
    : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: withAlpha('--background'),
        foreground: withAlpha('--foreground'),
        card: {
          DEFAULT: withAlpha('--card'),
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: withAlpha('--popover'),
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: withAlpha('--primary'),
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: withAlpha('--secondary'),
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: withAlpha('--muted'),
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: withAlpha('--destructive'),
          foreground: 'var(--destructive-foreground)',
        },
        border: withAlpha('--border'),
        input: withAlpha('--input'),
        ring: withAlpha('--ring'),
        sage: {
          DEFAULT: withAlpha('--sage'),
          foreground: 'var(--sage-foreground)',
        },
        clay: {
          DEFAULT: withAlpha('--clay'),
          foreground: 'var(--clay-foreground)',
        },
        ink: withAlpha('--ink'),
        cream: withAlpha('--cream'),
        forest: withAlpha('--forest'),
        'vireo-green': withAlpha('--vireo-green'),
        vc: {
          canvas: 'rgb(var(--vc-canvas-rgb) / <alpha-value>)',
          surface1: 'rgb(var(--vc-surface-1-rgb) / <alpha-value>)',
          surface2: 'rgb(var(--vc-surface-2-rgb) / <alpha-value>)',
          surface3: 'rgb(var(--vc-surface-3-rgb) / <alpha-value>)',
          border: 'var(--vc-border)',
          'border-strong': 'var(--vc-border-strong)',
          'text-primary': 'var(--vc-text-primary)',
          'text-secondary': 'var(--vc-text-secondary)',
          'text-muted': 'var(--vc-text-muted)',
          ai: 'var(--vc-accent-ai)',
          'ai-hover': 'var(--vc-accent-ai-hover)',
          success: 'var(--vc-success)',
          warning: 'var(--vc-warning)',
          destructive: 'var(--vc-destructive)',
          action: 'rgb(var(--vc-action-primary-rgb) / <alpha-value>)',
          'action-foreground': 'var(--vc-action-primary-text)',
        },
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        lift: 'var(--shadow-lift)',
        sage: 'var(--shadow-sage)',
        clay: 'var(--shadow-clay)',
        ink: 'var(--shadow-ink)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
