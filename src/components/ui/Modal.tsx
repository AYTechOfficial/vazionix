'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { IconButton } from './Button';

/* ============================================================================
   MODAL
   Portalled to <body> so no ancestor `overflow:hidden` or stacking context can
   clip it. Implements the dialog contract by hand rather than pulling in Radix:
   Escape to close, click-outside to close, focus moved in on open and restored
   on close, focus trapped with Tab/Shift+Tab, and `aria-modal` + a labelled
   title. Body scroll is locked while open.
   ========================================================================== */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The withdraw review modal is one of the four sanctioned glass surfaces. */
  glass?: boolean;
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  glass = false,
  className,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog on the next frame, after the panel mounts.
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-overlay bg-scrim backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.34, 1.56, 0.64, 1] }}
            className={cn(
              'fixed left-1/2 top-1/2 z-overlay w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
              'max-h-[calc(100vh-64px)] overflow-y-auto rounded-lg outline-none',
              glass ? 'glass glass-strong' : 'border border-line-strong bg-surface-1 shadow-lg',
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-16 font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1 text-12 text-text-3">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton aria-label="Close dialog" onClick={onClose}>
                <X />
              </IconButton>
            </div>
            <div className="p-5">{children}</div>
            {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
