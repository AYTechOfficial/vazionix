'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Flame, LogOut, PanelLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { brand } from '@/lib/brand';
import { DASHBOARD_ITEM, NAV, isActiveRoute, type NavItem } from '@/lib/nav';
import { getAuthApi } from '@/lib/auth-api';
import { ButtonLink } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/CommandPalette';
import { BrandMark } from '@/components/brand/BrandMark';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   SIDEBAR
   ----------------------------------------------------------------------------
   256px expanded / 72px collapsed, ⌘B, cookie-persisted so the server renders the
   right width and there is no first-paint jump.

   Nav is grouped by job. The active row gets a 3px mint rule, a mint icon and
   `aria-current="page"` — three signals, because colour alone is not one.

   The single promo slot at the bottom is a HOUSE card about the viewer's own
   streak, driven by their real streak count. It is never paid third-party
   inventory: an ad in the navigation is an ad the user has to read past on every
   page, and the ad map deliberately has no placement here.
   ========================================================================== */

export function Sidebar({
  collapsed,
  onToggleCollapse,
  drawerOpen,
  onCloseDrawer,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useSession();

  const streak = profile?.streak ?? 0;

  const signOut = async () => {
    const { signOutEverywhere } = await getAuthApi();
    await signOutEverywhere();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      id="vz-sidebar"
      className={cn(
        'sticky top-0 z-sticky flex h-screen flex-col overflow-hidden border-r border-line bg-surface-1',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[282px] max-lg:z-drawer max-lg:shadow-lg',
        'max-lg:transition-transform max-lg:duration-slow max-lg:ease-out',
        drawerOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
      )}
    >
      <div
        className={cn(
          'flex h-topbar flex-none items-center gap-3 border-b border-line px-4',
          collapsed && 'lg:justify-center lg:px-0',
        )}
      >
        <Link href="/dashboard" aria-label={`${brand.name} home`} className="flex-none">
          <BrandMark size={30} />
        </Link>
        <span
          className={cn(
            'whitespace-nowrap font-display text-16 font-bold tracking-[-0.03em]',
            collapsed && 'lg:hidden',
          )}
        >
          {brand.name}
        </span>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
        <div>
          <SidebarLink
            item={DASHBOARD_ITEM}
            pathname={pathname}
            collapsed={collapsed}
            onNavigate={onCloseDrawer}
          />
        </div>

        {NAV.map((group) => (
          <div
            key={group.group}
            className={cn('mt-4', collapsed && 'lg:mt-3 lg:border-t lg:border-line lg:pt-3')}
          >
            <div
              className={cn(
                'whitespace-nowrap px-3 pb-2 text-[10px] font-bold uppercase tracking-wide text-text-3',
                collapsed && 'lg:hidden',
              )}
            >
              {group.group}
            </div>
            {group.items.map((item) => (
              <SidebarLink
                key={item.id}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onCloseDrawer}
              />
            ))}
          </div>
        ))}

        <div
          className={cn(
            'mt-3 rounded-sm border border-line-accent bg-[linear-gradient(150deg,var(--mint-dim),transparent_70%)] bg-surface-2 p-3',
            collapsed && 'lg:hidden',
          )}
        >
          <span className="inline-flex h-[22px] items-center gap-[5px] rounded-sm border border-line-accent bg-mint-dim px-2 text-11 font-semibold text-mint">
            <Flame aria-hidden="true" className="size-[11px]" />
            {streak ? `${streak}-day streak` : 'No streak yet'}
          </span>
          <p className="mt-2 text-12 leading-[1.45] text-text-2">
            {streak
              ? 'Claim the daily bonus to keep it and raise your earning bonus.'
              : 'Claim the daily bonus to start a streak — it raises the bonus on every other claim.'}
          </p>
          <ButtonLink href="/daily-bonus" variant="primary" size="sm" block className="mt-[10px]">
            {streak ? 'Claim today' : 'Start a streak'}
          </ButtonLink>
        </div>
      </nav>

      <div className="flex-none border-t border-line p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          data-tip="Toggle sidebar"
          className={cn(
            'tip flex h-[34px] w-full items-center gap-3 rounded-[7px] px-3 text-14 font-medium text-text-2',
            'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
            'max-lg:hidden',
            collapsed && 'tip-right justify-center px-0',
          )}
        >
          <PanelLeft aria-hidden="true" className="size-[17px] flex-none" />
          <span className={cn('flex-1 text-left', collapsed && 'hidden')}>Collapse</span>
          <span className={cn(collapsed && 'hidden')}>
            <Kbd>⌘B</Kbd>
          </span>
        </button>

        <button
          type="button"
          onClick={signOut}
          data-tip="Log out"
          className={cn(
            'tip flex h-[34px] w-full items-center gap-3 rounded-[7px] px-3 text-14 font-medium text-text-2',
            'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
            collapsed && 'lg:tip-right lg:justify-center lg:px-0',
          )}
        >
          <LogOut aria-hidden="true" className="size-[17px] flex-none" />
          <span className={cn('flex-1 text-left', collapsed && 'lg:hidden')}>Log out</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const active = isActiveRoute(pathname, item.href);
  const hasChildren = Boolean(item.children?.length);
  const expanded = hasChildren && active;
  const Icon = item.icon;

  return (
    <>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={pathname === item.href ? 'page' : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        data-tip={item.label}
        className={cn(
          'tip relative flex h-[34px] w-full items-center gap-3 rounded-[7px] px-3',
          'whitespace-nowrap text-14 font-medium text-text-2',
          'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
          active && 'nav-active bg-surface-3 font-semibold text-text [&>svg]:text-mint',
          collapsed && 'lg:tip-right lg:justify-center lg:px-0',
        )}
      >
        <Icon aria-hidden="true" className="size-[17px] flex-none" />
        <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'lg:hidden')}>
          {item.label}
        </span>
        {hasChildren ? (
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-[13px] flex-none transition-transform duration-base ease-out',
              expanded && 'rotate-90',
              collapsed && 'lg:hidden',
            )}
          />
        ) : null}
      </Link>

      {hasChildren && expanded ? (
        <div className={cn('mt-px grid gap-px pl-6', collapsed && 'lg:hidden')}>
          {item.children!.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              aria-current={pathname === child.href ? 'page' : undefined}
              className={cn(
                'relative flex h-[30px] items-center rounded-[7px] px-3 text-13 text-text-2',
                'transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text',
                pathname === child.href && 'bg-surface-3 font-semibold text-text',
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
