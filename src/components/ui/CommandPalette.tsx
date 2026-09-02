'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

/* ============================================================================
   COMMAND PALETTE (⌘K)
   ----------------------------------------------------------------------------
   Combobox pattern: the input keeps focus and owns `aria-activedescendant`,
   the list is a listbox, and ↑↓ / ↵ / esc all work. Grouped by section with
   Actions first, because someone who reaches for ⌘K usually wants to *do*
   something, not to browse.

   Glass surface #2 of the four sanctioned in the token system.
   ========================================================================== */

export interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
  /** Extra words that should match but are not displayed. */
  keywords?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const listId = React.useId();

  React.useEffect(() => setMounted(true), []);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  React.useEffect(() => {
    setSelected(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Keep the active option scrolled into view as the selection moves.
  React.useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, shown]);

  const run = (index: number) => {
    const item = shown[index];
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((n) => Math.min(shown.length - 1, n + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((n) => Math.max(0, n - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(selected);
    }
  };

  if (!mounted) return null;

  let lastGroup: string | null = null;

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
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="glass glass-strong fixed left-1/2 top-[14vh] z-palette w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg"
          >
            <div className="flex items-center gap-3 border-b border-glass-line px-5">
              <Search aria-hidden="true" className="size-[18px] flex-none text-text-3" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={shown[selected] ? `${listId}-opt-${selected}` : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages and actions…"
                className="h-[54px] w-full bg-transparent text-16 text-text outline-none placeholder:text-text-3"
              />
            </div>

            <div ref={listRef} id={listId} role="listbox" className="max-h-[46vh] overflow-y-auto p-2">
              {shown.length === 0 ? (
                <div className="px-3 py-8 text-center text-13 text-text-3">
                  No matches for “{query}”.
                </div>
              ) : (
                shown.map((item, i) => {
                  const showGroup = item.group !== lastGroup;
                  lastGroup = item.group;
                  const isSelected = i === selected;
                  const Icon = item.icon;
                  return (
                    <React.Fragment key={item.id}>
                      {showGroup ? (
                        <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-text-3">
                          {item.group}
                        </div>
                      ) : null}
                      <button
                        id={`${listId}-opt-${i}`}
                        role="option"
                        type="button"
                        aria-selected={isSelected}
                        onMouseMove={() => setSelected(i)}
                        onClick={() => run(i)}
                        className={cn(
                          'flex h-10 w-full items-center gap-3 rounded-sm px-3 text-left text-14',
                          isSelected ? 'bg-mint-dim text-text [&_svg]:text-mint' : 'text-text-2',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-[17px] flex-none" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {isSelected ? <span className="text-11 text-text-3">↵</span> : null}
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="flex gap-4 border-t border-glass-line px-5 py-3 text-11 text-text-3">
              <span>
                <Kbd>↑↓</Kbd> navigate
              </span>
              <span>
                <Kbd>↵</Kbd> open
              </span>
              <span>
                <Kbd>esc</Kbd> close
              </span>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[19px] items-center gap-[2px] rounded-[5px] border border-line bg-surface-3 px-[5px]',
        'font-mono text-[10px] font-semibold text-text-3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
