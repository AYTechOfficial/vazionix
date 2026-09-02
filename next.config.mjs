/** @type {import('next').NextConfig} */

/* ============================================================================
   NEXT CONFIG
   ----------------------------------------------------------------------------
   SECURITY HEADERS, AND WHY THERE IS NO CONTENT-SECURITY-POLICY
   ----------------------------------------------------------------------------
   Everything below is a header that can be set without knowing what an ad network
   will do. A `Content-Security-Policy` is deliberately NOT set, and that is a
   decision rather than an omission.

   This product's primary revenue is third-party ad tags. Adsterra, AdsLab and
   every network like them serve `document.write`-era scripts from rotating CDN
   hostnames, load further scripts from hosts they do not publish in advance, and
   inject inline handlers. A `script-src` broad enough to serve them
   (`'unsafe-inline' 'unsafe-eval' https:`) provides no protection worth the header;
   a narrow one silently kills fill rate, the failure mode being an empty slot with
   a console error nobody notices for a week.

   The control that actually works here is isolation, not an allowlist. Display tags
   render inside an iframe whose `sandbox` withholds `allow-same-origin` (see
   `src/components/ads/AdUnit.tsx`), so the tag cannot read the session cookie or
   reach the parent DOM, and the session cookie is httpOnly on top of that. Overlay
   formats — social bar, popunder, in-page push — do load into the page document
   because that is their entire function, and they are blocked from `/withdraw` and
   `/admin` by `overlayBlockedRoutes`.

   If you add a CSP later, run it report-only for a week with the slots filled and
   build the allowlist from the violation reports. Writing one from the networks'
   own documentation does not work; they under-declare.
   ========================================================================== */

const securityHeaders = [
  /* Stops a response with a wrong Content-Type being sniffed into script. */
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  /* Full referrer same-origin, bare origin cross-origin: ad networks can attribute
     traffic without receiving the authenticated path the user was on. */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  /* We ask for none of these. Denying them explicitly means an injected ad script
     cannot prompt for them either. */
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },

  /* Nothing here should be framed by another origin, and a framed withdraw page is
     a phishing surface. Our own ad iframes are the other direction and unaffected. */
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

  /* Only meaningful over HTTPS, which is the only way this should be served. */
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,

  /* The Firebase Admin SDK is Node-only. Marking it external keeps the server
     bundle from trying to bundle its optional native and gRPC dependencies. */
  serverExternalPackages: ['firebase-admin'],

  experimental: {
    /* framer-motion and lucide-react both ship large barrel files; this rewrites
       `import { X } from 'lucide-react'` into a deep import at build time. */
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  /* The build must fail on a type error. A payouts product that ships one because
     the build was told to ignore it is a payouts product that ships a wrong
     balance. */
  typescript: { ignoreBuildErrors: false },

  /* No `X-Powered-By: Next.js`: free information for an attacker, no value to us. */
  poweredByHeader: false,

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        /* Every API route is per-user and authenticated. A CDN caching one would
           serve one user's balance to another, so this is belt-and-braces alongside
           the header the route handlers already set. */
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
