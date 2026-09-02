import type { Config } from 'tailwindcss';

/* ============================================================================
   TAILWIND ↔ DESIGN TOKEN BRIDGE
   ----------------------------------------------------------------------------
   src/styles/tokens.css is the contract. This file's ONLY job is to make every
   token reachable from a utility class, so that:

     bg-surface-1  →  background-color: var(--surface-1)
     text-text-2   →  color: var(--text-2)
     rounded-md    →  border-radius: var(--r-md)
     font-mono     →  font-family: var(--font-mono)
     p-5           →  padding: var(--s-5)
     shadow-lg     →  box-shadow: var(--shadow-lg)
     ease-out      →  transition-timing-function: var(--e-out)

   Consequences of pointing Tailwind at raw CSS variables rather than at
   channel triplets:
   • There is exactly ONE source of truth, and the light theme costs nothing —
     [data-theme='light'] repoints the variables and every utility follows.
   • Opacity modifiers (bg-mint/40) do NOT work, because the value is an opaque
     `var()` and not `<r> <g> <b>`. That is a deliberate trade: the token system
     already ships pre-mixed dim variants (--mint-dim, --danger-dim, …) for
     exactly the places a designer would otherwise reach for an alpha modifier,
     and those are colour-corrected per theme in a way `/40` never could be.
     Use `bg-mint-dim`, not `bg-mint/12`.

   Anything that needs a colour and is not in this file is a bug.
   ========================================================================== */

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        /* ---- surfaces ---------------------------------------------------- */
        bg: 'var(--bg)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          inset: 'var(--surface-inset)',
        },

        /* ---- hairlines (the primary depth mechanic) ---------------------- */
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          accent: 'var(--line-accent)',
        },

        /* ---- text -------------------------------------------------------- */
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          inverse: 'var(--text-inverse)',
          'on-mint': 'var(--text-on-mint)',
        },

        /* ---- signature accent -------------------------------------------- */
        mint: {
          DEFAULT: 'var(--mint)',
          hover: 'var(--mint-hover)',
          press: 'var(--mint-press)',
          dim: 'var(--mint-dim)',
          'dim-2': 'var(--mint-dim-2)',
        },
        /* `text` variants exist because violet and blue are too dark to read
           as type on near-black; in light mode they collapse to the base hue. */
        violet: {
          DEFAULT: 'var(--violet)',
          dim: 'var(--violet-dim)',
          line: 'var(--violet-line)',
          text: 'var(--violet-text)',
        },
        blue: { DEFAULT: 'var(--blue)', dim: 'var(--blue-dim)', text: 'var(--blue-text)' },

        /* ---- semantic ----------------------------------------------------- */
        success: { DEFAULT: 'var(--success)', dim: 'var(--success-dim)', line: 'var(--success-line)' },
        warning: { DEFAULT: 'var(--warning)', dim: 'var(--warning-dim)', line: 'var(--warning-line)' },
        danger: {
          DEFAULT: 'var(--danger)',
          dim: 'var(--danger-dim)',
          line: 'var(--danger-line)',
          hover: 'var(--danger-hover)',
        },
        info: { DEFAULT: 'var(--info)', dim: 'var(--info-dim)', line: 'var(--info-line)' },
        neutral: { dim: 'var(--neutral-dim)' },
        scrim: 'var(--scrim)',
        'on-grad': 'var(--on-grad)',
        'on-danger': 'var(--on-danger)',
        'on-vivid': 'var(--on-vivid)',

        /* ---- advertising: its own hue family, on purpose ------------------ */
        sponsor: {
          DEFAULT: 'var(--sponsor)',
          dim: 'var(--sponsor-dim)',
          line: 'var(--sponsor-line)',
        },

        /* ---- focus + glass ------------------------------------------------ */
        focus: 'var(--focus)',
        glass: { bg: 'var(--glass-bg)', line: 'var(--glass-line)', 'line-top': 'var(--glass-line-top)' },
      },

      /* ---- SPACE — 4px base. Keys match Tailwind's own numeric scale so the
         familiar `p-4` / `gap-3` reads identically, but resolves to a token. */
      spacing: {
        1: 'var(--s-1)',
        2: 'var(--s-2)',
        3: 'var(--s-3)',
        4: 'var(--s-4)',
        5: 'var(--s-5)',
        6: 'var(--s-6)',
        8: 'var(--s-8)',
        10: 'var(--s-10)',
        12: 'var(--s-12)',
        16: 'var(--s-16)',
        20: 'var(--s-20)',
        24: 'var(--s-24)',
        32: 'var(--s-32)',
        topbar: 'var(--topbar-h)',
        sidebar: 'var(--sidebar-w)',
        'sidebar-collapsed': 'var(--sidebar-w-collapsed)',
        row: 'var(--row-h)',
        'row-compact': 'var(--row-h-compact)',
      },

      /* ---- RADIUS — three, plus pill. No other radii exist. -------------- */
      borderRadius: {
        none: '0',
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        full: 'var(--r-pill)',
      },

      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        sans: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },

      /* ---- TYPE — strict scale. `text-14` not `text-sm`, so the token used
         is legible at the call site and an off-scale size is impossible. */
      fontSize: {
        11: ['var(--t-11)', { lineHeight: '1.4' }],
        12: ['var(--t-12)', { lineHeight: '1.45' }],
        13: ['var(--t-13)', { lineHeight: '1.5' }],
        14: ['var(--t-14)', { lineHeight: 'var(--lh-body)' }],
        16: ['var(--t-16)', { lineHeight: 'var(--lh-body)' }],
        20: ['var(--t-20)', { lineHeight: 'var(--lh-snug)' }],
        24: ['var(--t-24)', { lineHeight: 'var(--lh-snug)' }],
        32: ['var(--t-32)', { lineHeight: '1.1' }],
        48: ['var(--t-48)', { lineHeight: 'var(--lh-tight)' }],
        64: ['var(--t-64)', { lineHeight: 'var(--lh-tight)' }],
        80: ['var(--t-80)', { lineHeight: 'var(--lh-tight)' }],
      },
      lineHeight: {
        tight: 'var(--lh-tight)',
        snug: 'var(--lh-snug)',
        body: 'var(--lh-body)',
      },
      letterSpacing: {
        tight: 'var(--tr-tight)',
        snug: 'var(--tr-snug)',
        wide: 'var(--tr-wide)',
      },

      /* ---- ELEVATION — overlays only. Depth in-page comes from surface +
         hairline; a drop shadow is invisible on near-black. ---------------- */
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        mint: 'var(--shadow-mint)',
        'glass-inset': 'var(--glass-inset)',
        focus: 'var(--focus-ring)',
        none: 'none',
      },

      backgroundImage: {
        'grad-signature': 'var(--grad-signature)',
        'grad-soft': 'var(--grad-soft)',
        'grad-text': 'var(--grad-text)',
      },

      transitionTimingFunction: {
        out: 'var(--e-out)',
        'in-out': 'var(--e-in-out)',
        spring: 'var(--e-spring)',
        DEFAULT: 'var(--e-out)',
      },
      transitionDuration: {
        fast: 'var(--d-fast)',
        base: 'var(--d-base)',
        slow: 'var(--d-slow)',
        DEFAULT: 'var(--d-base)',
      },

      maxWidth: { content: 'var(--content-max)', prose: 'var(--prose-max)' },
      zIndex: {
        sticky: 'var(--z-sticky)',
        drawer: 'var(--z-drawer)',
        overlay: 'var(--z-overlay)',
        toast: 'var(--z-toast)',
        palette: 'var(--z-palette)',
      },

      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        'toast-out': { to: { opacity: '0', transform: 'translateY(8px) scale(0.97)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: { from: { backgroundPosition: '100% 0' }, to: { backgroundPosition: '-100% 0' } },
        'geo-ping': {
          '0%': { opacity: '.55', transform: 'scale(1)' },
          '70%,100%': { opacity: '0', transform: 'scale(2.1)' },
        },
        typing: {
          '0%,60%,100%': { opacity: '0.28', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-3px)' },
        },
        'delta-float': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          '30%': { opacity: '1' },
          to: { opacity: '0', transform: 'translateY(-14px)' },
        },
        'bal-bump': {
          '0%': { borderColor: 'var(--line)' },
          '25%': { borderColor: 'var(--mint)', backgroundColor: 'var(--mint-dim)' },
          '100%': { borderColor: 'var(--line)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 320ms var(--e-spring)',
        'toast-out': 'toast-out 200ms var(--e-out) forwards',
        'fade-in': 'fade-in var(--d-base) var(--e-out)',
        'pop-in': 'pop-in 180ms var(--e-out)',
        'page-in': 'page-in 320ms var(--e-out)',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'geo-ping': 'geo-ping 2.6s ease-out infinite',
        typing: 'typing 1.1s infinite',
        'delta-float': 'delta-float 1400ms var(--e-out) forwards',
        'bal-bump': 'bal-bump 700ms var(--e-out)',
      },
    },
  },
  plugins: [],
};

export default config;
