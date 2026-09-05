'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import {
  ADSLAB_BANNER_JS,
  ADSLAB_BANNER_UNITS,
  type AdslabBannerSize,
} from '@/lib/adslab/config';

/* ============================================================================
   ADSLAB BANNER UNIT
   ----------------------------------------------------------------------------
   The banner script is a SHARED loader: it reads a queue of {id, container}
   pairs off `window.adslab_banners` and fills each one. So the script tag is
   injected once per document, and each banner only pushes its own entry.

   THE CONTAINER RESERVES ITS EXACT SIZE. A banner that arrives after paint and
   pushes the page down is a layout shift the user feels and Core Web Vitals
   scores; reserving width/height means the fill is invisible.

   SPA ROUTE CHANGES: the loader fills a container once and does not re-run on
   client navigation. The `key` on the pathname remounts this component per route
   so a fresh container is queued instead of an empty div persisting.

   DO NOT MOUNT THE SAME SIZE TWICE ON ONE PAGE — the container id is derived from
   the unit id, so two would collide and only one would fill.
   ========================================================================== */

export function AdslabBanner({
  size,
  placement,
  className,
}: {
  size: AdslabBannerSize;
  /** Makes the container id unique when the same size appears twice on a page. */
  placement?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const unit = ADSLAB_BANNER_UNITS[size];
  /* The container id includes the placement because ONE page can legitimately
     show the same size in two slots (a rail and a footer). Two divs with the same
     id would leave the second permanently empty. */
  const containerId = `adslab-${unit}-${(placement ?? 'default').replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const queued = React.useRef(false);

  React.useEffect(() => {
    if (queued.current) return;
    queued.current = true;

    const w = window as unknown as { adslab_banners?: Array<{ id: string; container: string }> };
    w.adslab_banners = w.adslab_banners ?? [];
    w.adslab_banners.push({ id: unit, container: containerId });

    if (!document.getElementById('adslab-banner-js')) {
      const script = document.createElement('script');
      script.id = 'adslab-banner-js';
      script.src = ADSLAB_BANNER_JS;
      script.async = true;
      document.head.appendChild(script);
    }
  }, [unit, containerId, pathname]);

  const [width, height] = size.split('x').map(Number);

  return (
    <div
      key={`${containerId}-${pathname}`}
      id={containerId}
      className={className}
      style={{ width, height, maxWidth: '100%', margin: '0 auto' }}
    />
  );
}