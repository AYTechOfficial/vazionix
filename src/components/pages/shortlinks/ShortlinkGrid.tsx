'use client';

import * as React from 'react';
import { Link2, Timer } from 'lucide-react';

import { nf, relative } from '@/lib/format';
import type { ShortlinkItem } from '@/lib/models';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { TaskCard } from '@/components/ui/TaskCard';
import { AdCard } from '@/components/ads/AdUnit';
import { TimedTaskRunner } from '@/components/earn/TimedTaskRunner';

/* ============================================================================
   SHORTLINK GRID
   ----------------------------------------------------------------------------
   Each link's destination is your monetised hop — the AdsLab or Adsterra direct
   link configured on that document in Admin → Modules → Shortlinks. The user
   passes through it, the server measures the dwell, and the reward is credited.
   That is the same inventory as `shortlink.directLink` in the ad placement map,
   expressed as an earning surface rather than a box.

   `used / cap` is per UTC day and comes from the ledger, not from a counter, so
   it cannot drift from what the user was actually paid for.
   ========================================================================== */

const AD_CELL_INDEX = 2;

export function ShortlinkGrid({ links: initialLinks }: { links: ShortlinkItem[] }) {
  const [links, setLinks] = React.useState(initialLinks);
  const [running, setRunning] = React.useState<ShortlinkItem | null>(null);

  const onCredited = React.useCallback((itemId: string, availableAt: string) => {
    setLinks((current) =>
      current.map((link) =>
        link.id === itemId ? { ...link, availableAt, used: link.used + 1 } : link,
      ),
    );
  }, []);

  if (!links.length) {
    return (
      <Card as="section" className="mt-5">
        <CardBody>
          <EmptyState
            art="search"
            title="No shortlinks configured"
            body="Add your AdsLab or Adsterra direct links in Admin → Modules → Shortlinks. Each one becomes a paid task here."
          />
        </CardBody>
      </Card>
    );
  }

  const ready = links.filter((l) => !l.availableAt && l.used < l.cap);

  return (
    <>
      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Available links</CardTitle>
            <CardSub>
              {ready.length} ready · {links.length - ready.length} used or cooling down · resets 00:00 UTC
            </CardSub>
          </div>
        </CardHead>

        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {links.map((link, index) => {
              const exhausted = Boolean(link.availableAt) || link.used >= link.cap;
              return (
                <React.Fragment key={link.id}>
                  {index === AD_CELL_INDEX ? (
                    <li className="flex">
                      <AdCard placement="shortlinks.inGrid" />
                    </li>
                  ) : null}
                  <li className="flex">
                    <TaskCard
                      className="w-full"
                      exhausted={exhausted}
                      title={link.name}
                      desc={link.provider ? `via ${link.provider}` : undefined}
                      thumb={<Link2 aria-hidden="true" className="size-[18px] text-text-2" />}
                      reward={nf(link.reward)}
                      meta={
                        <>
                          <Pill icon={Timer}>{link.seconds}s</Pill>
                          <Pill tone={link.used >= link.cap ? 'neutral' : 'mint'}>
                            {link.used}/{link.cap} today
                          </Pill>
                        </>
                      }
                      action={
                        link.availableAt ? (
                          <span className="text-11 text-text-3">Back {relative(link.availableAt)}</span>
                        ) : link.used >= link.cap ? (
                          <span className="text-11 text-text-3">Cap reached</span>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => setRunning(link)}>
                            Open
                          </Button>
                        )
                      }
                    />
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {running ? (
        <TimedTaskRunner
          kind="shortlink"
          item={{
            id: running.id,
            title: running.name,
            reward: running.reward,
            seconds: running.seconds,
          }}
          open={Boolean(running)}
          onClose={() => setRunning(null)}
          onCredited={onCredited}
          beforePlacement="shortlinks.beforeRedirect"
          afterPlacement="shortlinks.inGrid"
        />
      ) : null}
    </>
  );
}
