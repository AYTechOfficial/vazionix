import * as React from 'react';

import { cn } from '@/lib/utils';
import type { ReferralGeoPoint } from '@/lib/models';

/* ============================================================================
   GEO BUBBLES
   Replaces the live "Referral by country" choropleth, which renders every
   country in the same tint (i.e. shows nothing) under a 100→0 legend.

   The landmass is a deliberately abstract silhouette: a real topojson would
   add ~250KB for a decorative backdrop behind ten data points, and a
   recognisable-but-wrong world map invites people to read borders that are not
   there. Dots are sized by referral count and every one is a focusable button
   with an accessible name, so the data is reachable without a mouse.
   ========================================================================== */

export function GeoBubbles({
  points,
  height = 260,
  className,
}: {
  points: ReferralGeoPoint[];
  height?: number;
  className?: string;
}) {
  const maxN = Math.max(...points.map((p) => p.count), 1);

  return (
    <div
      className={cn('relative overflow-hidden rounded-sm bg-surface-inset', className)}
      style={{ height }}
    >
      <svg
        className="absolute inset-0 size-full opacity-90"
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g fill="var(--surface-2)" stroke="var(--line)" strokeWidth="0.15">
          <path d="M12 22 L20 17 L27 19 L30 25 L26 31 L21 33 L16 30 Z" />
          <path d="M27 37 L32 34 L36 39 L35 49 L31 55 L28 49 L26 42 Z" />
          <path d="M45 16 L54 13 L60 16 L58 22 L52 24 L46 22 Z" />
          <path d="M46 26 L54 25 L58 31 L56 42 L51 52 L46 44 L44 33 Z" />
          <path d="M60 14 L76 10 L88 15 L90 24 L82 30 L72 28 L62 24 Z" />
          <path d="M62 30 L72 31 L78 37 L74 44 L66 42 L61 36 Z" />
          <path d="M78 46 L86 44 L90 50 L86 55 L79 53 Z" />
        </g>
      </svg>

      <ul className="absolute inset-0 m-0 list-none p-0">
        {points.map((p) => {
          const s = 9 + (p.count / maxN) * 20;
          return (
            <li key={p.code}>
              <button
                type="button"
                data-tip={`${p.country} — ${p.count} referral${p.count === 1 ? '' : 's'}`}
                aria-label={`${p.country}: ${p.count} referrals`}
                className={cn(
                  'tip geo-pt absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full',
                  'border border-mint bg-mint-dim-2 transition-[transform,background-color] duration-base ease-spring',
                  'hover:z-[3] hover:scale-[1.22] hover:bg-mint focus-visible:z-[3] focus-visible:scale-[1.22]',
                )}
                style={{ left: `${p.x}%`, top: `${p.y}%`, width: s, height: s }}
              >
                <i className="size-1 rounded-full bg-mint" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
