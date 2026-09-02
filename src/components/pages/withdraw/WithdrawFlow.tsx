'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardPaste,
  Clock,
  Landmark,
  RefreshCw,
  Send,
  Shield,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { cryptoAmount, shortAddr, tokens } from '@/lib/format';
import { useCoinBurst, usePrefersReducedMotion } from '@/lib/hooks';
import { ApiError, endpoints } from '@/lib/api';
import type {
  CoinTicker,
  PayoutRail,
  PayoutRailName,
  SavedAddress,
  WithdrawQuote,
  WithdrawalRecord,
} from '@/lib/models';
import { COIN_NAMES } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Addon, Field, FieldError, Hint, Input, InputActions, InputGroup, Label } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import { SectionTitle } from '@/components/shell/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { CaptchaGate, isCaptchaRequired } from '@/components/captcha/CaptchaGate';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   WITHDRAW — guided payout flow
   ----------------------------------------------------------------------------
   Five steps, each answerable from what is on screen, and every number disclosed
   BEFORE the confirm rather than after.

   THE QUOTE COMES FROM THE SERVER AND IS HELD
   Nothing here computes what a withdrawal costs. `POST /api/withdraw` with
   `action: 'quote'` returns the amount, fee, receive amount, token cost and USD
   value, and those exact numbers are what the request is validated against. A
   browser that priced its own withdrawal is a browser that can be persuaded to
   price it at zero.

   The quote is re-fetched every 30 seconds while the review step is open, and the
   countdown is visible. A stale quote on an 8-decimal asset is a dispute.

   IDEMPOTENCY
   A `clientRequestId` is minted once per attempt and sent with the request. A
   double-submitted form — a slow network and an impatient second tap — returns
   the withdrawal the first attempt created rather than queueing a second payout.

   ADVERTISING
   None on this component. The withdraw page carries units above the header, in
   the rail and below the whole transaction card, and nothing between an amount
   field and a payout selector. A misclick there is a support ticket and a
   chargeback, which costs more than the impression earns.
   ========================================================================== */

const STEPS = ['Asset', 'Payout method', 'Destination', 'Amount', 'Review'] as const;
const QUOTE_SECONDS = 30;

type StepIndex = 1 | 2 | 3 | 4 | 5 | 6;

export interface WithdrawFlowProps {
  rails: PayoutRail[];
  addresses: SavedAddress[];
  minBalanceTokens: number;
  emailVerified: boolean;
  onSubmitted: (record: WithdrawalRecord, history: WithdrawalRecord[]) => void;
}

export function WithdrawFlow({
  rails,
  addresses,
  minBalanceTokens,
  emailVerified,
  onSubmitted,
}: WithdrawFlowProps) {
  const { toast } = useToast();
  const burst = useCoinBurst();
  const reduced = usePrefersReducedMotion();
  const { balance, applyClaim } = useSession();

  const [step, setStep] = React.useState<StepIndex>(1);
  const [coin, setCoin] = React.useState<CoinTicker | null>(null);
  const [rail, setRail] = React.useState<PayoutRailName | null>(null);
  const [address, setAddress] = React.useState('');
  const [saveAddress, setSaveAddress] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [quote, setQuote] = React.useState<WithdrawQuote | null>(null);
  const [quoteAge, setQuoteAge] = React.useState(0);
  const [quoting, setQuoting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(isCaptchaRequired ? null : '');
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<WithdrawalRecord | null>(null);

  /* One id per attempt, regenerated after a successful submit. */
  const requestId = React.useRef(crypto.randomUUID());

  const coins = React.useMemo(
    () => [...new Set(rails.map((r) => r.coin))],
    [rails],
  );
  const railsForCoin = React.useMemo(
    () => (coin ? rails.filter((r) => r.coin === coin) : []),
    [coin, rails],
  );
  const selectedRail = React.useMemo(
    () => railsForCoin.find((r) => r.rail === rail) ?? null,
    [railsForCoin, rail],
  );

  const reset = () => {
    setStep(1);
    setCoin(null);
    setRail(null);
    setAddress('');
    setAmount('');
    setQuote(null);
    setError(null);
    setReceipt(null);
    setSaveAddress(false);
    setCaptchaToken(isCaptchaRequired ? null : '');
    setCaptchaKey((k) => k + 1);
    requestId.current = crypto.randomUUID();
  };

  const back = () => setStep((s) => Math.max(1, s - 1) as StepIndex);

  /* ---- QUOTING ------------------------------------------------------------ */

  const fetchQuote = React.useCallback(
    async (silent = false) => {
      if (!coin || !rail || !amount) return;
      if (!silent) setQuoting(true);
      setError(null);
      try {
        const result = await endpoints.quoteWithdrawal({ coin, rail, amount });
        setQuote(result.quote);
        setQuoteAge(0);
      } catch (err) {
        setQuote(null);
        setError(err instanceof ApiError ? err.message : 'Could not price that withdrawal.');
      } finally {
        setQuoting(false);
      }
    },
    [coin, rail, amount],
  );

  /* Re-quote on a timer while the review step is open. */
  React.useEffect(() => {
    if (step !== 5) return;
    const id = window.setInterval(() => {
      setQuoteAge((age) => {
        if (age + 1 >= QUOTE_SECONDS) {
          void fetchQuote(true);
          return 0;
        }
        return age + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, fetchQuote]);

  const goToReview = async () => {
    await fetchQuote();
    setStep(5);
  };

  const submit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!coin || !rail || !quote) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await endpoints.requestWithdrawal({
        coin,
        rail,
        address,
        amount: quote.amount,
        clientRequestId: requestId.current,
        captchaToken,
        saveAddress,
        addressLabel: `${coin} ${rail}`,
      });

      setReceipt(result.withdrawal);
      applyClaim(-quote.tokenCost);
      onSubmitted(result.withdrawal, result.history);
      if (!reduced) burst(event.currentTarget);
      setStep(6);
      toast(
        result.withdrawal.status === 'HeldForReview'
          ? 'Queued for a manual check — you will hear back within 24 hours'
          : 'Withdrawal queued — you will be notified when it lands',
        'success',
      );
      requestId.current = crypto.randomUUID();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit that withdrawal.';
      setError(message);
      toast(message, 'danger');
      setCaptchaToken(isCaptchaRequired ? null : '');
      setCaptchaKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- BLOCKERS ----------------------------------------------------------- */

  if (!rails.length) {
    return (
      <Card as="section" pad="lg">
        <Alert tone="warning" icon={AlertTriangle}>
          No payout rails are configured yet, so withdrawals are unavailable. Rails live in{' '}
          <code className="font-mono text-12">/config/rates</code> and are edited in Admin → Rails.
        </Alert>
      </Card>
    );
  }

  if (!emailVerified) {
    return (
      <Card as="section" pad="lg">
        <Alert tone="warning" icon={Shield}>
          Verify your email address before your first withdrawal. The verification link was sent when you signed
          up — check your inbox, and your spam folder.
        </Alert>
      </Card>
    );
  }

  if (balance < minBalanceTokens) {
    return (
      <Card as="section" pad="lg">
        <Alert tone="info" icon={Clock}>
          You need at least <strong className="font-mono tabular">{tokens(minBalanceTokens)}</strong> tokens to
          withdraw, and you have <strong className="font-mono tabular">{tokens(balance)}</strong>. Claim the
          faucet or complete an offer to close the gap.
        </Alert>
      </Card>
    );
  }

  return (
    <Card as="section">
      <CardHead>
        <StepBar step={step} />
      </CardHead>

      <CardBody>
        {step === 1 ? (
          <StepAsset
            coins={coins}
            onPick={(c) => {
              setCoin(c);
              setRail(null);
              setStep(2);
            }}
          />
        ) : null}

        {step === 2 && coin ? (
          <StepRail
            coin={coin}
            rails={railsForCoin}
            onBack={back}
            onPick={(r) => {
              setRail(r);
              setStep(3);
            }}
          />
        ) : null}

        {step === 3 && coin && rail && selectedRail ? (
          <StepDestination
            coin={coin}
            rail={rail}
            value={address}
            onChange={setAddress}
            saved={addresses.filter((a) => a.coin === coin && a.rail === rail)}
            save={saveAddress}
            onSaveChange={setSaveAddress}
            onBack={back}
            onNext={() => setStep(4)}
          />
        ) : null}

        {step === 4 && coin && selectedRail ? (
          <StepAmount
            coin={coin}
            rail={selectedRail}
            value={amount}
            onChange={setAmount}
            balance={balance}
            quote={quote}
            quoting={quoting}
            error={error}
            onQuote={() => void fetchQuote()}
            onBack={back}
            onNext={() => void goToReview()}
          />
        ) : null}

        {step === 5 && coin && rail && quote ? (
          <StepReview
            coin={coin}
            rail={rail}
            address={address}
            quote={quote}
            quoteAge={quoteAge}
            quoting={quoting}
            error={error}
            captchaKey={captchaKey}
            onCaptcha={setCaptchaToken}
            captchaSatisfied={!isCaptchaRequired || Boolean(captchaToken)}
            submitting={submitting}
            onBack={back}
            onConfirm={submit}
          />
        ) : null}

        {step === 6 && receipt ? <StepDone record={receipt} onReset={reset} /> : null}
      </CardBody>
    </Card>
  );
}

/* ---- STEP BAR ------------------------------------------------------------- */

function StepBar({ step }: { step: StepIndex }) {
  return (
    <ol className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = step > number;
        const current = step === number;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-12 font-semibold',
                current && 'bg-mint-dim text-mint',
                done && 'text-text-3',
                !current && !done && 'text-text-3 opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid size-[18px] flex-none place-items-center rounded-full font-mono text-[10px]',
                  current ? 'bg-mint text-text-on-mint' : done ? 'bg-mint-dim text-mint' : 'bg-surface-3',
                )}
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : number}
              </span>
              {label}
            </span>
            {number < STEPS.length ? (
              <ChevronLeft aria-hidden="true" className="size-3 rotate-180 text-text-3 opacity-50" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---- STEP 1: ASSET -------------------------------------------------------- */

function StepAsset({ coins, onPick }: { coins: CoinTicker[]; onPick: (c: CoinTicker) => void }) {
  return (
    <>
      <SectionTitle>Which asset do you want?</SectionTitle>
      <p className="mt-1 text-12 text-text-3">
        Your balance is held in tokens and converted at the rate shown on the next screens.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {coins.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border border-line bg-surface-1 p-3 text-left',
                'transition-[border-color,background-color,transform] duration-base ease-out',
                'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <CoinIcon ticker={c} size="lg" labelled={false} />
              <span className="flex min-w-0 flex-col">
                <span className="text-13 font-semibold text-text">{c}</span>
                <span className="truncate text-11 text-text-3">{COIN_NAMES[c] ?? c}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---- STEP 2: RAIL --------------------------------------------------------- */

const RAIL_BLURB: Record<PayoutRailName, string> = {
  FaucetPay: 'Micro-payout wallet. Lowest minimum, settles in seconds.',
  CWallet: 'Custodial wallet. Low minimum, settles in seconds.',
  Direct: 'Straight to your own on-chain address. Batched, so slower.',
};

function StepRail({
  coin,
  rails,
  onBack,
  onPick,
}: {
  coin: CoinTicker;
  rails: PayoutRail[];
  onBack: () => void;
  onPick: (r: PayoutRailName) => void;
}) {
  return (
    <>
      <SectionTitle>How should we send your {coin}?</SectionTitle>
      <p className="mt-1 text-12 text-text-3">
        Every minimum, fee and arrival estimate below is the live configured value — not an example.
      </p>

      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {rails.map((r) => (
          <li key={`${r.rail}-${r.network}`}>
            <button
              type="button"
              onClick={() => onPick(r.rail)}
              className={cn(
                'flex h-full w-full flex-col gap-2 rounded-md border border-line bg-surface-1 p-4 text-left',
                'transition-[border-color,background-color,transform] duration-base ease-out',
                'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-13 font-semibold text-text">
                  <Landmark aria-hidden="true" className="size-4 text-text-3" />
                  {r.rail}
                </span>
                <Pill tone={r.rail === 'Direct' ? 'warning' : 'mint'}>{r.etaLabel}</Pill>
              </span>

              <span className="text-11 leading-body text-text-3">{RAIL_BLURB[r.rail]}</span>

              <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 text-11">
                <dt className="text-text-3">Minimum</dt>
                <dd className="text-right font-mono tabular text-text-2">
                  {r.min} {coin}
                </dd>
                <dt className="text-text-3">Network fee</dt>
                <dd className="text-right font-mono tabular text-text-2">
                  {Number(r.fee) === 0 ? 'None' : `${r.fee} ${coin}`}
                </dd>
                <dt className="text-text-3">Network</dt>
                <dd className="text-right text-text-2">{r.network}</dd>
              </dl>
            </button>
          </li>
        ))}
      </ul>

      <BackRow onBack={onBack} />
    </>
  );
}

/* ---- STEP 3: DESTINATION -------------------------------------------------- */

function StepDestination({
  coin,
  rail,
  value,
  onChange,
  saved,
  save,
  onSaveChange,
  onBack,
  onNext,
}: {
  coin: CoinTicker;
  rail: PayoutRailName;
  value: string;
  onChange: (v: string) => void;
  saved: SavedAddress[];
  save: boolean;
  onSaveChange: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [touched, setTouched] = React.useState(false);
  const empty = touched && !value.trim();

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
    } catch {
      // Clipboard permission refused. The field is still typeable.
    }
  };

  return (
    <>
      <SectionTitle>Where should it go?</SectionTitle>
      <p className="mt-1 text-12 text-text-3">
        {rail === 'Direct'
          ? `A ${coin} address on the network shown on the previous step. Check it twice — an on-chain payout to a wrong address cannot be recovered.`
          : `Your ${rail} email, username, or a ${coin} address registered with them.`}
      </p>

      {saved.length ? (
        <div className="mt-4">
          <span className="text-11 uppercase tracking-wide text-text-3">Saved</span>
          <ul className="mt-2 flex flex-wrap gap-2">
            {saved.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onChange(a.address)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-3 py-1.5',
                    'text-12 transition-colors duration-fast ease-out hover:border-line-strong hover:bg-surface-3',
                    value === a.address && 'border-mint bg-mint-dim text-mint',
                  )}
                >
                  <span className="font-semibold">{a.label}</span>
                  <span className="font-mono text-11 text-text-3">{shortAddr(a.address, 6, 4)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field className="mt-4">
        <Label htmlFor="wd-address">Destination</Label>
        <InputGroup>
          <Input
            id="wd-address"
            mono
            hasTrailing
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={empty}
            aria-describedby="wd-address-hint"
            placeholder={rail === 'Direct' ? `${coin} address` : `${rail} email or username`}
          />
          <InputActions>
            <Button variant="ghost" size="sm" onClick={paste}>
              <ClipboardPaste aria-hidden="true" />
              Paste
            </Button>
          </InputActions>
        </InputGroup>
        {empty ? <FieldError>Enter a destination.</FieldError> : null}
        <Hint id="wd-address-hint">
          The format is checked on our server before anything is debited, so a typo is rejected rather than sent.
        </Hint>
      </Field>

      <Checkbox className="mt-4" checked={save} onChange={(e) => onSaveChange(e.target.checked)}>
        Save this destination for next time
      </Checkbox>

      <BackRow onBack={onBack}>
        <Button variant="primary" disabled={!value.trim()} onClick={onNext}>
          Continue
          <ArrowRight aria-hidden="true" />
        </Button>
      </BackRow>
    </>
  );
}

/* ---- STEP 4: AMOUNT ------------------------------------------------------- */

function StepAmount({
  coin,
  rail,
  value,
  onChange,
  balance,
  quote,
  quoting,
  error,
  onQuote,
  onBack,
  onNext,
}: {
  coin: CoinTicker;
  rail: PayoutRail;
  value: string;
  onChange: (v: string) => void;
  balance: number;
  quote: WithdrawQuote | null;
  quoting: boolean;
  error: string | null;
  onQuote: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  /* Debounced re-quote as the user types. The server owns the arithmetic, so the
     live preview has to be a round-trip rather than a local calculation. */
  React.useEffect(() => {
    if (!value) return;
    const id = window.setTimeout(onQuote, 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const belowMin = Boolean(value) && parseFloat(value) < parseFloat(rail.min);
  const overBalance = Boolean(quote) && quote!.tokenCost > balance;

  return (
    <>
      <SectionTitle>How much?</SectionTitle>
      <p className="mt-1 text-12 text-text-3">
        Minimum {rail.min} {coin}. The token cost is computed on our server and shown before you confirm.
      </p>

      <Field className="mt-4">
        <Label htmlFor="wd-amount">Amount</Label>
        <InputGroup>
          <Input
            id="wd-amount"
            mono
            hasTrailing
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-invalid={belowMin || overBalance}
            placeholder={rail.min}
          />
          <InputActions>
            <Addon>{coin}</Addon>
            {quote?.max ? (
              <Button variant="ghost" size="sm" onClick={() => onChange(quote.max)}>
                Max
              </Button>
            ) : null}
          </InputActions>
        </InputGroup>

        {belowMin ? (
          <FieldError>
            Below the {rail.min} {coin} minimum for {rail.rail}.
          </FieldError>
        ) : overBalance ? (
          <FieldError>
            That costs {tokens(quote!.tokenCost)} tokens and you have {tokens(balance)}.
          </FieldError>
        ) : (
          <Hint>
            You have {tokens(balance)} tokens{quote?.max ? `, about ${quote.max} ${coin} after the fee` : ''}.
          </Hint>
        )}
      </Field>

      {quote ? (
        <dl className="mt-4 grid gap-x-4 gap-y-2 rounded-md border border-line bg-surface-2 p-4 text-13 sm:grid-cols-2">
          <dt className="text-text-3">You receive</dt>
          <dd className="text-right font-mono font-semibold tabular text-text">
            {cryptoAmount(Number(quote.receiveAmount), coin)} {coin}
          </dd>
          <dt className="text-text-3">Network fee</dt>
          <dd className="text-right font-mono tabular text-text-2">
            {Number(quote.fee) === 0 ? 'None' : `${quote.fee} ${coin}`}
          </dd>
          <dt className="text-text-3">Token cost</dt>
          <dd className="text-right font-mono tabular text-text-2">{tokens(quote.tokenCost)}</dd>
          <dt className="text-text-3">Estimated value</dt>
          <dd className="text-right font-mono tabular text-text-2">${quote.usdValue}</dd>
          <dt className="text-text-3">Arrives</dt>
          <dd className="text-right text-text-2">{quote.etaLabel}</dd>
        </dl>
      ) : null}

      {error ? (
        <Alert tone="danger" icon={AlertTriangle} className="mt-3 text-12">
          {error}
        </Alert>
      ) : null}

      <BackRow onBack={onBack}>
        <Button variant="primary" disabled={!quote || belowMin || overBalance || quoting} onClick={onNext}>
          {quoting ? 'Pricing…' : 'Review'}
          <ArrowRight aria-hidden="true" />
        </Button>
      </BackRow>
    </>
  );
}

/* ---- STEP 5: REVIEW ------------------------------------------------------- */

function StepReview({
  coin,
  rail,
  address,
  quote,
  quoteAge,
  quoting,
  error,
  captchaKey,
  onCaptcha,
  captchaSatisfied,
  submitting,
  onBack,
  onConfirm,
}: {
  coin: CoinTicker;
  rail: PayoutRailName;
  address: string;
  quote: WithdrawQuote;
  quoteAge: number;
  quoting: boolean;
  error: string | null;
  captchaKey: number;
  onCaptcha: (token: string | null) => void;
  captchaSatisfied: boolean;
  submitting: boolean;
  onBack: () => void;
  onConfirm: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const secondsLeft = Math.max(0, QUOTE_SECONDS - quoteAge);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Check this before you confirm</SectionTitle>
        <Pill tone={secondsLeft <= 5 ? 'warning' : 'neutral'} icon={quoting ? RefreshCw : Clock}>
          {quoting ? 'Re-pricing…' : `Quote holds ${secondsLeft}s`}
        </Pill>
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-3 rounded-md border border-line-strong bg-surface-2 p-4 text-13 sm:grid-cols-2">
        <dt className="text-text-3">Asset</dt>
        <dd className="text-right font-semibold text-text">
          {coin} · {COIN_NAMES[coin] ?? coin}
        </dd>

        <dt className="text-text-3">Method</dt>
        <dd className="text-right text-text-2">
          {rail} · {quote.network}
        </dd>

        <dt className="text-text-3">Destination</dt>
        <dd className="break-all text-right font-mono text-12 text-text-2">{address}</dd>

        <dt className="text-text-3">Amount sent</dt>
        <dd className="text-right font-mono font-semibold tabular text-mint">
          {cryptoAmount(Number(quote.receiveAmount), coin)} {coin}
        </dd>

        <dt className="text-text-3">Network fee</dt>
        <dd className="text-right font-mono tabular text-text-2">
          {Number(quote.fee) === 0 ? 'None' : `${quote.fee} ${coin}`}
        </dd>

        <dt className="text-text-3">Debited from balance</dt>
        <dd className="text-right font-mono tabular text-text-2">{tokens(quote.tokenCost)} tokens</dd>

        <dt className="text-text-3">Estimated value</dt>
        <dd className="text-right font-mono tabular text-text-2">${quote.usdValue}</dd>

        <dt className="text-text-3">Expected arrival</dt>
        <dd className="text-right text-text-2">{quote.etaLabel}</dd>
      </dl>

      <Alert tone="info" icon={Shield} className="mt-4">
        The tokens leave your spendable balance now and sit locked against this payout. If it is rejected they
        come straight back with a matching row in Transactions.
      </Alert>

      {isCaptchaRequired ? (
        <div className="mt-4">
          <CaptchaGate onToken={onCaptcha} resetKey={captchaKey} />
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" icon={AlertTriangle} className="mt-3 text-12">
          {error}
        </Alert>
      ) : null}

      <BackRow onBack={onBack}>
        <Button
          variant="primary"
          size="lg"
          disabled={submitting || quoting || !captchaSatisfied}
          onClick={onConfirm}
        >
          <Send aria-hidden="true" />
          {submitting
            ? 'Submitting…'
            : !captchaSatisfied
              ? 'Complete the captcha'
              : `Send ${cryptoAmount(Number(quote.receiveAmount), coin)} ${coin}`}
        </Button>
      </BackRow>
    </>
  );
}

/* ---- STEP 6: RECEIPT ------------------------------------------------------ */

function StepDone({ record, onReset }: { record: WithdrawalRecord; onReset: () => void }) {
  const held = record.status === 'HeldForReview';

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span
        className={cn(
          'grid size-14 place-items-center rounded-full',
          held ? 'bg-warning-dim text-warning' : 'bg-mint-dim text-mint',
        )}
      >
        {held ? <Clock aria-hidden="true" className="size-7" /> : <CheckCircle2 aria-hidden="true" className="size-7" />}
      </span>

      <div>
        <h3 className="text-18 font-semibold">
          {held ? 'Queued for review' : 'Withdrawal queued'}
        </h3>
        <p className="mt-1 max-w-[46ch] text-13 leading-body text-text-3">
          {held
            ? 'This one is above the automatic threshold, so a human checks it first. You will hear back within 24 hours and the tokens stay locked until then.'
            : `${record.receiveAmount} ${record.coin} is on its way to ${shortAddr(record.address)}. You will get a notification when it lands.`}
        </p>
      </div>

      <dl className="grid w-full max-w-[380px] gap-x-4 gap-y-2 rounded-md border border-line bg-surface-2 p-4 text-12">
        <div className="flex justify-between gap-4">
          <dt className="text-text-3">Reference</dt>
          <dd className="font-mono text-text-2">{record.id.slice(0, 12)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-3">Amount</dt>
          <dd className="font-mono tabular text-text-2">
            {record.receiveAmount} {record.coin}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-3">Method</dt>
          <dd className="text-text-2">
            {record.rail} · {record.network}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-3">Debited</dt>
          <dd className="font-mono tabular text-text-2">{tokens(record.tokenCost)} tokens</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={onReset}>
          Withdraw again
        </Button>
      </div>
    </div>
  );
}

/* ---- SHARED --------------------------------------------------------------- */

function BackRow({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        Back
      </Button>
      {children}
    </div>
  );
}
