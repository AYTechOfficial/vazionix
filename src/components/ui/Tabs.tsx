'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   TABS
   Full WAI-ARIA tab pattern: roving tabindex, Left/Right/Home/End keys, and
   `aria-controls` wiring. Two visual variants — a segmented control for
   in-card range switches, and an underline for page-level sections.
   ========================================================================== */

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Optional count chip, e.g. the PTC type breakdown. */
  count?: number | string;
}

export interface TabsProps<T extends string = string> {
  items: Array<TabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  variant?: 'segmented' | 'line';
  label: string;
  className?: string;
  /** id prefix used to build `aria-controls`; panels must use `${idBase}-panel-${value}`. */
  idBase?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onValueChange,
  variant = 'segmented',
  label,
  className,
  idBase,
}: TabsProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const move = (dir: 1 | -1 | 'home' | 'end') => {
    const i = items.findIndex((t) => t.value === value);
    let next: number;
    if (dir === 'home') next = 0;
    else if (dir === 'end') next = items.length - 1;
    else next = (i + dir + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    onValueChange(target.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, 1 | -1 | 'home' | 'end'> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: 'home',
      End: 'end',
    };
    const dir = map[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    move(dir);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        variant === 'segmented'
          ? 'inline-flex gap-1 rounded-sm border border-line bg-surface-2 p-1'
          : 'flex gap-6 overflow-x-auto border-b border-line no-scrollbar',
        className,
      )}
    >
      {items.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={idBase ? `${idBase}-panel-${t.value}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap font-semibold transition-[color,background-color] duration-fast ease-out',
              variant === 'segmented'
                ? [
                    'h-[30px] rounded-[6px] px-3 text-13',
                    selected ? 'bg-surface-1 text-text shadow-sm' : 'text-text-3 hover:text-text-2',
                  ]
                : [
                    '-mb-px border-b-2 pb-3 text-14',
                    selected
                      ? 'border-mint text-text'
                      : 'border-transparent text-text-3 hover:text-text-2',
                  ],
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span
                className={cn(
                  'rounded-[4px] px-[5px] py-px font-mono text-11 tabular',
                  selected ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-text-3',
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  className,
  children,
}: {
  idBase: string;
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`${idBase}-panel-${value}`} role="tabpanel" tabIndex={0} className={cn('outline-none', className)}>
      {children}
    </div>
  );
}
