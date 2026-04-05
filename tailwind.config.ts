import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          muted: "hsl(var(--primary-muted))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          hover: "hsl(var(--accent-hover))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          border: "hsl(var(--card-border))",
        },
        border: "hsl(var(--border))",
        success: {
          DEFAULT: "hsl(var(--success))",
          muted: "hsl(var(--success-muted))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          muted: "hsl(var(--error-muted))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          muted: "hsl(var(--warning-muted))",
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['SF Mono', 'SFMono-Regular', 'JetBrains Mono', 'Consolas', 'Liberation Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.025em', fontWeight: '500' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.015em', fontWeight: '400' }],
        'base': ['0.875rem', { lineHeight: '1.5rem', letterSpacing: '0.01em', fontWeight: '400' }],
        'lg': ['1rem', { lineHeight: '1.75rem', letterSpacing: '0.005em', fontWeight: '400' }],
        'xl': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '0', fontWeight: '500' }],
        '2xl': ['1.375rem', { lineHeight: '2rem', letterSpacing: '-0.01em', fontWeight: '500' }],
        '3xl': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em', fontWeight: '600' }],
        '5xl': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.04em', fontWeight: '600' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      borderWidth: {
        '3': '3px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgb(0 0 0 / 0.3)',
        'card': '0 2px 8px 0 rgb(0 0 0 / 0.4), 0 4px 16px 0 rgb(0 0 0 / 0.2)',
        'elevated': '0 4px 12px 0 rgb(0 0 0 / 0.5), 0 8px 24px 0 rgb(0 0 0 / 0.25)',
        'pink-glow': '0 0 20px hsl(var(--primary) / 0.12), 0 0 40px hsl(var(--primary) / 0.04)',
        'pink-glow-lg': '0 0 30px hsl(var(--primary) / 0.18), 0 0 60px hsl(var(--primary) / 0.06)',
        'pink-glow-sm': '0 0 12px hsl(var(--primary) / 0.1)',
        'success-glow': '0 0 16px hsl(var(--success) / 0.1)',
        'error-glow': '0 0 16px hsl(var(--error) / 0.1)',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out both',
        'slide-up': 'slideUp 0.4s ease-out both',
        'slide-in-left': 'slideInLeft 0.3s ease-out both',
        'slide-in-right': 'slideInRight 0.3s ease-out both',
        'scale-in': 'scaleIn 0.2s ease-out both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 8px hsl(var(--primary) / 0.25), 0 0 24px hsl(var(--primary) / 0.1)' },
          '100%': { boxShadow: '0 0 14px hsl(var(--primary) / 0.35), 0 0 40px hsl(var(--primary) / 0.15)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
