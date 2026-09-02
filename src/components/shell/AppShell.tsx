'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Copy,
  Droplet,
  Moon,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn, copyText } from '@/lib/utils';
import { useHotkey } from '@/lib/hooks';
import { ALL_NAV_ITEMS, NAV } from '@/lib/nav';
import { brand } from '@/lib/brand';
import type { CoinTicker, UserProfile } from '@/lib/models';
import { useTheme } from '@/lib/theme';
import type { AdBehaviourConfig, AdUnitConfig } from '@/lib/ads/config';
import { AdProvider } from '@/components/ads/AdProvider';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { useToast } from '@/components/ui/Toast';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { RatesProvider } from '@/components/providers/RatesProvider';
import { ChatPanel } from './ChatPanel';
import { MobileTabBar } from './MobileTabBar';
import { Sidebar } from './Sidebar';
import { SupportLauncher } from './SupportLauncher';
import { TopBar } from './TopBar';

/* ============================================================================
   APP SHELL
   ----------------------------------------------------------------------------
   Owns the cross-page state — sidebar collapse (cookie-backed, so the server
   renders the correct grid width with no first-paint jump), the mobile drawer,
   the ⌘K palette and the support panel — and mounts the three providers every
   authenticated page depends on:

     SessionProvider  live profile + balance, streamed from Firestore
     RatesProvider    one price for the whole render
     AdProvider       one read of /adUnits for every slot on the page

   All three take server-fetched values as props rather than fetching on mount.
   That is what puts the correct balance in the first paint instead of a skeleton
   that resolves a moment later.
   ========================================================================== */

const SIDEBAR_COOKIE = `${brand.slug}-sidebar`;

export interface AppShellProps {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  profile: UserProfile | null;
  rates: { usdPerToken: number; spot: Record<CoinTicker, number>; updatedAt: string | null };
  ads: { behaviour: AdBehaviourConfig; units: Record<string, AdUnitConfig> };
  announcement?: { message: string; tone: 'info' | 'warning' | 'success' } | null;
}

export function AppShell({
  children,
  initialCollapsed = false,
  profile,
  rates,
  ads,
  announcement = null,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);

  const router = useRouter();
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();

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

  const openChat = React.useCallback(() => setChatOpen(true), []);

  /* ---- COMMAND ITEMS -------------------------------------------------------
     Actions first: someone reaching for ⌘K usually wants to DO something. */
  const items = React.useMemo<CommandItem[]>(() => {
    const actions: Array<{ id: string; label: string; icon: LucideIcon; run: () => void }> = [
      { id: 'act-claim', label: 'Claim faucet now', icon: Droplet, run: () => router.push('/faucet') },
      { id: 'act-wd', label: 'Start a withdrawal', icon: Wallet, run: () => router.push('/withdraw') },
      {
        id: 'act-ref',
        label: 'Copy my referral link',
        icon: Copy,
        run: () => {
          if (!profile) {
            toast('Sign in to get a referral link', 'warning');
            return;
          }
          void copyText(profile.referralLink).then((success) =>
            success ? toast('Referral link copied') : toast('Could not copy', 'danger'),
          );
        },
      },
      {
        id: 'act-theme',
        label: 'Toggle light / dark theme',
        icon: Moon,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'act-chat', label: `Ask ${brand.assistant}`, icon: Bot, run: openChat },
    ];

    const pages: CommandItem[] = [
      {
        id: 'page-dashboard',
        label: 'Dashboard',
        icon: ALL_NAV_ITEMS[0]!.icon,
        group: 'Go to',
        run: () => router.push('/dashboard'),
      },
    ];

    for (const group of NAV) {
      for (const item of group.items) {
        pages.push({
          id: `page-${item.id}`,
          label: item.label,
          icon: item.icon,
          group: group.group,
          run: () => router.push(item.href),
        });
        for (const child of item.children ?? []) {
          pages.push({
            id: `page-${item.id}-${child.id}`,
            label: `${item.label} — ${child.label}`,
            icon: item.icon,
            group: group.group,
            run: () => router.push(child.href),
          });
        }
      }
    }

    return [...actions.map((a) => ({ ...a, group: 'Actions' })), ...pages];
  }, [openChat, profile, router, setTheme, theme, toast]);

  return (
    <SessionProvider initialProfile={profile}>
      <RatesProvider value={rates}>
        <AdProvider units={ads.units} behaviour={ads.behaviour} uid={profile?.uid ?? null}>
          <a href="#main" className="skip-link">
            Skip to content
          </a>

          <div
            className={cn(
              'ambient-mesh grid min-h-screen transition-[grid-template-columns] duration-slow ease-out',
              'lg:grid-cols-[var(--sidebar-w)_1fr]',
              collapsed && 'lg:grid-cols-[var(--sidebar-w-collapsed)_1fr]',
              'grid-cols-1',
            )}
          >
            <Sidebar
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              drawerOpen={drawerOpen}
              onCloseDrawer={() => setDrawerOpen(false)}
            />

            {/* Drawer scrim — mobile only. */}
            {drawerOpen ? (
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 z-sticky bg-scrim lg:hidden"
              />
            ) : null}

            <div className="relative z-[1] flex min-w-0 flex-col">
              <TopBar onOpenPalette={() => setPaletteOpen(true)} onOpenDrawer={() => setDrawerOpen(true)} />

              {announcement ? (
                <div
                  role="status"
                  className={cn(
                    'border-b px-6 py-2 text-center text-12 max-lg:px-4',
                    announcement.tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
                    announcement.tone === 'success' && 'border-success/30 bg-success/10 text-success',
                    announcement.tone === 'info' && 'border-info/30 bg-info/10 text-info',
                  )}
                >
                  {announcement.message}
                </div>
              ) : null}

              <main
                id="main"
                className="mx-auto w-full max-w-content flex-1 animate-page-in px-6 pb-20 pt-6 max-lg:px-4 max-lg:pb-24"
              >
                {children}
              </main>
            </div>
          </div>

          <MobileTabBar />
          <SupportLauncher
            open={chatOpen}
            unread={0}
            onToggle={() => (chatOpen ? setChatOpen(false) : openChat())}
          />
          <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
        </AdProvider>
      </RatesProvider>
    </SessionProvider>
  );
}
