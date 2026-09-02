'use client';

/* ============================================================================
   THEME
   ----------------------------------------------------------------------------
   Light mode is a genuine second theme in tokens.css, not an inverted
   afterthought, so switching is a single attribute flip on <html> and every
   token downstream re-points for free.

   No-flash strategy, in order of precedence:
   1. SSR. The root layout reads the `vazionix-theme` cookie and renders
      <html data-theme="…"> in the initial HTML. For a returning visitor there
      is no flash because there is no client work to do.
   2. Inline script (below). Runs before first paint, and covers the two cases
      the cookie cannot: a first-ever visitor (fall back to
      prefers-color-scheme) and a cookie/localStorage disagreement after the
      user switched in another tab.
   3. React. The provider only ever *reads* what 1 and 2 already established;
      it never sets the attribute on mount, which is what causes the classic
      dark→light→dark flash.

   NOTE ON FILE EXTENSION: the brief names this `src/lib/theme.ts`. It contains
   a React context provider, so it must be `.tsx`. Import path is unchanged
   (`@/lib/theme`).
   ========================================================================== */

import * as React from 'react';

export type Theme = 'dark' | 'light';

export const THEME_COOKIE = 'vazionix-theme';
export const THEME_STORAGE_KEY = 'vazionix-theme';
export const DEFAULT_THEME: Theme = 'dark';

/** One year, in seconds. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Serialised and injected via dangerouslySetInnerHTML in the root layout,
 * *before* any stylesheet-dependent paint. Kept deliberately tiny and
 * dependency-free — it has to parse and run in under a millisecond.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(dark|light)/);
var t=m?m[1]:(localStorage.getItem('${THEME_STORAGE_KEY}')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'${DEFAULT_THEME}'));
document.documentElement.setAttribute('data-theme',t);
document.documentElement.style.colorScheme=t;
}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  /** From the server-read cookie, so the first client render agrees with SSR. */
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);

  /* Reconcile once on mount with whatever the inline script actually decided.
     The script may have picked a different value than the cookie (first-ever
     visit, or another tab switched). We read the DOM rather than re-deriving,
     because the DOM is by definition what the user is looking at. */
  React.useEffect(() => {
    const applied = document.documentElement.getAttribute('data-theme');
    if (applied === 'dark' || applied === 'light') setThemeState(applied);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    const root = document.documentElement;

    /* Smooth cross-fade of every themed property, but scoped to the switch
       itself: a permanent global transition would make the very first paint
       animate and would fight route transitions. Reduced-motion users get the
       instant swap (the class's rules are disabled in tokens.css). */
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 340);

    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    setThemeState(next);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Private mode / storage disabled — the cookie below is the real store. */
    }
    // SameSite=Lax so the SSR read works on normal navigations without being
    // sent on cross-site requests.
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  }, [setTheme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
