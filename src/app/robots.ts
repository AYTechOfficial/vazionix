import type { MetadataRoute } from 'next';

import { brand } from '@/lib/brand';

/* ============================================================================
   ROBOTS
   ----------------------------------------------------------------------------
   The staff console, the API surface and the authenticated app are all
   disallowed. Two reasons, and only the first is obvious:

   1. None of it is useful in a search result — an authenticated page renders a
      redirect to a crawler.
   2. `/api/offerwall/*` is a postback endpoint. A crawler hitting it with no
      signature produces a stream of refused-conversion rows in the logs, which
      buries the real ones.

   `/suspended` is excluded because a page whose only content is "your account is
   suspended" is a bad first impression of the product in a result list.
   ========================================================================== */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/dashboard',
          '/account',
          '/withdraw',
          '/transactions',
          '/tickets',
          '/coupon',
          '/suspended',
        ],
      },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
