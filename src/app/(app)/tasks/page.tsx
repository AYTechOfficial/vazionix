import type { Metadata } from 'next';
import { Coins, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';

import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { TaskWall } from '@/components/pages/tasks/TaskWall';
import { adslabConfigured } from '@/lib/adslab/config';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   TASKS — the AdsLab task wall
   ----------------------------------------------------------------------------
   Offers, surveys, PTC, shortlinks, Telegram joins and app reviews, served from
   AdsLab's live inventory for the visitor's country.

   THE LIST IS FETCHED CLIENT-SIDE, THROUGH OUR OWN PROXY.
   Not because the browser should talk to AdsLab — it must not, their task URL
   embeds the Publisher API Key — but because the wall is per-country,
   per-session inventory that changes through the day. Rendering it on the server
   would either cache stale inventory or make every navigation wait on a
   third-party API. `/api/tasks` keeps the key server-side and stays uncached.

   NOTHING ON THIS PAGE CREDITS A BALANCE. Completion is confirmed by AdsLab's
   signed postback to /api/adslab/postback, which is the only thing that can move
   money. The copy says so plainly, because a user who thinks clicking paid them
   and sees no balance change opens a support ticket.
   ========================================================================== */

export default async function TasksPage() {
  await requireUser();

  return (
    <>
      <AdUnit placement="tasks.top" className="mb-4" />

      <PageHeader
        title="Tasks"
        sub="Offers, surveys, PTC and Telegram tasks — paid on confirmation"
      />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard
          label="How it pays"
          value="USD"
          icon={Coins}
          sub="converted to tokens at the live rate"
        />
        <StatCard
          label="Confirmation"
          value="Automatic"
          icon={ShieldCheck}
          sub="the provider tells us; nothing to submit"
        />
        <StatCard
          label="Inventory"
          value="Live"
          icon={Sparkles}
          sub="changes through the day, per country"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Available tasks</CardTitle>
                <CardSub>
                  {adslabConfigured
                    ? 'Open one in a new tab and finish it there. Come back and your balance updates on its own.'
                    : 'Set the AdsLab placement IDs to fill this wall.'}
                </CardSub>
              </div>
            </CardHead>
            <CardBody>
              <TaskWall />
            </CardBody>
          </Card>

          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Before you start</CardTitle>
                <CardSub>Three things that decide whether a task pays</CardSub>
              </div>
            </CardHead>
            <CardBody className="flex flex-col gap-3 text-13 leading-body text-text-3">
              <p className="flex gap-2">
                <ListChecks aria-hidden="true" className="mt-0.5 size-4 flex-none text-mint" />
                <span>
                  <strong className="font-semibold text-text-2">Finish every step.</strong> Multi-step
                  offers pay per goal, and a partial completion pays only the goals actually reached.
                </span>
              </p>
              <p className="flex gap-2">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 flex-none text-mint" />
                <span>
                  <strong className="font-semibold text-text-2">Use real details.</strong> Surveys and
                  offers are screened by the advertiser. A rejected completion is reversed, and the
                  reversal shows in Transactions like any other entry.
                </span>
              </p>
              <p className="flex gap-2">
                <Coins aria-hidden="true" className="mt-0.5 size-4 flex-none text-mint" />
                <span>
                  <strong className="font-semibold text-text-2">Credit can lag.</strong> Most confirm in
                  seconds; surveys and app installs can take minutes to hours. Nothing is lost while it
                  is pending — the postback arrives whenever the advertiser releases it.
                </span>
              </p>
            </CardBody>
          </Card>

          <AdBanner placement="tasks.bottom" />
        </div>

        <AdRail placement="tasks.rail" />
      </div>
    </>
  );
}