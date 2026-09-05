'use client';

import * as React from 'react';
import { ArrowUpRight, Clock, Coins, Repeat, RefreshCw, Smartphone, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { normaliseTasks, TASK_TABS, type AdslabTask, type TaskTab } from '@/lib/adslab/tasks';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { AdUnit } from '@/components/ads/AdUnit';

/* ============================================================================
   TASK WALL
   ----------------------------------------------------------------------------
   Fetches through OUR proxy (`/api/tasks`), never AdsLab directly: their task URL
   embeds the Publisher API Key, so a browser fetch would publish it.

   CREDIT DOES NOT HAPPEN HERE. Opening a task pays nothing. The balance moves
   only when AdsLab posts back to /api/adslab/postback with a valid signature,
   which is why the copy says "credited automatically" and there is no optimistic
   number anywhere in this component.

   The tracking URL is opened EXACTLY as received — see lib/adslab/tasks.ts.
   ========================================================================== */

const CACHE_MS = 60_000;

interface CacheEntry {
  tasks: AdslabTask[];
  at: number;
}

export function TaskWall() {
  const [tab, setTab] = React.useState<TaskTab>('all');
  const [tasks, setTasks] = React.useState<AdslabTask[]>([]);
  const [state, setState] = React.useState<'idle' | 'loading' | 'error' | 'unconfigured'>('loading');
  const [message, setMessage] = React.useState<string | null>(null);
  const cache = React.useRef<Partial<Record<TaskTab, CacheEntry>>>({});

  const load = React.useCallback(
    async (which: TaskTab, force = false) => {
      const hit = cache.current[which];
      if (!force && hit && Date.now() - hit.at < CACHE_MS) {
        setTasks(hit.tasks);
        setState('idle');
        return;
      }

      setState('loading');
      setMessage(null);
      try {
        const res = await fetch(`/api/tasks?type=${encodeURIComponent(which)}`, {
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; tasks?: unknown; error?: string; code?: string }
          | null;

        if (res.status === 503 || body?.code === 'unconfigured') {
          setState('unconfigured');
          setTasks([]);
          return;
        }
        if (!res.ok || !body?.ok) {
          setState('error');
          setMessage(body?.error ?? 'Could not load tasks.');
          setTasks([]);
          return;
        }

        const list = normaliseTasks(body.tasks);
        cache.current[which] = { tasks: list, at: Date.now() };
        setTasks(list);
        setState('idle');
      } catch {
        setState('error');
        setMessage('Network problem. Try again.');
        setTasks([]);
      }
    },
    [],
  );

  React.useEffect(() => {
    void load(tab);
  }, [tab, load]);

  /* Re-check on tab focus: a wall left open for an hour is stale inventory, and a
     completed task should disappear when they come back. */
  React.useEffect(() => {
    const onFocus = () => void load(tab, true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tab, load]);

  const totalReward = tasks.reduce((sum, t) => sum + t.reward, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TASK_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              'rounded-sm border px-3 py-1.5 text-12 font-semibold transition-colors duration-fast',
              tab === t.id
                ? 'border-mint-line bg-mint-dim text-mint'
                : 'border-line bg-surface-2 text-text-3 hover:text-text-2',
            )}
          >
            {t.label}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-2">
          {tasks.length > 0 ? (
            <Pill tone="mint">
              {tasks.length} live · ${totalReward.toFixed(4)}
            </Pill>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load(tab, true)}
            disabled={state === 'loading'}
          >
            <RefreshCw aria-hidden="true" className={cn('size-4', state === 'loading' && 'animate-spin')} />
            Refresh
          </Button>
        </span>
      </div>

      <AdUnit placement="tasks.inGrid" />

      {state === 'loading' ? (
        <Card>
          <CardBody className="grid place-items-center py-16">
            <span
              aria-hidden="true"
              className="size-6 animate-spin rounded-full border-2 border-line border-t-mint"
            />
            <p className="mt-3 text-13 text-text-3">Loading tasks…</p>
          </CardBody>
        </Card>
      ) : state === 'unconfigured' ? (
        <EmptyState
          art="inbox"
          title="Tasks are not configured yet"
          body="Set ADSLAB_API_KEY, ADSLAB_SECRET_KEY and NEXT_PUBLIC_ADSLAB_TASK, then reload. The wall fills itself from AdsLab once those are present."
        />
      ) : state === 'error' ? (
        <EmptyState
          art="inbox"
          title="Could not load tasks"
          body={message ?? 'Try again in a moment.'}
          action={
            <Button variant="secondary" onClick={() => void load(tab, true)}>
              Try again
            </Button>
          }
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          art="inbox"
          title="No tasks available right now"
          body="AdsLab fills this from live inventory for your country. Check another category, or come back later — it changes through the day."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      )}

      <AdUnit placement="tasks.native" />
    </div>
  );
}

function TaskCard({ task }: { task: AdslabTask }) {
  return (
    <li>
      <Card className="flex h-full flex-col">
        <CardBody className="flex flex-1 flex-col gap-3">
          <div className="flex items-start gap-3">
            {task.icon ? (
              /* Provider artwork on an arbitrary CDN: a plain <img> avoids adding
                 every AdsLab advertiser domain to next.config images. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={task.icon}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                className="size-10 flex-none rounded-sm border border-line object-cover"
              />
            ) : (
              <span className="grid size-10 flex-none place-items-center rounded-sm border border-line bg-surface-2 text-12 font-semibold text-text-3">
                {task.title.slice(0, 2).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-semibold text-text">{task.title}</p>
              {task.type ? <p className="text-11 uppercase tracking-wide text-text-3">{task.type}</p> : null}
            </div>

            <Pill tone="mint" className="flex-none">
              <Coins aria-hidden="true" className="size-3" />${task.reward.toFixed(4)}
            </Pill>
          </div>

          {task.description ? (
            <p className="line-clamp-3 text-12 leading-body text-text-3">{task.description}</p>
          ) : null}

          <ul className="flex flex-wrap gap-1.5">
            {task.loi !== null ? <Meta icon={Clock}>{task.loi} min survey</Meta> : null}
            {task.duration !== null ? <Meta icon={Clock}>{task.duration}s view</Meta> : null}
            {task.cooldownMinutes !== null ? <Meta icon={Repeat}>every {task.cooldownMinutes}m</Meta> : null}
            {task.visitsPerUser !== null ? <Meta icon={Users}>{task.visitsPerUser} visits</Meta> : null}
            {task.dailyLimit !== null ? <Meta icon={Repeat}>{task.dailyLimit}/day</Meta> : null}
            {task.joinType ? <Meta icon={Users}>{task.joinType}</Meta> : null}
            {task.device ? <Meta icon={Smartphone}>{task.device}</Meta> : null}
          </ul>

          {task.goals.length > 0 ? (
            <ol className="flex flex-col gap-1 rounded-sm border border-line bg-surface-2 p-2">
              {task.goals.map((g, i) => (
                <li key={`${g.name}-${i}`} className="flex items-center justify-between gap-2 text-11">
                  <span className="min-w-0 truncate text-text-3">
                    {i + 1}. {g.name}
                  </span>
                  <span className="flex-none font-mono tabular text-mint">${g.reward.toFixed(4)}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-auto flex flex-col gap-1.5">
            {/* A plain <a>, not ButtonLink/next-Link: the tracking URL is an
                EXTERNAL provider URL and must be handed to the browser exactly as
                received. Routing it through the client router would rewrite it and
                break the conversion. */}
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm',
                'bg-mint px-3 text-13 font-semibold text-surface-0',
                'transition-opacity duration-fast hover:opacity-90',
              )}
            >
              Start task
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
            <p className="text-center text-11 text-text-3">
              Credited automatically when the provider confirms it.
            </p>
          </div>
        </CardBody>
      </Card>
    </li>
  );
}

function Meta({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1 rounded-[4px] border border-line bg-surface-2 px-1.5 py-0.5 text-11 text-text-3">
      <Icon aria-hidden="true" className="size-3" />
      {children}
    </li>
  );
}