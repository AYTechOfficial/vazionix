'use client';

import * as React from 'react';
import { Check, Save } from 'lucide-react';

import { ApiError, endpoints } from '@/lib/api';
import { getAuthApi } from '@/lib/auth-api';
import { COIN_TICKERS, type CoinTicker, type UserProfile } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Field, FieldError, Hint, Input, Label } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   ACCOUNT SETTINGS
   ----------------------------------------------------------------------------
   Everything a user may change about themselves, and nothing that decides what
   they earn. Balance, level, bonus, referral tier and commission rate are
   server-owned and are not writable from here or from firestore.rules — the
   settings surface is deliberately narrow so there is no doubt about which
   fields a client can touch.

   A username change is a transaction over two documents (the profile and the
   `/usernames/{lower}` uniqueness claim), so it gets its own form and its own
   error rather than being folded into a "save all" button that half-succeeds.
   ========================================================================== */

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'IN', name: 'India' }, { code: 'US', name: 'United States' }, { code: 'BR', name: 'Brazil' },
  { code: 'ID', name: 'Indonesia' }, { code: 'NG', name: 'Nigeria' }, { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' }, { code: 'EG', name: 'Egypt' }, { code: 'UA', name: 'Ukraine' },
  { code: 'TH', name: 'Thailand' }, { code: 'KE', name: 'Kenya' }, { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'TR', name: 'Turkey' }, { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' }, { code: 'CO', name: 'Colombia' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'PL', name: 'Poland' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'ZA', name: 'South Africa' }, { code: 'MA', name: 'Morocco' },
  { code: 'MY', name: 'Malaysia' }, { code: 'JP', name: 'Japan' }, { code: 'NP', name: 'Nepal' },
];

const NOTIFICATION_KEYS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'withdrawals', label: 'Withdrawals', hint: 'When a payout is queued, sent or returned' },
  { key: 'referrals', label: 'Referrals', hint: 'When someone signs up with your link or qualifies' },
  { key: 'email', label: 'Email copies', hint: 'Send the same notifications to your inbox' },
  { key: 'promos', label: 'Announcements', hint: 'Coupon drops, contests and product changes' },
];

export function AccountSettings({ profile: initial }: { profile: UserProfile }) {
  const { setProfile } = useSession();
  const { toast } = useToast();

  const [username, setUsername] = React.useState(initial.username);
  const [country, setCountry] = React.useState(initial.countryCode);
  const [currency, setCurrency] = React.useState<CoinTicker>(initial.displayCurrency);
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({
    withdrawals: true,
    referrals: true,
    email: true,
    promos: false,
  });

  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingName, setSavingName] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const result = await endpoints.updateAccount({
        countryCode: country,
        displayCurrency: currency,
        notificationPrefs: prefs,
      });
      if (result.profile) setProfile(result.profile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save those settings.', 'danger');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveUsername = async () => {
    if (username === initial.username) return;
    setSavingName(true);
    setNameError(null);
    try {
      const result = await endpoints.changeUsername(username);
      if (result.profile) setProfile(result.profile);
      toast('Username updated', 'success');
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : 'Could not change your username.');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card as="section">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Username</CardTitle>
            <CardSub>Shown on leaderboards and to anyone you refer</CardSub>
          </div>
        </CardHead>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field className="min-w-[220px] flex-1">
              <Label htmlFor="acc-username">Username</Label>
              <Input
                id="acc-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                aria-invalid={Boolean(nameError)}
                maxLength={20}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
              <Hint>3–20 characters: letters, numbers, underscore or dot.</Hint>
            </Field>
            <Button
              variant="secondary"
              onClick={saveUsername}
              disabled={savingName || username === initial.username || username.length < 3}
            >
              {savingName ? 'Saving…' : 'Change username'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card as="section">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Preferences</CardTitle>
            <CardSub>Country drives payout availability and the referral map</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="acc-country">Country</Label>
              <Select id="acc-country" value={country} onChange={(e) => setCountry(e.target.value)}>
                {!COUNTRIES.some((c) => c.code === country) ? (
                  <option value={country}>{country === 'XX' ? 'Not set' : country}</option>
                ) : null}
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label htmlFor="acc-currency">Display currency</Label>
              <Select
                id="acc-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CoinTicker)}
              >
                {COIN_TICKERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Hint>Only changes how your balance is displayed, never what you hold.</Hint>
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <span className="text-12 font-semibold text-text-2">Notifications</span>
            {NOTIFICATION_KEYS.map((n) => (
              <label key={n.key} className="flex items-start justify-between gap-4">
                <span className="flex min-w-0 flex-col">
                  <span className="text-13 text-text">{n.label}</span>
                  <span className="text-11 text-text-3">{n.hint}</span>
                </span>
                <Switch
                  checked={prefs[n.key] ?? false}
                  onChange={(e) => setPrefs((p) => ({ ...p, [n.key]: e.target.checked }))}
                  aria-label={n.label}
                />
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={saveProfile} disabled={savingProfile}>
              {saved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
              {savingProfile ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card as="section">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Security</CardTitle>
            <CardSub>Password and session controls</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-3">
          <Alert tone="info">
            Password changes and email verification go through Firebase Authentication directly. Use the reset
            link on the sign-in page to change your password — we never see or store it.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void requestReset(initial.email, toast)}>
              Send a password reset email
            </Button>
            <Button variant="danger" onClick={() => void signOutEverywhere()}>
              Sign out of every device
            </Button>
          </div>
          <p className="text-11 text-text-3">
            Signing out everywhere revokes every session token, so any device that was signed in has to
            authenticate again.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

async function requestReset(email: string, toast: (m: string, t?: 'success' | 'danger') => void) {
  const auth = await getAuthApi();
  const result = await auth.resetPassword(email);
  toast(
    result.ok ? `Reset link sent to ${email}` : (result.message ?? 'Could not send that email'),
    result.ok ? 'success' : 'danger',
  );
}

async function signOutEverywhere() {
  const auth = await getAuthApi();
  await auth.signOutEverywhere();
  window.location.href = '/login';
}
