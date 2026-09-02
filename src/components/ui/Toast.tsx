'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

/* ============================================================================
   TOASTS
   ----------------------------------------------------------------------------
   The live product confirms nothing. A PTC ad is consumed and the only feedback
   is a sidebar badge silently ticking 159 → 158; a withdrawal submits with no
   acknowledgement at all. Every state-changing action in this app raises a
   toast, and the region is `role="status" aria-live="polite"` so it is
   announced without stealing focus.
   ========================================================================== */

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  message: React.ReactNode;
  tone: ToastTone;
  ms: number;
}

interface ToastContextValue {
  toast: (message: React.ReactNode, tone?: ToastTone, ms?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  danger: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TONE_COLOR: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
  warning: 'text-warning',
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: React.ReactNode, tone: ToastTone = 'success', ms = 4200) => {
      const id = nextId++;
      // Cap the stack at four: past that the oldest is unreadable anyway and
      // the column starts to cover the primary action it is reporting on.
      setItems((list) => [...list, { id, message, tone, ms }].slice(-4));
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-toast flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col-reverse gap-2"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: reduced ? 0 : 0.32, ease: [0.34, 1.56, 0.64, 1] }}
              className="pointer-events-auto flex items-center gap-3 rounded-md border border-line-strong bg-surface-2 px-4 py-3 text-13 text-text shadow-lg"
            >
              <Icon aria-hidden="true" className={cn('size-[17px] flex-none', TONE_COLOR[t.tone])} />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss notification"
                className="grid size-5 flex-none place-items-center text-text-3 transition-colors duration-fast ease-out hover:text-text"
              >
                <X className="size-[14px]" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
