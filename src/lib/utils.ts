import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones. Every primitive in `components/ui` runs its
 * `className` prop through this so a caller can always override a variant.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Promise-based sleep, used to pace optimistic UI (submitting states). */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Copy with a graceful fallback for non-secure contexts and sandboxed frames,
 * where `navigator.clipboard` exists but throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Deterministic pseudo-random (LCG) so mock charts and sparklines are stable
 * across renders. A chart that reshuffles on every tab switch reads as broken.
 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Clamp helper used by progress rings and bars. */
export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));

/** Percentage of `a` within `b`, capped at 100. Never divides by zero. */
export const pct = (a: number, b: number): number => (b ? Math.min(100, (a / b) * 100) : 0);
