import type { MetadataRoute } from 'next';

import { brand } from '@/lib/brand';

/* ============================================================================
   SITEMAP
   ----------------------------------------------------------------------------
   Only the three routes a crawler can actually render: the landing page and the
   two auth pages. Everything else in the product requires a session and returns a
   redirect, and listing a redirect in a sitemap is how you get it reported as a
   soft 404.

   `lastModified` is the build time rather than `new Date()` at request time. This
   route is statically generated, so a per-request date would claim the content
   changed on every crawl and teach the crawler to ignore the field.
   ========================================================================== */

const BUILT_AT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: brand.url,
      lastModified: BUILT_AT,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${brand.url}/register`,
      lastModified: BUILT_AT,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${brand.url}/login`,
      lastModified: BUILT_AT,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
