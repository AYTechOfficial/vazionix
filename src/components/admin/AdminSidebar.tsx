'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, LogOut, PanelLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { brand } from '@/lib/brand';
import { isActiveAdminRoute, type AdminNavGroup, type NavCounts } from '@/lib/admin/nav';
import { Kbd } from '@/components/ui/CommandPalette';

/* ============================================================================
   ADMIN SIDEBAR
   ----------------------------------------------------------------------------
   The set of visible route ids is decided ON THE SERVER, from the verified
   session's claims, and handed down as a plain list; this component only maps
   those ids onto the static nav model (it has to, because a `LucideIcon` is a
   function and functions do not cross the RSC boundary). So the *decision* is
   never client-side, and there is no `hidden` class to delete in devtools.

   To be precise about what that does and does not buy: the nav model itself is
   static source and ships in the bundle either way, so the LABELS of screens
   you cannot open are discoverable. That is fine and always was — the labels
   are not the secret. The rows are absent from the DOM, absent from the ⌘K
   palette, and every one of those routes refuses server-side in
   `requirePermission()`. Hiding a link has never been the control.

   Nine groups, up to 55 rows. Group headings are not decoration at that
   length: they are how you find "Rail health" without reading 55 labels.
   ========================================================================== */

const BADGE_TONE: Record<keyof NavCounts, string> = {
  kyc: 'bg-warning-dim text-warning',
  fraud: 'bg-danger-dim text-danger',
  cr: 'bg-surface-3 text-text-3',
  wd: 'bg-danger-dim text-danger',
  ads: 'bg-info-dim text-info',
  tk: 'bg-mint-dim text-mint',
};

export function AdminSidebar({
  nav,
  counts,
  collapsed,
  onToggleCollapse,
  drawerOpen,
  onCloseDrawer,
}: {
  nav: readonly AdminNavGroup[];
  counts: NavCounts;
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      id="vf-admin-sidebar"
      className={cn(
        'sticky top-0 z-sticky flex h-screen flex-col overflow-hidden border-r border-line bg-surface-1',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-drawer max-lg:w-[282px] max-lg:shadow-lg',
        'max-lg:transition-transform max-lg:duration-slow max-lg:ease-out',
        drawerOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
      )}
    >
      {/* Brand. The lock mark is the one visual difference from the user-facing
          sidebar, and it is deliberate: an admin should never be a click away
          from wondering which console they are in. */}
      <div
        className={cn(
          'flex h-topbar flex-none items-center gap-3 border-b border-line px-4',
          collapsed && 'lg:justify-center lg:px-0',
        )}
      >
        <Link
          href="/admin"
          aria-label={`${brand.name} admin home`}
          className="grid size-[30px] flex-none place-items-center rounded-[9px] border border-danger-line bg-danger-dim text-danger"
        >
          <Lock aria-hidden="true" className="size-[15px]" />
        </Link>
        <span className={cn('flex min-w-0 flex-col leading-[1.1]', collapsed && 'lg:hidden')}>
          <span className="font-display text-14 font-bold tracking-[-0.03em]">{brand.name}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-3">Admin</span>
        </span>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
        {nav.map((group) => (
          <div
            key={group.group}
            className={cn('mt-3 first:mt-0', collapsed && 'lg:border-t lg:border-line lg:pt-3')}
          >
            <div
              className={cn(
                'whitespace-nowrap px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-3',
                collapsed && 'lg:hidden',
              )}
            >
              {group.group}
            </div>
            {group.items.map((item) => {
              const active = isActiveAdminRoute(pathname, item.href);
              const Icon = item.icon;
              const count = item.badge ? counts[item.badge] : 0;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onCloseDrawer}
                  aria-current={active ? 'page' : undefined}
                  data-tip={item.label}
                  className={cn(
                    'tip relative flex h-[32px] w-full items-center gap-3 rounded-[7px] px-3',
                    'whitespace-nowrap text-13 font-medium text-text-2',
                    'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
                    active && 'nav-active bg-surface-3 font-semibold text-text [&>svg]:text-mint',
                    collapsed && 'lg:tip-right lg:justify-center lg:px-0',
                  )}
                >
                  <Icon aria-hidden="true" className="size-[16px] flex-none" />
                  <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'lg:hidden')}>
                    {item.label}
                  </span>
                  {item.badge && count ? (
                    <span
                      className={cn(
                        'rounded-[5px] px-[5px] py-px font-mono text-[10px] font-semibold tabular',
                        BADGE_TONE[item.badge],
                        collapsed && 'lg:hidden',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex-none border-t border-line p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          data-tip="Toggle sidebar"
          className={cn(
            'tip flex h-[32px] w-full items-center gap-3 rounded-[7px] px-3 text-13 font-medium text-text-2',
            'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
            'max-lg:hidden',
            collapsed && 'tip-right justify-center px-0',
          )}
        >
          <PanelLeft aria-hidden="true" className="size-[16px] flex-none" />
          <span className={cn('flex-1 text-left', collapsed && 'hidden')}>Collapse</span>
          <span className={cn(collapsed && 'hidden')}>
            <Kbd>⌘B</Kbd>
          </span>
        </button>
        <Link
          href="/admin/login"
          data-tip="Sign out"
          className={cn(
            'tip flex h-[32px] w-full items-center gap-3 rounded-[7px] px-3 text-13 font-medium text-text-2',
            'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
            collapsed && 'lg:tip-right lg:justify-center lg:px-0',
          )}
        >
          <LogOut aria-hidden="true" className="size-[16px] flex-none" />
          <span className={cn('flex-1 text-left', collapsed && 'lg:hidden')}>Sign out</span>
        </Link>
      </div>
    </aside>
  );
}
