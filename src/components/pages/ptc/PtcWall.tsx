'use client';

import * as React from 'react';
import { Clock, Megaphone, Timer } from 'lucide-react';

import { nf, relative } from '@/lib/format';
import type { PtcAdItem } from '@/lib/models';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Tabs } from '@/components/ui/Tabs';
import { TaskCard } from '@/components/ui/TaskCard';
import { AdCard } from '@/components/ads/AdUnit';
import { TimedTaskRunner } from '@/components/earn/TimedTaskRunner';

/* ============================================================================
   PTC WALL
   ----------------------------------------------------------------------------
   Type tabs with live counts, per-ad cooldown state, and a runner modal that
   holds the timer. A watched ad stays in the list showing "available in 22h"
   rather than vanishing — the live product silently removed it, which reads as a
   bug and generates "where did my ad go" tickets.

   An in-feed ad occupies the fourth grid cell. It is a real placement rather than
   a special case, so its size comes from the format registry and the cell does
   not reflow when a tag is pasted in.
   ========================================================================== */

const AD_CELL_INDEX = 3;

export interface PtcWallProps {
  ads: PtcAdItem[];
  byType: Record<string, number>;
}

type TypeFilter = 'all' | PtcAdItem['type'];

export function PtcWall({ ads: initialAds, byType }: PtcWallProps) {
  const [ads, setAds] = React.useState(initialAds);
  const [filter, setFilter] = React.useState<TypeFilter>('all');
  const [running, setRunning] = React.useState<PtcAdItem | null>(null);

  const onCredited = React.useCallback((itemId: string, availableAt: string) => {
    setAds((current) => current.map((ad) => (ad.id === itemId ? { ...ad, availableAt } : ad)));
  }, []);

  const visible = React.useMemo(
    () => (filter === 'all' ? ads : ads.filter((a) => a.type === filter)),
    [ads, filter],
  );

  const tabs = React.useMemo(
    () => [
      { value: 'all' as TypeFilter, label: 'All', count: ads.filter((a) => !a.availableAt).length },
      ...(['Window', 'Iframe', 'External', 'Youtube'] as const)
        .filter((type) => byType[type])
        .map((type) => ({ value: type as TypeFilter, label: type, count: byType[type] ?? 0 })),
    ],
    [ads, byType],
  );

  if (!ads.length) {
    return (
      <Card as="section" className="mt-5">
        <CardBody>
          <EmptyState
            art="search"
            title="No PTC campaigns yet"
            body="Campaigns appear here as advertisers buy views. If you run this site, add them in Admin → Modules → PTC."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Available now</CardTitle>
            <CardSub>
              {visible.filter((a) => !a.availableAt).length} ready ·{' '}
              {visible.filter((a) => a.availableAt).length} cooling down
            </CardSub>
          </div>
          {tabs.length > 1 ? (
            <Tabs items={tabs} value={filter} onValueChange={setFilter} label="Filter PTC ads by type" />
          ) : null}
        </CardHead>

        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((ad, index) => (
              <React.Fragment key={ad.id}>
                {index === AD_CELL_INDEX ? (
                  <li className="flex">
                    <AdCard placement="ptc.inGrid" />
                  </li>
                ) : null}
                <li className="flex">
                  <TaskCard
                    className="w-full"
                    exhausted={Boolean(ad.availableAt)}
                    title={ad.title}
                    desc={ad.description}
                    thumb={<Megaphone aria-hidden="true" className="size-[18px] text-text-2" />}
                    reward={nf(ad.tokens)}
                    meta={
                      <>
                        <Pill>{ad.type}</Pill>
                        <Pill icon={Timer}>{ad.seconds}s</Pill>
                        <Pill icon={Clock}>every {ad.cooldownHours}h</Pill>
                      </>
                    }
                    action={
                      ad.availableAt ? (
                        <span className="text-11 text-text-3">Back {relative(ad.availableAt)}</span>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => setRunning(ad)}>
                          Watch
                        </Button>
                      )
                    }
                  />
                </li>
              </React.Fragment>
            ))}
          </ul>
        </CardBody>
      </Card>

      {running ? (
        <TimedTaskRunner
          kind="ptc"
          item={{
            id: running.id,
            title: running.title,
            reward: running.tokens,
            seconds: running.seconds,
            type: running.type,
          }}
          open={Boolean(running)}
          onClose={() => setRunning(null)}
          onCredited={onCredited}
          beforePlacement="ptc.beforeView"
          afterPlacement="ptc.afterView"
        />
      ) : null}
    </>
  );
}
