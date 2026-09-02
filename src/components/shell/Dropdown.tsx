'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

/* ============================================================================
   DROPDOWN
   Anchored popover for the notifications panel and the avatar menu. Closes on
   Escape and on click/focus outside, restores focus to the trigger, and marks
   the trigger with `aria-expanded`. Not a menu role: the contents are links
   and buttons that behave like ordinary content, and claiming `role="menu"`
   would promise arrow-key semantics browsers do not give us for free.
   ========================================================================== */

export function Dropdown({
  trigger,
  children,
  align = 'right',
  width,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; 'aria-expanded': boolean }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'left' | 'right';
  width?: number;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((o) => !o), []);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        rootRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle, 'aria-expanded': open })}
      <AnimatePresence>
        {open ? (
          <motion.div
            role="group"
            aria-label={label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            style={width ? { minWidth: width } : undefined}
            className={cn(
              'absolute top-[calc(100%+8px)] z-drawer min-w-[220px] rounded-md border border-line-strong bg-surface-2 p-2 shadow-lg',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      className={cn(
        'flex h-[34px] w-full items-center gap-3 rounded-[7px] px-3 text-left text-13 text-text-2',
        'transition-colors duration-fast ease-out hover:bg-surface-3 hover:text-text',
        '[&_svg]:size-4 [&_svg]:flex-none',
        className,
      )}
      {...props}
    />
  );
}
