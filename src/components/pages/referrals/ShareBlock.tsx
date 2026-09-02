'use client';

import * as React from 'react';
import { Check, Copy, Facebook, Link2, MessageCircle, Send, Twitter } from 'lucide-react';

import { cn, copyText } from '@/lib/utils';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   SHARE BLOCK
   ----------------------------------------------------------------------------
   The link, the bare code, and four real share targets. A referrals page whose
   only job is to get a link sent somewhere should not make the user select text
   by hand.

   The share message is deliberately factual. An inflated claim in a pre-filled
   message is a claim the recipient will hold the referrer to.
   ========================================================================== */

const MESSAGE = `I've been earning crypto on ${brand.name} — instant payouts and low minimums. Sign up with my link:`;

const TARGETS = [
  {
    name: 'Telegram',
    icon: Send,
    href: (link: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(MESSAGE)}`,
  },
  {
    name: 'X',
    icon: Twitter,
    href: (link: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`,
  },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    href: (link: string) => `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`,
  },
  {
    name: 'Facebook',
    icon: Facebook,
    href: (link: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
  },
] as const;

export function ShareBlock({
  link,
  code,
  commissionRate,
}: {
  link: string;
  code: string;
  commissionRate: number;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const copy = async (value: string, label: string) => {
    const success = await copyText(value);
    toast(success ? `${label} copied` : 'Could not copy', success ? 'success' : 'danger');
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <Card as="section" pad="md">
      <CardTitle className="mb-1">Your referral link</CardTitle>
      <p className="mb-4 text-12 text-text-3">
        Lifetime {commissionRate}% of everything they earn, credited the moment they earn it — not on a delay,
        and not capped.
      </p>

      <label htmlFor="ref-link" className="sr-only">
        Your referral link
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="ref-link" mono readOnly value={link} className="min-w-[240px] flex-1" />
        <Button variant="primary" onClick={() => void copy(link, 'Referral link')}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[30px] items-center gap-2 rounded-sm border border-line bg-surface-2 px-3 font-mono text-12 text-text-2">
          <Link2 aria-hidden="true" className="size-3 text-text-3" />
          {code || '—'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void copy(code, 'Referral code')}>
          Copy code
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TARGETS.map(({ name, icon: Icon, href }) => (
          <a
            key={name}
            href={href(link)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex h-[34px] items-center gap-2 rounded-sm border border-line bg-surface-2 px-3',
              'text-13 font-semibold text-text-2 transition-all duration-fast ease-out',
              'hover:border-line-strong hover:bg-surface-3 hover:text-text',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {name}
          </a>
        ))}
      </div>
    </Card>
  );
}
