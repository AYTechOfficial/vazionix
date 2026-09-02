'use client';

import * as React from 'react';
import { CheckCircle2, Droplet, Link2, Megaphone, Target, Users } from 'lucide-react';

import { compact, tokens as fmtTokens } from '@/lib/format';
import { ApiError, endpoints } from '@/lib/api';
import { useCoinBurst, usePrefersReducedMotion } from '@/lib/hooks';
import type { ChallengeItem } from '@/lib/models';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';
import { SourceIcon } from '@/components/ui/TaskCard';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';
import { AdCard } from '@/components/ads/AdUnit';

/* ============================================================================
   CHALLENGE GRID
   ----------------------------------------------------------------------------
   Progress is read from the same claim counters the ledger maintains, so a
   challenge can never report a count the ledger does not support. Claiming is a
   server call that re-verifies the count before crediting — the bar on screen is
   a display of the check, not the check itself.
   ========================================================================== */

const KIND = {
  referral: { icon: Users, tone: 'blue', href: '/referrals', label: 'Invite' },
  shortlink: { icon: Link2, tone: 'mint', href: '/shortlinks', label: 'Shortlinks' },
  ptc: { icon: Megaphone, tone: 'violet', href: '/ptc', label: 'PTC' },
  faucet: { icon: Droplet, tone: 'mint', href: '/faucet', label: 'Faucet' },
  offerwall: { icon: Target, tone: 'violet', href: '/offerwall', label: 'Offerwall' },
} as const;

type Filter = 'all' | 'ready' | 'open' | 'claimed';

export function ChallengeGrid({ initial }: { initial: ChallengeItem[] }) {
  const [items, setItems] = React.useState(initial);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [busy, setBusy] = React.useState<string | null>(null);

  const { applyClaim, setProfile } = useSession();
  const { toast } = useToast();
  const burst = useCoinBurst();
  const reduced = usePrefersReducedMotion();

  const claim = async (challenge: ChallengeItem, element: HTMLElement | null) => {
    if (busy) return;
    setBusy(challenge.id);
    try {
      const result = await endpoints.claimChallenge(challenge.id);
      setItems(result.challenges);
      applyClaim(result.credited, `${challenge.title} — ${fmtTokens(result.credited)} tokens`);
      if (result.profile) setProfile(result.profile);
      if (!reduced) burst(element);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not claim that challenge.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const visible = React.useMemo(() => {
    switch (filter) {
      case 'ready':
        return items.filter((c) => c.claimable);
      case 'open':
        return items.filter((c) => !c.claimed && !c.claimable);
      case 'claimed':
        return items.filter((c) => c.claimed);
      default:
        return items;
    }
  }, [items, filter]);

  if (!items.length) {
    return (
      <Card as="section" className="mt-5">
        <CardBody>
          <EmptyState
            art="search"
            title="No challenges running"
            body="Challenges are configured in Admin → Modules → Challenges. Each one reads its progress from your real claim counts."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card as="section" className="mt-5">
      <CardHead>
        <div className="min-w-0">
          <CardTitle>All challenges</CardTitle>
          <CardSub>Progress is read from your claim history, live</CardSub>
        </div>
        <Tabs
          label="Filter challenges"
          value={filter}
          onValueChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: items.length },
            { value: 'ready', label: 'Ready', count: items.filter((c) => c.claimable).length },
            { value: 'open', label: 'In progress', count: items.filter((c) => !c.claimed && !c.claimable).length },
            { value: 'claimed', label: 'Claimed', count: items.filter((c) => c.claimed).length },
          ]}
        />
      </CardHead>

      <CardBody>
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((c, index) => {
            const kind = KIND[c.kind] ?? KIND.faucet;
            const Icon = kind.icon;

            return (
              <React.Fragment key={c.id}>
                {index === 2 ? (
                  <li className="flex">
                    <AdCard placement="challenges.inGrid" />
                  </li>
                ) : null}
                <li className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4 transition-[border-color,background-color] duration-base ease-out hover:border-line-strong hover:bg-surface-2">
                  <div className="flex items-start gap-3">
                    <SourceIcon tone={kind.tone}>
                      <Icon aria-hidden="true" />
                    </SourceIcon>
                    <div className="min-w-0 flex-1">
                      <div className="text-14 font-semibold text-text">{c.title}</div>
                      {c.note ? <div className="text-11 text-text-3">{c.note}</div> : null}
                    </div>
                    {c.claimed ? (
                      <Pill tone="neutral" icon={CheckCircle2}>
                        Claimed
                      </Pill>
                    ) : c.claimable ? (
                      <Pill tone="mint" icon={CheckCircle2}>
                        Ready
                      </Pill>
                    ) : (
                      <Pill>{kind.label}</Pill>
                    )}
                  </div>

                  <div>
                    <ProgressBar value={c.at} max={c.of} label={`${c.title}: ${c.at} of ${c.of}`} />
                    <div className="mt-1.5 flex items-center justify-between text-11">
                      <span className="font-mono tabular text-text-3">
                        {c.at} / {c.of}
                      </span>
                      <span className="font-mono tabular text-mint">
                        {compact(c.tokens)} tokens · +{c.exp} exp
                      </span>
                    </div>
                  </div>

                  {c.claimed ? (
                    <span className="text-11 text-text-3">Reward already credited.</span>
                  ) : c.claimable ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="self-start"
                      disabled={busy === c.id}
                      onClick={(e) => claim(c, e.currentTarget)}
                    >
                      {busy === c.id ? 'Claiming…' : 'Claim reward'}
                    </Button>
                  ) : (
                    <ButtonLink href={kind.href} variant="secondary" size="sm" className="self-start">
                      Go to {kind.label}
                    </ButtonLink>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
