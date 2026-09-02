'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { AD_FORMATS, formatDimensions, type AdFormatId } from '@/lib/ads/formats';
import { getPlacement, type PlacementId } from '@/lib/ads/placements';
import type { AdUnitConfig } from '@/lib/ads/config';
import { useAds } from './AdProvider';

/* ============================================================================
   AD UNIT — the single renderer for every ad in the product
   ----------------------------------------------------------------------------
   Two jobs, and only these two:

   1. RESERVE THE BOX, ALWAYS.
      The outer element is sized from the format registry before anything
      loads, so an unfilled slot and a filled slot occupy identical space.
      Pasting a live tag into the admin console never moves a pixel of the
      surrounding page. This is why the placeholder exists — not as decoration,
      but as a layout guarantee.

   2. SANDBOX THE TAG.
      Network snippets are `document.write`-era scripts. They go into an iframe
      with an explicit `sandbox` allowlist, never into the page document. The
      iframe grants `allow-scripts allow-popups allow-forms` but NOT
      `allow-same-origin`, which means the ad script:
        • cannot read the session cookie,
        • cannot reach into the parent DOM,
        • cannot call our API with the user's credentials.
      Popups are permitted because that is how a popunder and most CTAs work,
      and refusing them would halve the fill rate.

      One exception, `kind: 'script'` overlay formats (social bar, in-page
      push): those are *designed* to position themselves relative to the top
      document and do nothing inside an iframe. They load into the page, and the
      trade-off is stated at the call site in AdProvider rather than hidden.

   WHAT THIS COMPONENT DOES NOT DO
   No creative, no house ad, no invented advertiser. An unfilled slot shows its
   own dimensions and placement id in development, and collapses to a plain
   bordered box in production. Filling slots is an operational task, not a code
   change.
   ========================================================================== */

export interface AdUnitProps {
  placement: PlacementId;
  /** Override the registry format for this one instance. */
  format?: AdFormatId;
  className?: string;
  /** Suppress the label. For units inside an already-labelled container. */
  bare?: boolean;
}

/* ---- SANDBOXED FRAME -------------------------------------------------------
   `srcDoc` rather than a real URL: no extra network round-trip, and the frame
   inherits nothing from our origin. The <base target="_blank"> makes every
   click in the creative open a new tab, which is both what advertisers expect
   and what stops a creative from navigating the whole app away.            */
function SandboxedTag({
  html,
  width,
  height,
  title,
}: {
  html: string;
  width: number | null;
  height: number | null;
  title: string;
}) {
  const doc = React.useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8">
<base target="_blank">
<style>
  html,body{margin:0;padding:0;overflow:hidden;background:transparent}
  body{display:flex;align-items:center;justify-content:center}
  img,iframe,ins,div{max-width:100%}
</style></head><body>${html}</body></html>`,
    [html],
  );

  return (
    <iframe
      title={title}
      srcDoc={doc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
      referrerPolicy="no-referrer-when-downgrade"
      loading="lazy"
      scrolling="no"
      className="block border-0 bg-transparent"
      style={{
        width: width ? `${width}px` : '100%',
        height: height ? `${height}px` : '100%',
      }}
    />
  );
}

/* ---- CONTAINER LOADER ------------------------------------------------------
   For networks that want a real div in the page document plus an async loader
   (AdSense `<ins>`, some AdsLab zones). Cannot be sandboxed — the loader
   walks the parent DOM to find its container by id, which is exactly what the
   sandbox forbids. Used only when a network offers no iframe-able snippet. */
function ContainerTag({ src, containerId }: { src: string; containerId: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (loaded.current || !ref.current) return;
    loaded.current = true;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    ref.current.appendChild(script);

    return () => {
      script.remove();
    };
  }, [src]);

  return <div ref={ref} id={containerId} className="grid h-full w-full place-items-center" />;
}

/* ---- PLACEHOLDER -----------------------------------------------------------
   Not a house ad — a spec sheet. Shows the exact box the network tag will
   occupy, the format name, the dimensions, and the placement id to paste into
   the admin console. In production it renders as an empty bordered box (or
   nothing at all, if `showPlaceholders` is off).                           */
function Placeholder({
  format,
  placement,
  verbose,
}: {
  format: AdFormatId;
  placement: PlacementId;
  verbose: boolean;
}) {
  const spec = AD_FORMATS[format];

  if (!verbose) {
    return <div className="h-full w-full rounded-md border border-dashed border-line" aria-hidden />;
  }

  return (
    <div
      className={cn(
        'grid h-full w-full place-items-center gap-1 rounded-md border border-dashed border-line',
        'bg-surface-2/40 px-3 text-center',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-12 font-semibold text-text-3">{spec.label}</span>
        <span className="font-mono text-11 tabular-nums text-text-3">{formatDimensions(format)}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-wide text-text-3/70">{placement}</span>
      </div>
    </div>
  );
}

/* ---- LABEL -----------------------------------------------------------------
   Same word, same corner, same hue, on every paid unit in the product. A
   disclosure that moves around is not a disclosure.                        */
function AdLabel() {
  return (
    <span
      className={cn(
        'pointer-events-none absolute right-1.5 top-1.5 z-[2] inline-flex h-[16px] items-center rounded-[4px] px-[5px]',
        'border border-sponsor-line bg-sponsor-dim text-[9px] font-bold uppercase tracking-wide text-sponsor',
        'backdrop-blur-[6px]',
      )}
    >
      Ad
    </span>
  );
}

export function AdUnit({ placement, format: formatOverride, className, bare = false }: AdUnitProps) {
  const spec = getPlacement(placement);
  const { unitFor, behaviour, isExempt, noteImpression, isCapped } = useAds();

  const unit: AdUnitConfig | null = unitFor(placement);

  /* Desktop and mobile formats are both resolved up front; the choice between
     them is made by CSS, not JS, so the correct box is in the first paint. */
  const desktopFormat = formatOverride ?? spec.format;
  const mobileFormat = formatOverride ?? spec.mobileFormat;
  const desktop = AD_FORMATS[desktopFormat];
  const mobile = AD_FORMATS[mobileFormat];

  const capped = unit ? isCapped(placement, unit.capPerSession) : false;

  React.useEffect(() => {
    if (unit && !capped) noteImpression(placement);
  }, [unit, capped, placement, noteImpression]);

  /* Overlay and link formats occupy no document flow — they are mounted once
     by AdProvider, not here. Rendering a box for them would reserve space for
     something that never appears in it. */
  if (desktop.kind === 'overlay' || desktop.kind === 'link') return null;

  if (!behaviour.enabled || isExempt) return null;

  const live = unit && !capped;
  const showPlaceholder = !live && behaviour.showPlaceholders;
  if (!live && !behaviour.showPlaceholders) return null;

  /* CSS custom properties carry both sizes; the media query in globals.css
     switches which pair the box uses. Fluid formats get a min-height only. */
  const styleVars = {
    '--ad-w': desktop.width ? `${desktop.width}px` : '100%',
    '--ad-h': desktop.height ? `${desktop.height}px` : `${desktop.minHeight ?? 250}px`,
    '--ad-w-mobile': mobile.width ? `${mobile.width}px` : '100%',
    '--ad-h-mobile': mobile.height ? `${mobile.height}px` : `${mobile.minHeight ?? 250}px`,
  } as React.CSSProperties;

  return (
    <div
      className={cn('ad-slot relative mx-auto', className)}
      style={styleVars}
      data-placement={placement}
      data-format={desktopFormat}
      role="complementary"
      aria-label="Advertisement"
    >
      {live && !bare ? <AdLabel /> : null}

      {live && unit ? (
        unit.kind === 'container' && unit.src && unit.containerId ? (
          <ContainerTag src={unit.src} containerId={unit.containerId} />
        ) : unit.kind === 'html' && unit.html ? (
          <SandboxedTag
            html={unit.html}
            width={desktop.width}
            height={desktop.height}
            title={`Advertisement — ${desktop.label}`}
          />
        ) : unit.kind === 'script' && unit.src ? (
          /* A loader script with no snippet still needs a document to run in,
             so it is wrapped in the same sandbox as an html unit. */
          <SandboxedTag
            html={`<script src="${unit.src}" async></script>`}
            width={desktop.width}
            height={desktop.height}
            title={`Advertisement — ${desktop.label}`}
          />
        ) : null
      ) : showPlaceholder ? (
        <Placeholder
          format={desktopFormat}
          placement={placement}
          verbose={process.env.NODE_ENV !== 'production'}
        />
      ) : null}
    </div>
  );
}

/* ---- CONVENIENCE WRAPPERS --------------------------------------------------
   Sugar for the three shapes that appear most often, so a page reads
   `<AdRail placement="faucet.railTop" />` instead of repeating class strings.
   ========================================================================== */

/** Full-width horizontal unit, centred, with vertical rhythm. */
export const AdBanner = (props: AdUnitProps) => (
  <AdUnit {...props} className={cn('my-4', props.className)} />
);

/** Sidebar unit, sticky so it stays in view down a long page — the single
    biggest lever on sidebar CPM. */
export const AdRail = (props: AdUnitProps) => (
  <AdUnit {...props} className={cn('sticky top-[88px]', props.className)} />
);

/** Grid-cell unit, sized to sit inside a task card grid. */
export const AdCard = (props: AdUnitProps) => (
  <AdUnit {...props} className={cn('h-full w-full', props.className)} />
);
