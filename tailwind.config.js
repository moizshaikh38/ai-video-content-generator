/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        sage: {
          DEFAULT: 'var(--sage)',
          foreground: 'var(--sage-foreground)',
        },
        clay: {
          DEFAULT: 'var(--clay)',
          foreground: 'var(--clay-foreground)',
        },
        ink: 'var(--ink)',
        cream: 'var(--cream)',
        forest: 'var(--forest)',
        'vireo-green': 'var(--vireo-green)',
        vc: {
          canvas: 'var(--vc-canvas)',
          surface1: 'var(--vc-surface-1)',
          surface2: 'var(--vc-surface-2)',
          surface3: 'var(--vc-surface-3)',
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
          action: 'var(--vc-action-primary)',
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
