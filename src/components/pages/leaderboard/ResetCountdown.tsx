'use client';

import * as React from 'react';
import { Timer } from 'lucide-react';

import { countdown } from '@/lib/format';
import { useMounted } from '@/lib/hooks';
import { Pill } from '@/components/ui/Pill';

/* ============================================================================
   RESET COUNTDOWN
   ----------------------------------------------------------------------------
   Boards reset weekly, and the reset instant is computed on the server so this
   component never has to know the schedule. People grind a board with no idea
   whether they have six days or six minutes; that is the whole reason this
   exists.

   Rendered client-only after mount: the value depends on the viewer's clock, so
   computing it during SSR guarantees a hydration mismatch.
   ========================================================================== */

export function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  const mounted = useMounted();
  const [, tick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Pill tone="warning" size="lg" icon={Timer} className="font-mono tabular">
      <span className="sr-only">Boards reset in </span>
      {mounted ? countdown(resetsAt) : '—'}
      <span className="ml-1 font-body text-11 font-medium text-text-3">to reset</span>
    </Pill>
  );
}
