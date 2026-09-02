'use client';

import * as React from 'react';

import { ThemeProvider, type Theme } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * The client boundary. Kept as thin as possible — only the two providers that
 * genuinely need to span the whole tree. Everything below stays a Server
 * Component unless it opts in.
 */
export function Providers({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
