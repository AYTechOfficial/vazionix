/* ============================================================================
   RBAC — roles, permissions, and the gate every admin surface passes through
   ----------------------------------------------------------------------------
   Ported verbatim from the HTML prototype's `src/admin/lib/rbac.js`: the same
   53 permissions in the same 7 groups, the same 5 roles, the same `danger`
   markings. What changes is that the catalogue is now TYPED — `Permission` is
   an exhaustive union rather than `string`, so `can(role, 'user.veiw')` is a
   compile error rather than a silent `false` that quietly opens a screen.

   WHERE THIS IS ENFORCED — READ THIS BEFORE TRUSTING IT
   -----------------------------------------------------
   Nothing in this file is a security control. It is the *shared vocabulary*
   for three layers that are:

     1. CLIENT GATE (UX only) — `<PermissionGate>` and the permission-filtered
        sidebar. It hides what you cannot do so you are not shown 40 screens
        that will refuse you. A determined caller edits the bundle.
     2. SERVER GUARD — `requirePermission()` in `src/lib/admin/guard.ts`, run
        in Server Components and Route Handlers. It verifies the session cookie
        with the Admin SDK and reads the custom claims off the *verified*
        token. THIS is the one that stops a request.
     3. DATA LAYER — `firestore.rules` (`hasPerm()`) and a permission re-check
        at the top of every callable in `functions/src/index.ts`. This is the
        layer that survives someone calling the Firestore REST API directly
        with a stolen ID token, bypassing our server entirely.

   Backed in production by Firebase Auth custom claims:
       { role: 'finance', perms: ['withdrawal.approve', ...], mfa: true }
   Claims ride inside the ID token, so a permission check costs zero document
   reads — which is exactly why they are cheap enough to repeat in all three
   layers.
   ========================================================================== */

/* ---- ROLE IDS -------------------------------------------------------------- */
export type AdminRole = 'super_admin' | 'admin' | 'finance' | 'moderator' | 'support';

/* ---- THE PERMISSION UNION --------------------------------------------------
   Hand-written rather than inferred, so the catalogue below can be checked
   AGAINST it in both directions (see `_catalogueIsExhaustive`). Inferring the
   union from the array alone would make a *missing* permission invisible: the
   union would simply shrink to match, and every call site would still compile.
   Writing it twice and asserting equality is the only version that catches
   both a typo and an omission.                                              */
export type Permission =
  /* Users — 9 */
  | 'user.view'
  | 'user.edit'
  | 'user.security'
  | 'user.note'
  | 'user.suspend'
  | 'user.ban'
  | 'user.delete'
  | 'user.export'
  | 'user.bulk'
  /* Money — 10 */
  | 'balance.view'
  | 'balance.adjust'
  | 'withdrawal.view'
  | 'withdrawal.approve'
  | 'withdrawal.batch'
  | 'withdrawal.reverse'
  | 'treasury.view'
  | 'rates.edit'
  | 'limits.edit'
  | 'accounting.export'
  /* Earning modules — 7 */
  | 'earn.view'
  | 'earn.edit'
  | 'earn.provider'
  | 'earn.recredit'
  | 'lottery.draw'
  | 'leaderboard.void'
  | 'coupon.manage'
  /* Advertising — 4 */
  | 'ads.view'
  | 'ads.edit'
  | 'ads.approve'
  | 'advertiser.manage'
  /* Support — 5 */
  | 'support.view'
  | 'support.reply'
  | 'support.assign'
  | 'kb.edit'
  | 'broadcast.send'
  /* Content & config — 5 */
  | 'content.edit'
  | 'coins.manage'
  | 'flags.edit'
  | 'maintenance.toggle'
  | 'seo.edit'
  /* Platform & security — 13 */
  | 'admin.view'
  | 'admin.manage'
  | 'roles.edit'
  | 'audit.view'
  | 'session.revoke'
  | 'security.config'
  | 'lockdown'
  | 'system.view'
  | 'keys.manage'
  | 'backup.run'
  | 'analytics.view'
  | 'kyc.review'
  | 'fraud.review';

export interface PermissionDef {
  id: Permission;
  label: string;
  /** Moves money, removes access, or destroys data. Renders with a warning
      treatment in the matrix editor and requires a typed confirmation at the
      call site (the prototype's `confirmDanger`). */
  danger?: boolean;
}

export interface PermissionGroup {
  /** Group heading, e.g. "Money". */
  g: string;
  items: readonly PermissionDef[];
}

/* ---- PERMISSION CATALOGUE --------------------------------------------------
   Grouped by domain. Order is load-bearing: the roles-and-permissions matrix
   editor renders in exactly this order, and so does the "your permissions"
   card on the command centre.                                              */
export const PERMISSIONS = [
  {
    g: 'Users',
    items: [
      { id: 'user.view', label: 'View users and profiles' },
      { id: 'user.edit', label: 'Edit profile fields' },
      { id: 'user.security', label: 'Reset password / disable 2FA' },
      { id: 'user.note', label: 'Add internal notes' },
      { id: 'user.suspend', label: 'Suspend account (temporary)', danger: true },
      { id: 'user.ban', label: 'Ban account (permanent)', danger: true },
      { id: 'user.delete', label: 'Hard-delete account (GDPR)', danger: true },
      { id: 'user.export', label: 'Export user data (GDPR)' },
      { id: 'user.bulk', label: 'Bulk actions on users', danger: true },
    ],
  },
  {
    g: 'Money',
    items: [
      { id: 'balance.view', label: 'View balances and ledgers' },
      { id: 'balance.adjust', label: 'Manually credit / debit tokens', danger: true },
      { id: 'withdrawal.view', label: 'View withdrawal queue' },
      { id: 'withdrawal.approve', label: 'Approve / reject withdrawals', danger: true },
      { id: 'withdrawal.batch', label: 'Batch-approve low-risk payouts', danger: true },
      { id: 'withdrawal.reverse', label: 'Reverse a processed payout', danger: true },
      { id: 'treasury.view', label: 'View reserve balances' },
      { id: 'rates.edit', label: 'Override conversion rates', danger: true },
      { id: 'limits.edit', label: 'Edit fees, minimums and caps', danger: true },
      { id: 'accounting.export', label: 'Export accounting reports' },
    ],
  },
  {
    g: 'Earning modules',
    items: [
      { id: 'earn.view', label: 'View earning module config' },
      { id: 'earn.edit', label: 'Edit rewards, cooldowns, quests' },
      { id: 'earn.provider', label: 'Manage provider keys and postbacks', danger: true },
      { id: 'earn.recredit', label: 'Re-credit / reverse a postback', danger: true },
      { id: 'lottery.draw', label: 'Trigger a lottery draw', danger: true },
      { id: 'leaderboard.void', label: 'Void leaderboard entries', danger: true },
      { id: 'coupon.manage', label: 'Create and deactivate coupons' },
    ],
  },
  {
    g: 'Advertising',
    items: [
      { id: 'ads.view', label: 'View ad inventory and revenue' },
      { id: 'ads.edit', label: 'Assign and rotate campaigns' },
      { id: 'ads.approve', label: 'Approve advertiser submissions' },
      { id: 'advertiser.manage', label: 'Manage advertiser accounts' },
    ],
  },
  {
    g: 'Support',
    items: [
      { id: 'support.view', label: 'View tickets and chat transcripts' },
      { id: 'support.reply', label: 'Reply and resolve tickets' },
      { id: 'support.assign', label: 'Assign and prioritise tickets' },
      { id: 'kb.edit', label: 'Edit AI knowledge base' },
      { id: 'broadcast.send', label: 'Send broadcasts and notifications', danger: true },
    ],
  },
  {
    g: 'Content & config',
    items: [
      { id: 'content.edit', label: 'Edit legal, FAQ and site content' },
      { id: 'coins.manage', label: 'Enable / disable supported coins', danger: true },
      { id: 'flags.edit', label: 'Toggle feature flags' },
      { id: 'maintenance.toggle', label: 'Enable maintenance mode', danger: true },
      { id: 'seo.edit', label: 'Edit SEO metadata' },
    ],
  },
  {
    g: 'Platform & security',
    items: [
      { id: 'admin.view', label: 'View admin staff and sessions' },
      { id: 'admin.manage', label: 'Invite, edit and deactivate admins', danger: true },
      { id: 'roles.edit', label: 'Edit the role permission matrix', danger: true },
      { id: 'audit.view', label: 'View the audit log' },
      { id: 'session.revoke', label: 'Revoke admin sessions', danger: true },
      { id: 'security.config', label: 'IP allowlist and anti-abuse config', danger: true },
      { id: 'lockdown', label: 'Break-glass platform lockdown', danger: true },
      { id: 'system.view', label: 'View system health and error logs' },
      { id: 'keys.manage', label: 'Rotate API keys and webhooks', danger: true },
      { id: 'backup.run', label: 'Trigger backups and data exports', danger: true },
      { id: 'analytics.view', label: 'View analytics dashboards' },
      { id: 'kyc.review', label: 'Review and decide KYC submissions', danger: true },
      { id: 'fraud.review', label: 'Review fraud clusters' },
    ],
  },
] as const satisfies readonly PermissionGroup[];

/* ---- TWO-WAY EXHAUSTIVENESS CHECK ------------------------------------------
   `satisfies` above proves every catalogue id is a member of `Permission`.
   This proves the converse: every member of `Permission` appears in the
   catalogue. Add a permission to the union and forget the catalogue row, and
   `_catalogueIsExhaustive` fails to compile.                               */
type CatalogueId = (typeof PERMISSIONS)[number]['items'][number]['id'];
type MissingFromCatalogue = Exclude<Permission, CatalogueId>;
type MissingFromUnion = Exclude<CatalogueId, Permission>;
const _catalogueIsExhaustive: [MissingFromCatalogue, MissingFromUnion] extends [never, never]
  ? true
  : never = true;
void _catalogueIsExhaustive;

/** Every permission id, in catalogue order. 53 of them. */
export const ALL_PERMS: readonly Permission[] = PERMISSIONS.flatMap((g) =>
  g.items.map((i) => i.id),
);

export interface PermissionMeta extends PermissionDef {
  group: string;
}

/** `PERM_META['user.ban'].label` → "Ban account (permanent)". Used by the
    denied surface and by every "your role cannot X" toast, so the wording of a
    refusal comes from the catalogue rather than being retyped per call site. */
export const PERM_META: Record<Permission, PermissionMeta> = Object.fromEntries(
  PERMISSIONS.flatMap((g) => g.items.map((i) => [i.id, { ...i, group: g.g }] as const)),
) as Record<Permission, PermissionMeta>;

/** True for the permissions that move money, remove access or destroy data. */
export const isDangerous = (perm: Permission): boolean => PERM_META[perm].danger === true;

/* ---- ROLES ------------------------------------------------------------------
   Deliberately least-privilege. The brief's own example is the test case, and
   both halves hold here:
     • Support can view users (`user.view`) but cannot adjust balances — it does
       NOT hold `balance.adjust`.
     • Finance can approve withdrawals (`withdrawal.approve`) but cannot ban
       users — it does NOT hold `user.ban`.
   `tone` maps onto the Pill component's tone variants, so a role badge is the
   same colour everywhere it appears.                                        */
export type RoleTone = 'danger' | 'violet' | 'mint' | 'warning' | 'info';

export interface RoleDef {
  label: string;
  tone: RoleTone;
  desc: string;
  perms: readonly Permission[];
}

/** Permissions withheld from `admin`. Named rather than inlined because the
    "what can an Admin NOT do" question gets asked in every security review. */
const ADMIN_WITHHELD: readonly Permission[] = [
  'roles.edit',
  'user.delete',
  'keys.manage',
  'lockdown',
  'admin.manage',
];

export const ROLES: Record<AdminRole, RoleDef> = {
  super_admin: {
    label: 'Super Admin',
    tone: 'danger',
    desc: 'Unrestricted. Only role that can edit the permission matrix or trigger lockdown.',
    perms: ALL_PERMS,
  },
  admin: {
    label: 'Admin',
    tone: 'violet',
    desc: 'Runs the platform day to day. No role editing, no hard deletes, no key rotation.',
    perms: ALL_PERMS.filter((p) => !ADMIN_WITHHELD.includes(p)),
  },
  finance: {
    label: 'Finance',
    tone: 'mint',
    desc: 'Owns the money surface. Approves payouts and edits limits — cannot ban users or touch content.',
    perms: [
      'user.view',
      'balance.view',
      'balance.adjust',
      'withdrawal.view',
      'withdrawal.approve',
      'withdrawal.batch',
      'withdrawal.reverse',
      'treasury.view',
      'rates.edit',
      'limits.edit',
      'accounting.export',
      'ads.view',
      'advertiser.manage',
      'analytics.view',
      'audit.view',
      'kyc.review',
    ],
  },
  moderator: {
    label: 'Moderator',
    tone: 'warning',
    desc: 'Polices abuse. Can suspend and ban, review fraud clusters and void leaderboard entries — no money access.',
    perms: [
      'user.view',
      'user.edit',
      'user.note',
      'user.suspend',
      'user.ban',
      'user.bulk',
      'balance.view',
      'fraud.review',
      'kyc.review',
      'leaderboard.void',
      'support.view',
      'support.reply',
      'earn.view',
      'audit.view',
      'analytics.view',
    ],
  },
  support: {
    label: 'Support',
    tone: 'info',
    desc: 'Front line. Reads everything about a user and answers them — cannot change a balance or an account state.',
    perms: [
      'user.view',
      'user.note',
      'user.security',
      'balance.view',
      'withdrawal.view',
      'support.view',
      'support.reply',
      'support.assign',
      'kb.edit',
      'earn.view',
    ],
  },
};

export const ADMIN_ROLES: readonly AdminRole[] = [
  'super_admin',
  'admin',
  'finance',
  'moderator',
  'support',
];

export const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (ALL_PERMS as readonly string[]).includes(value);

/* ---- THE GATE ---------------------------------------------------------------
   Sets rather than `Array.includes` because `can()` is called once per nav
   item per render (55 items) plus once per triage signal plus once per action
   button. A linear scan of a 53-element array, 200 times a render, is free in
   isolation and measurable in aggregate.                                    */
const ROLE_PERM_SETS: Record<AdminRole, ReadonlySet<Permission>> = {
  super_admin: new Set(ROLES.super_admin.perms),
  admin: new Set(ROLES.admin.perms),
  finance: new Set(ROLES.finance.perms),
  moderator: new Set(ROLES.moderator.perms),
  support: new Set(ROLES.support.perms),
};

/**
 * The base check: does this ROLE hold this permission?
 *
 * This is the pure, static answer. It does not know about per-user grants
 * (`perms` in the custom claims) or about a `/roleGrants/{role}` override — for
 * those use `canWithGrants`. Server-side callers should prefer
 * `requirePermission()`, which starts from a *verified* token.
 */
export const can = (role: AdminRole, perm: Permission): boolean =>
  ROLE_PERM_SETS[role].has(perm);

/**
 * The check including overrides, in precedence order:
 *
 *   1. An explicit per-user `perms` array in the custom claims. Set by
 *      `setAdminRole()` for the "Finance, plus fraud.review for the duration of
 *      this investigation" case. When present it REPLACES the role grant
 *      entirely — an override that could only ever add is not an override.
 *   2. A `/roleGrants/{role}` document, which is what the matrix editor writes.
 *   3. The static `ROLES` table in this file, as the floor.
 *
 * `super_admin` short-circuits to true. That is not a convenience: it is the
 * break-glass guarantee that a mis-saved role grant cannot lock every human
 * out of the console that repairs role grants.
 */
export const canWithGrants = (
  role: AdminRole,
  perm: Permission,
  overrides?: { perms?: readonly Permission[] | undefined; roleGrants?: readonly Permission[] | undefined },
): boolean => {
  if (role === 'super_admin') return true;
  if (overrides?.perms) return overrides.perms.includes(perm);
  if (overrides?.roleGrants) return overrides.roleGrants.includes(perm);
  return can(role, perm);
};

/** Permission count for a role — shown on the login screen and the "your
    permissions" card, because "Support" means nothing until you see it is 10
    of 53. */
export const permCount = (role: AdminRole): number => ROLES[role].perms.length;

/** The permissions a role holds, grouped for the matrix editor. */
export const grantedByGroup = (
  role: AdminRole,
): Array<{ group: string; held: PermissionDef[]; withheld: PermissionDef[] }> =>
  PERMISSIONS.map((g) => ({
    group: g.g,
    held: g.items.filter((i) => can(role, i.id)),
    withheld: g.items.filter((i) => !can(role, i.id)),
  }));
