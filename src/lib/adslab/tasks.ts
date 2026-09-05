/* ============================================================================
   ADSLAB TASK — normalised shape
   ----------------------------------------------------------------------------
   AdsLab's task payload is not consistent between categories: ids arrive as
   `id` or `_id`, titles as `title` or `name`, rewards as `reward` or
   `reward_usd`, artwork as `icon` or `image`. Rather than sprinkle `??` chains
   through the UI, everything is normalised once, here.

   THE ONE FIELD THAT IS NEVER TOUCHED IS `url`.
   It carries the conversion attribution. Rewriting, proxying or appending to it
   silently breaks the postback — the user completes the task and never gets paid.
   ========================================================================== */

export interface AdslabTask {
  id: string;
  title: string;
  description: string;
  /** USD, as AdsLab reports it. */
  reward: number;
  /** The tracking URL. Opened verbatim, never modified. */
  url: string;
  icon: string | null;
  type: string | null;
  /** Survey length-of-interview, minutes. */
  loi: number | null;
  /** PTC view duration, seconds. */
  duration: number | null;
  cooldownMinutes: number | null;
  visitsPerUser: number | null;
  dailyLimit: number | null;
  /** Telegram: 'join' | 'boost' | … */
  joinType: string | null;
  /** Multi-step offers: the per-goal breakdown. */
  goals: Array<{ name: string; reward: number }>;
  country: string | null;
  device: string | null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Map one raw task. Unknown shapes degrade to a renderable row rather than
    throwing — a provider adding a field must not blank the whole wall. */
export function normaliseTask(raw: unknown): AdslabTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id) ?? str(r._id) ?? null;
  const url = str(r.url) ?? str(r.link) ?? null;
  /* No id or no tracking URL means it cannot be attributed or opened, so it is
     not a task we can honestly show. */
  if (!id || !url) return null;

  const rawGoals = Array.isArray(r.goals) ? r.goals : [];

  return {
    id,
    title: str(r.title) ?? str(r.name) ?? 'Task',
    description: str(r.description) ?? str(r.desc) ?? '',
    reward: num(r.reward) ?? num(r.reward_usd) ?? 0,
    url,
    icon: str(r.icon) ?? str(r.image) ?? null,
    type: str(r.type) ?? str(r.category) ?? null,
    loi: num(r.loi),
    duration: num(r.duration),
    cooldownMinutes: num(r.cooldownMinutes) ?? num(r.cooldown_minutes),
    visitsPerUser: num(r.visitsPerUser) ?? num(r.visits_per_user),
    dailyLimit: num(r.dailyLimit) ?? num(r.daily_limit),
    joinType: str(r.joinType) ?? str(r.join_type),
    goals: rawGoals
      .map((g) => {
        if (!g || typeof g !== 'object') return null;
        const go = g as Record<string, unknown>;
        return {
          name: str(go.name) ?? str(go.title) ?? 'Step',
          reward: num(go.reward) ?? num(go.reward_usd) ?? 0,
        };
      })
      .filter((g): g is { name: string; reward: number } => g !== null),
    country: str(r.country),
    device: str(r.device) ?? str(r.platform),
  };
}

export function normaliseTasks(raw: unknown): AdslabTask[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normaliseTask).filter((t): t is AdslabTask => t !== null);
}

/** Category tabs, in the order they are shown. */
export const TASK_TABS = [
  { id: 'all', label: 'All' },
  { id: 'offers', label: 'Offers' },
  { id: 'surveys', label: 'Surveys' },
  { id: 'ptc', label: 'PTC' },
  { id: 'shortlinks', label: 'Shortlinks' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'reviews', label: 'Reviews' },
] as const;

export type TaskTab = (typeof TASK_TABS)[number]['id'];