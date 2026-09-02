import type { Metadata, Viewport } from 'next';
import { Geist, Inter, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';

import './globals.css';
import { brand } from '@/lib/brand';
import { DEFAULT_THEME, THEME_COOKIE, THEME_INIT_SCRIPT, type Theme } from '@/lib/theme';
import { Providers } from './providers';

/* ============================================================================
   ROOT LAYOUT
   ----------------------------------------------------------------------------
   Fonts are self-hosted through next/font rather than a render-blocking CDN
   <link>: they are subset, preloaded, and served from our origin with a
   `size-adjust` fallback, so there is no FOUT and no layout shift. Each exposes a
   CSS variable that tokens.css points --font-display / --font-body / --font-mono
   at.

   JetBrains Mono carries every money value in the product. Tabular figures mean
   digits never jitter as a balance ticks up, and columns align on the decimal.

   Every user-visible string here resolves through `src/lib/brand.ts`, so a rename
   is one edit in that file plus the logo mark.
   ========================================================================== */

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  robots: { index: true, follow: true },
  openGraph: {
    siteName: brand.name,
    type: 'website',
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
  },
  twitter: { card: 'summary_large_image', site: brand.social.x },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08090C' },
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* Server-side theme read: for a returning visitor the correct theme is in the
     initial HTML, so there is nothing for the client to correct. */
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = cookieTheme === 'light' || cookieTheme === 'dark' ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: theme }}
      className={`${geist.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint. Covers first-ever visitors (system preference)
            and cross-tab drift, which the cookie alone cannot. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
