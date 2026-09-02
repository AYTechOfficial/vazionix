'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { History, Moon, Wallet, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { cookies as cookieNames } from '@/lib/brand';
import { useHotkey } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { ANAV, type AdminNavGroup, type NavCounts } from '@/lib/admin/nav';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar, type AdminIdentity } from './AdminTopBar';

/* ============================================================================
   ADMIN SHELL
   ----------------------------------------------------------------------------
   Owns the three pieces of cross-page console state: sidebar collapse
   (cookie-backed so the server renders the right grid width), the mobile
   drawer, and the ⌘K palette.

   TWO ROUTES DELIBERATELY RENDER WITHOUT CHROME
   `/admin/login` and the unauthenticated `/admin/403` are inside the `/admin`
   segment — so Next nests them under this layout — but a sidebar full of
   screens you cannot reach is the wrong frame for "sign in" or "you are not
   staff". Rather than fracturing the route tree with a group just to dodge one
   layout, the shell checks the pathname and renders `children` bare. The same
   check is why `session` is nullable here: those two routes are reachable
   without one.
   ========================================================================== */

/* The collapse cookie NAME comes from `@/lib/brand`, not a literal. The layout
   reads it server-side to pick the grid width before hydration; when the two
   sides spelled it differently the state silently failed to survive a reload,
   which reads as a broken toggle rather than as a mismatched string. */
const SIDEBAR_COOKIE = cookieNames.adminSidebar;
const BARE_ROUTES = ['/admin/login', '/admin/403'];

export interface AdminShellProps {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  /** Null when the caller has no verified staff session — login and the
      not-staff 403 both render in that state. */
  identity: AdminIdentity | null;
  /** Route ids this role may open. Resolved server-side from verified claims. */
  allowedIds: readonly string[];
  counts: NavCounts;
  lockdown: boolean;
}

export function AdminShell({
  children,
  initialCollapsed = false,
  identity,
  allowedIds,
  counts,
  lockdown,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const toggleCollapse = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      return next;
    });
  }, []);

  useHotkey('b', (e) => {
    e.preventDefault();
    toggleCollapse();
  });
  useHotkey('k', (e) => {
    e.preventDefault();
    setPaletteOpen((o) => !o);
  });

  /* Re-hydrate the permitted nav from the static model using the server's
     decision. `allowed` is a Set because this runs for all 55 rows on every
     render of a shell that is always mounted. */
  const nav = React.useMemo<AdminNavGroup[]>(() => {
    const allowed = new Set(allowedIds);
    return ANAV.map((g) => ({ group: g.group, items: g.items.filter((i) => allowed.has(i.id)) })).filter(
      (g) => g.items.length > 0,
    );
  }, [allowedIds]);

  const items = React.useMemo<CommandItem[]>(() => {
    const actions: Array<{ id: string; label: string; icon: LucideIcon; run: () => void }> = [];
    const allowed = new Set(allowedIds);

    if (allowed.has('payouts')) {
      actions.push({
        id: 'act-payouts',
        label: 'Open the withdrawal queue',
        icon: Wallet,
        run: () => router.push('/admin/payouts'),
      });
    }
    if (allowed.has('p-audit')) {
      actions.push({
        id: 'act-audit',
        label: 'Open the audit log',
        icon: History,
        run: () => router.push('/admin/platform/audit'),
      });
    }
    actions.push({
      id: 'act-theme',
      label: 'Toggle light / dark theme',
      icon: Moon,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    });

    const pages: CommandItem[] = nav.flatMap((g) =>
      g.items.map((i) => ({
        id: `page-${i.id}`,
        label: i.label,
        icon: i.icon,
        group: g.group,
        keywords: i.id,
        run: () => router.push(i.href),
      })),
    );

    return [...actions.map((a) => ({ ...a, group: 'Actions' })), ...pages];
  }, [allowedIds, nav, router, setTheme, theme]);

  if (BARE_ROUTES.includes(pathname) || !identity) {
    return <>{children}</>;
  }

  return (
    <>
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>

      <div
        className={cn(
          'grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-slow ease-out',
          'lg:grid-cols-[var(--sidebar-w)_1fr]',
          collapsed && 'lg:grid-cols-[var(--sidebar-w-collapsed)_1fr]',
        )}
      >
        <AdminSidebar
          nav={nav}
          counts={counts}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
        />

        {drawerOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-sticky bg-scrim lg:hidden"
          />
        ) : null}

        <div className="relative z-[1] flex min-w-0 flex-col">
          <AdminTopBar
            identity={identity}
            lockdown={lockdown}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
          <main
            id="admin-main"
            className="mx-auto w-full max-w-content flex-1 animate-page-in px-6 pb-20 pt-6 max-lg:px-4"
          >
            {children}
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
    </>
  );
}
