'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bot, ChevronDown, Headset, Send } from 'lucide-react';

import { cn } from '@/lib/utils';
import { brand } from '@/lib/brand';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   SUPPORT PANEL
   ----------------------------------------------------------------------------
   A help surface, not a chatbot pretending to be a person.

   WHAT IT ACTUALLY DOES
   It matches a question against a small set of answers that are TRUE OF THIS
   PRODUCT — how claims are credited, why an offerwall conversion is pending, what
   happens to a rejected withdrawal — and every answer links to the page that
   proves it. Anything it cannot answer becomes a real ticket through
   `/api/tickets`, the same system the Support page reads. One queue, not two.

   MONEY QUESTIONS SKIP THE MATCHER
   Anything mentioning a withdrawal, a payout or a missing balance goes straight to
   the escalation form. A bot arguing with somebody about their money is the worst
   possible first response, and the matcher has no business trying.

   No invented queue position and no fake typing delay. The panel is honest about
   being a shortcut to the right page, or a ticket.

   Glass surface #4 of the four sanctioned in the token system.
   ========================================================================== */

type Sender = 'you' | 'assistant';

interface PanelMessage {
  id: number;
  from: Sender;
  body: string;
  actions?: Array<{ label: string; href: string }>;
}

interface HelpEntry {
  match: string[];
  answer: string;
  actions?: Array<{ label: string; href: string }>;
}

/** Every answer here is checkable against the product. Nothing aspirational. */
const HELP: HelpEntry[] = [
  {
    match: ['faucet', 'claim', 'cooldown', 'timer'],
    answer:
      'The faucet pays on a fixed cooldown, and the timer is server state — it survives a refresh and a new device. The ring on the faucet page counts down to the exact instant the server will accept the next claim. Your reward includes the bonus from your level and streak, and the amount actually credited is recorded on the claim.',
    actions: [{ label: 'Open the faucet', href: '/faucet' }],
  },
  {
    match: ['offerwall', 'offer', 'pending', 'credit', 'postback'],
    answer:
      'Offerwall rewards arrive by server postback once the advertiser verifies your action — usually minutes, occasionally up to 12 hours. Pending conversions are listed with a live status, so you can see one exists before it credits. If it is older than 12 hours, open a ticket with the conversion id and support can chase the provider.',
    actions: [{ label: 'Conversion history', href: '/offerwall/history' }],
  },
  {
    match: ['shortlink', 'link', 'too fast'],
    answer:
      'A shortlink credits only after the server measures the full dwell time between starting it and claiming. Closing the tab early, or coming back before the countdown finishes, does not credit. Each link also has a daily cap that resets at 00:00 UTC.',
    actions: [{ label: 'Open shortlinks', href: '/shortlinks' }],
  },
  {
    match: ['referral', 'invite', 'commission', 'tier'],
    answer:
      'You earn a lifetime percentage of everything your referrals earn, credited the moment they earn it. A referral counts toward your tier once they reach level 1 — the tier ladder on the referrals page shows the rate each tier unlocks and how many qualified referrals it needs.',
    actions: [{ label: 'Your referrals', href: '/referrals' }],
  },
  {
    match: ['level', 'exp', 'bonus', 'streak'],
    answer:
      'Every claim awards experience. Levels raise your earning bonus, and so does a daily-bonus streak. The bonus is applied before the credit, and the exact basis points used are stored on the claim, so two similar claims can be reconciled against each other.',
    actions: [{ label: 'Daily bonus', href: '/daily-bonus' }],
  },
  {
    match: ['leaderboard', 'prize', 'rank', 'reset'],
    answer:
      'Five boards, reset weekly at Sunday 00:00 UTC, scored as your claims land. Prizes are credited automatically at the reset with a matching row in Transactions — there is nothing to claim, and a rank that moves after the reset does not change what you were paid.',
    actions: [{ label: 'Leaderboard', href: '/leaderboard' }],
  },
  {
    match: ['lottery', 'ticket', 'draw', 'random'],
    answer:
      'Tickets are bought with tokens and the purchase appears in Transactions. Before winners are picked the draw seed is written and the round closed; the plaintext seed is published with the result, so anybody can re-run the selection and check it.',
    actions: [{ label: 'Lottery', href: '/lottery' }],
  },
  {
    match: ['captcha', 'bot', 'challenge'],
    answer:
      'The captcha is verified on our server with a secret key, and a solved token is single-use. That is why a claim sometimes asks for a fresh one: the previous solve has already been spent.',
  },
  {
    match: ['email', 'verification', 'verified'],
    answer:
      'Email verification is required before your first withdrawal. The link is sent at signup and expires; request a new one from Settings. Everything else works without it.',
    actions: [{ label: 'Settings', href: '/account' }],
  },
  {
    match: ['transaction', 'history', 'ledger', 'balance'],
    answer:
      'Every credit and debit is one row in Transactions — bonuses, referral commission, coupon redemptions and withdrawal debits included. If a number looks wrong, that table is the record; quote the row when you open a ticket.',
    actions: [{ label: 'Transactions', href: '/transactions' }],
  },
];

/** Anything matching these bypasses the matcher entirely. */
const HUMAN_ONLY = [
  'withdraw',
  'withdrawal',
  'payout',
  'missing',
  'stolen',
  'hacked',
  'suspend',
  'banned',
  'refund',
];

const SUGGESTIONS = [
  'Why is my offerwall reward pending?',
  'How does the faucet cooldown work?',
  'How much do referrals pay?',
  'My withdrawal has not arrived',
];

let messageId = 1;

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = usePrefersReducedMotion();
  const { profile } = useSession();
  const { toast } = useToast();

  const [messages, setMessages] = React.useState<PanelMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [escalating, setEscalating] = React.useState(false);
  const [subject, setSubject] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || messages.length) return;
    setMessages([
      {
        id: messageId++,
        from: 'assistant',
        body: `I can explain how anything here works and point you at the page that proves it. For anything to do with money that has already moved, I open a ticket instead — ${brand.name} support reads those directly.`,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [messages, reduced]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question) return;

    setMessages((current) => [...current, { id: messageId++, from: 'you', body: question }]);
    setDraft('');

    const lower = question.toLowerCase();

    if (HUMAN_ONLY.some((word) => lower.includes(word))) {
      setMessages((current) => [
        ...current,
        {
          id: messageId++,
          from: 'assistant',
          body: 'That one goes to a human. Open a ticket and include the withdrawal or conversion id and roughly when it happened — support can look the record up directly from that.',
        },
      ]);
      setSubject(question.slice(0, 120));
      setEscalating(true);
      return;
    }

    const best = HELP.map((entry) => ({
      entry,
      score: entry.match.reduce((sum, key) => sum + (lower.includes(key) ? key.length : 0), 0),
    })).sort((a, b) => b.score - a.score)[0];

    if (best && best.score > 0) {
      setMessages((current) => [
        ...current,
        {
          id: messageId++,
          from: 'assistant',
          body: best.entry.answer,
          ...(best.entry.actions ? { actions: best.entry.actions } : {}),
        },
      ]);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: messageId++,
        from: 'assistant',
        body: 'I do not have a reliable answer for that, so I will not guess. Open a ticket and a person will pick it up.',
      },
    ]);
    setSubject(question.slice(0, 120));
    setEscalating(true);
  };

  const openTicket = async () => {
    setBusy(true);
    try {
      const transcript = messages
        .map((m) => `${m.from === 'you' ? 'User' : 'Assistant'}: ${m.body}`)
        .join('\n\n');

      await api.post('/api/tickets', {
        action: 'open',
        subject: subject || 'Support request from the help panel',
        category: 'Other',
        body: `${transcript}\n\n— opened from the support panel`,
      });

      setEscalating(false);
      setMessages((current) => [
        ...current,
        {
          id: messageId++,
          from: 'assistant',
          body: 'Ticket opened. It is in Support with the whole conversation attached, and you will get a notification when there is a reply.',
          actions: [{ label: 'Open Support', href: '/tickets' }],
        },
      ]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open that ticket.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          role="dialog"
          aria-label={`${brand.name} support`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          className={cn(
            'glass glass-strong fixed bottom-[84px] right-5 z-overlay flex w-[min(400px,calc(100vw-32px))] flex-col',
            'max-h-[min(620px,calc(100vh-140px))] overflow-hidden rounded-lg',
            'max-sm:bottom-[76px] max-sm:right-3',
          )}
        >
          <header className="flex flex-none items-center gap-3 border-b border-glass-line px-4 py-3">
            <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-mint-dim text-mint">
              <Bot aria-hidden="true" className="size-[17px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-13 font-semibold">{brand.assistant}</div>
              <div className="text-11 text-text-3">Answers, or a ticket. Never a guess.</div>
            </div>
            <IconButton aria-label="Close support panel" onClick={onClose}>
              <ChevronDown />
            </IconButton>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'max-w-[88%] rounded-md border px-3 py-2',
                    m.from === 'you'
                      ? 'self-end border-mint/30 bg-mint-dim'
                      : 'self-start border-line bg-surface-2',
                  )}
                >
                  {m.from === 'you' ? (
                    <span className="mb-1 flex items-center gap-2 text-11 text-text-3">
                      <Avatar initials={profile?.initials ?? 'VZ'} size="sm" />
                      You
                    </span>
                  ) : null}
                  <p className="whitespace-pre-wrap text-13 leading-body text-text-2">{m.body}</p>
                  {m.actions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <a
                          key={a.href}
                          href={a.href}
                          className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface-1 px-2 py-1 text-11 font-semibold text-mint hover:bg-surface-3"
                        >
                          {a.label}
                          <ArrowRight aria-hidden="true" className="size-3" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {messages.length <= 1 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-11 text-text-2 transition-colors duration-fast ease-out hover:bg-surface-3 hover:text-text"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {escalating ? (
            <div className="flex-none border-t border-glass-line p-4">
              <label htmlFor="escalate-subject" className="text-11 font-semibold text-text-2">
                Ticket subject
              </label>
              <Input
                id="escalate-subject"
                className="mt-1.5"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is wrong, in one line"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={openTicket} disabled={busy || !subject.trim()}>
                  <Headset aria-hidden="true" />
                  {busy ? 'Opening…' : 'Open ticket'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEscalating(false)}>
                  Not now
                </Button>
              </div>
              <p className="mt-2 text-11 text-text-3">
                The conversation above is attached, so you do not have to retype it.
              </p>
            </div>
          ) : (
            <form
              className="flex flex-none items-center gap-2 border-t border-glass-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <label htmlFor="support-input" className="sr-only">
                Your question
              </label>
              <Input
                id="support-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about anything on the site"
              />
              <Button type="submit" variant="primary" size="icon" aria-label="Send" disabled={!draft.trim()}>
                <Send aria-hidden="true" />
              </Button>
            </form>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
