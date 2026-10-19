'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import {
  ADSLAB_BANNER_JS,
  ADSLAB_BANNER_UNITS,
  adsterraSnippetForSize,
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

  const [width, height] = size.split('x').map(Number) as [number, number];

  return (
    <div
      key={`${containerId}-${pathname}`}
      id={containerId}
      className={className}
      style={{ width, height, maxWidth: '100%', margin: '0 auto' }}
    />
  );
}

/* ---- NO-FILL DETECTION + ADSTERRA FALLBACK --------------------------------
   The AdsLab loader is fire-and-forget: when it has nothing for a slot it
   leaves the container div permanently empty, with no callback to react to.
   The only reliable signal is the DOM itself — after the loader has had time
   to act, if OUR container still has no children, the slot is dead inventory
   and the Adsterra banner of the same size takes it instead.

   `AdslabBannerWithFallback` wraps the plain banner and performs that check.
   Rendered by AdUnit instead of the bare AdslabBanner whenever a fallback is
   configured. The check runs once per mount to avoid re-bidding loops, and
   only considers Adsterra "configured" when the env key for THIS size exists,
   so a size AdsLab reliably carries on hands is not second-guessed with a
   wrong-size creative. */
export function AdslabBannerWithFallback({
  size,
  placement,
  className,
}: {
  size: AdslabBannerSize;
  placement?: string;
  className?: string;
}) {
  const fallbackHtml = React.useMemo(() => adsterraSnippetForSize(size), [size]);

  if (!fallbackHtml) return <AdslabBanner size={size} placement={placement} className={className} />;

  return (
    <AdslabNoFillWatch size={size} placement={placement} className={className} fallbackHtml={fallbackHtml} />
  );
}

function AdslabNoFillWatch({
  size,
  placement,
  className,
  fallbackHtml,
}: {
  size: AdslabBannerSize;
  placement?: string;
  className?: string;
  fallbackHtml: string;
}) {
  const pathname = usePathname();
  /* Remount per route, matching AdslabBanner's own lifecycle: the checked
     container is freshly queued by AdsLab after navigation. */
  const watchKey = `${placement ?? 'default'}-${pathname}`;

  return (
    <AdslabNoFillWatchInner key={watchKey} size={size} placement={placement} className={className} fallbackHtml={fallbackHtml} />
  );
}

/* The DOM id AdslabBanner computes for a given size+placement. Duplicated here
   deliberately: the watcher must find the exact div AdsLab queues into, and it
   is built from the ADSLAB_BANNER_UNITS id + sanitized placement, not an
   attribute we would have to also remember to set. */
const adslabContainerId = (size: AdslabBannerSize, placement?: string): string => {
  const unit = ADSLAB_BANNER_UNITS[size];
  return `adslab-${unit}-${(placement ?? 'default').replace(/[^a-zA-Z0-9-]/g, '-')}`;
};

function AdslabNoFillWatchInner({
  size,
  placement,
  className,
  fallbackHtml,
}: {
  size: AdslabBannerSize;
  placement?: string;
  className?: string;
  fallbackHtml: string;
}) {
  const [noFill, setNoFill] = React.useState(false);

  React.useEffect(() => {
    /* AdsLab loaders typically resolve within a second; two staggered checks
       (2s, 5s) cover slow networks without keeping a huge timer around. */
    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        /* The container is located by the same id AdslabBanner derives (see
           adslabContainerId) — that is the div the loader queues into. */
        const host = document.getElementById(adslabContainerId(size, placement));
        if (!host) return;
        if (host.childElementCount === 0) setNoFill(true);
      }, delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [size, placement]);

  if (noFill) {
    /* Reuse AdUnit's sandboxed renderer indirectly: embed the Adsterra snippet
       in a local iframe with the same sandbox permissions. *The important
       contract is no page-document access, which the sandbox enforces.* */
    const [width, height] = size.split('x').map(Number) as [number, number];
    const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}</style>
</head><body>${fallbackHtml}</body></html>`;
    return (
      <iframe
        title={`Advertisement ${size}`}
        srcDoc={doc}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
        referrerPolicy="no-referrer-when-downgrade"
        scrolling="no"
        className={className}
        style={{ width, height, maxWidth: '100%', border: '0', background: 'transparent' }}
      />
    );
  }

  /* Not yet failed: render the plain AdsLab banner. When it fills, the effect
     sees child elements and never flips. */
  return <AdslabBanner size={size} placement={placement} className={className} />;
}