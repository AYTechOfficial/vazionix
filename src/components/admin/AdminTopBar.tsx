'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, History, LogOut, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { ADMIN_ROUTE_META } from '@/lib/admin/nav';
import { ROLES, type AdminRole } from '@/lib/admin/rbac';
import { IconButton } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/CommandPalette';
import { Avatar } from '@/components/ui/Avatar';
import { Divider } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Dropdown, DropdownItem } from '@/components/shell/Dropdown';

/* ============================================================================
   ADMIN TOP BAR — glass surface, admin edition
   ----------------------------------------------------------------------------
   The user-facing top bar leads with the balance. This one leads with WHO YOU
   ARE, because in a console where the same URL shows different things to
   different people, "which role am I acting as" is the single most useful
   persistent fact on screen. The role pill is always visible, always in the
   role's own tone, and repeated in the account menu with the permission count.

   There is deliberately no role SWITCHER here. Changing your own role is
   `setStaffRole`, it is super_admin-only, it refuses to act on yourself, and it is
   audit-logged. A dropdown that silently re-badges you would undo the whole model.
   ========================================================================== */

export interface AdminIdentity {
  name: string;
  email: string | null;
  role: AdminRole;
  permCount: number;
  pageCount: number;
}

export function AdminTopBar({
  identity,
  lockdown,
  onOpenPalette,
  onOpenDrawer,
}: {
  identity: AdminIdentity;
  lockdown: boolean;
  onOpenPalette: () => void;
  onOpenDrawer: () => void;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const role = ROLES[identity.role];

  const title = React.useMemo(() => {
    const exact = ADMIN_ROUTE_META[pathname];
    if (exact) return exact.title;
    if (/^\/admin\/users\/[^/]+$/.test(pathname)) return 'User detail';
    return 'Admin';
  }, [pathname]);

  const initials = identity.name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className={cn(
        'sticky top-0 z-sticky flex h-topbar flex-none items-center gap-3 px-5 max-lg:px-4',
        'border-b border-glass-line bg-glass-bg shadow-glass-inset backdrop-blur-[18px] backdrop-saturate-150',
        '[transform:translateZ(0)]',
      )}
    >
      <IconButton aria-label="Open navigation" onClick={onOpenDrawer} className="lg:hidden">
        <Menu aria-hidden="true" />
      </IconButton>

      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-14 font-semibold tracking-[-0.01em]">{title}</h1>
        {lockdown ? (
          <Pill tone="danger" icon={AlertTriangle}>
            LOCKDOWN ACTIVE
          </Pill>
        ) : null}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        className={cn(
          'flex h-[34px] w-[300px] items-center gap-2 rounded-sm border border-line bg-surface-2 px-3',
          'text-13 text-text-3 transition-colors duration-fast ease-out hover:border-line-strong hover:text-text-2',
          'max-xl:w-[200px] max-md:hidden',
        )}
      >
        <Search aria-hidden="true" className="size-4 flex-none" />
        <span className="flex-1 truncate text-left">Search users, tickets, pages…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <IconButton aria-label="Search admin" onClick={onOpenPalette} className="md:hidden">
        <Search aria-hidden="true" />
      </IconButton>

      <IconButton
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </IconButton>

      {/* The role indicator. Always visible, never a control. */}
      <Pill tone={role.tone} className="max-sm:hidden">
        {role.label}
      </Pill>

      <Dropdown
        label="Admin account"
        width={272}
        trigger={({ toggle, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            {...aria}
            aria-label="Admin account"
            className="rounded-sm p-[3px] transition-colors duration-fast ease-out hover:bg-surface-2"
          >
            <Avatar initials={initials} />
          </button>
        )}
      >
        <div className="flex items-center gap-3 p-3">
          <Avatar initials={initials} size="lg" />
          <div className="flex min-w-0 flex-col">
            <strong className="truncate text-13">{identity.name}</strong>
            <span className="truncate text-11 text-text-3">{identity.email ?? '—'}</span>
            <Pill tone={role.tone} className="mt-1 w-fit">
              {role.label}
            </Pill>
          </div>
        </div>
        <Divider className="my-2" />
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-3 pb-2 text-11">
          <dt className="text-text-3">Two-factor</dt>
          <dd className="text-right font-semibold text-success">Required</dd>
          <dt className="text-text-3">Permissions held</dt>
          <dd className="text-right font-mono tabular">{identity.permCount} / 53</dd>
          <dt className="text-text-3">Pages visible</dt>
          <dd className="text-right font-mono tabular">{identity.pageCount}</dd>
        </dl>
        <p className="px-3 pb-2 text-11 leading-[1.45] text-text-3">{role.desc}</p>
        <Divider className="my-2" />
        <DropdownItem href="/admin/platform/sessions">
          <Monitor aria-hidden="true" /> My sessions
        </DropdownItem>
        <DropdownItem href="/admin/platform/audit">
          <History aria-hidden="true" /> My activity
        </DropdownItem>
        <DropdownItem href="/admin/login" className="text-danger hover:text-danger">
          <LogOut aria-hidden="true" /> Sign out
        </DropdownItem>
      </Dropdown>
    </header>
  );
}
