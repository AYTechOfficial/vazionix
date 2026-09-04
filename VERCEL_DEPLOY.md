# Vazionix — Deploy to Vercel + Supabase production setup

This is the end-to-end setup so the site is **live**, sign-up/login works, and you
can test every feature (faucet, transactions, withdraw) against **real** data.

The backend is **Supabase** (Postgres + Auth). Vercel hosts the Next.js app.

---

## 1. Supabase project (already created — `zlabpwyezgdbylogbcxm`)

Your project exists. You already have: URL, publishable key, service_role key,
DB connection (via pooler, since your direct host is IPv6-only on Windows).

**Do these in the Supabase dashboard once:**

1. **Auth → Providers → Google**: enable it. Set the **Redirect URL** Supabase
   gives you (`https://<project>.supabase.co/auth/v1/callback`) in your Google
   Cloud OAuth client. This is what makes "Continue with Google" work.
2. **Auth → URL Configuration → Site URL**: set to your Vercel domain
   (e.g. `https://vazionixfaucet.vercel.app`).
   Add `https://localhost:3000` too so local sign-in works.
3. **Auth → URL Configuration → Redirect URLs**: add `https://your-domain.vercel.app/auth/callback`
   and `http://localhost:3000/auth/callback`. This is required or Supabase
   rejects the post-login redirect.
4. **Auth → Email**: keep confirmation enabled (you need it, the app pushes to
   /login until email is confirmed). You can disable it only if you want instant
   login without email verification — not recommended on a payouts product.

**The schema + functions are already applied.** The migrations (users, claims,
withdrawals, leaderboard, cooldowns, saved_addresses, stats, audit, ad_units,
the `credit`/`debit`/`refund` /profile triggers, grants) are committed and live.

---

## 2. Vercel env vars

In **Vercel → Project → Settings → Environment Variables**, add these. Split
your Firebase vs Supabase vars clearly.

### Required (Supabase backend)
| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zlabpwyezgdbylogbcxm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | your `service_role <jwt>` — SERVER ONLY, never `NEXT_PUBLIC_` |
| `DATA_BACKEND` | `supabase` |
| `NEXT_PUBLIC_SITE_URL` | `https://vazionixfaucet.vercel.app` (your live domain) |

### Firebase (only if you keep the Firebase half as a fallback)
These are only read on the Firebase backend. You can leave them unset if you only
run Supabase. If set, they let `DATA_BACKEND=firebase` work for a revert test.
| Var |
| --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` (base64 service-account JSON) |

### Identity / branding (optional but recommended)
| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `support@vazionix.com` |
| `NEXT_PUBLIC_NOREPLY_EMAIL` | `noreply@vazionix.com` |
| `NEXT_PUBLIC_SOCIAL_X` | your handle |
| `NEXT_PUBLIC_SOCIAL_TELEGRAM` | your link |
| `NEXT_PUBLIC_SOCIAL_DISCORD` | your invite (blank hides the icon) |

### Ads (your main revenue — the slots are wired, fill them)
The env fallbacks for the six global overlay units + the shortlink hop.
For each, either a bare URL (script tag) or a one-line JSON AdUnitConfig.
| Var |
| --- |
| `NEXT_PUBLIC_AD_GLOBAL_SOCIALBAR` |
| `NEXT_PUBLIC_AD_GLOBAL_POPUNDER` |
| `NEXT_PUBLIC_AD_GLOBAL_INPAGEPUSH` |
| `NEXT_PUBLIC_AD_GLOBAL_INTERSTITIAL` |
| `NEXT_PUBLIC_AD_GLOBAL_ANCHOR` |
| `NEXT_PUBLIC_AD_SHORTLINK_DIRECTLINK` |
The normal path is **Admin → Ads → Inventory** in the app (writes `/adUnits` /
`ad_units` and takes effect immediately). Env is a build-time fallback only.

### Captcha (when you hook AdsLab/hCaptcha/etc.)
| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_CAPTCHA_PROVIDER` | `none` in dev; `adslab`/`hcaptcha`/`turnstile`/`recaptcha` in prod |
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | provider's public key |
| `NEXT_PUBLIC_CAPTCHA_SCRIPT_URL` | provider-specific loader (required for AdsLab) |
| `CAPTCHA_SECRET_KEY` | SERVER ONLY |
| `CAPTCHA_VERIFY_URL` | override only if provider differs |

### Payout rails (when you process REAL withdrawals)
| Var | Value |
| --- | --- |
| `FAUCETPAY_API_KEY` | SERVER ONLY |
| `CWALLET_API_KEY` (+ `CWALLET_API_URL`) | SERVER ONLY |

### Staff / ops
| Var | Value |
| --- | --- |
| `STAFF_REQUIRE_MFA=false` | ONLY while enrolling the first admin (then remove) |
| `BOOTSTRAP_ADMIN_EMAIL` | read by the functions runtime, not the app |

---

## 3. Deploy

```bash
# in F:\New Developemnts\vie-faucet-redesign-full\vie-faucet-next
git add -A && git commit -m "deploy: ..." && git push origin main
```

Pushing triggers the Vercel production build automatically. After it deploys:

- Open `https://your-domain.vercel.app` — landing loads, config reads work.
- **Sign up** a real account → it creates the auth row + profile trigger.
- **Verify the ad-network file** still returns exact bytes:
  `https://your-domain.vercel.app/6a9922b254e3a41fe63104ef.html` → `6a9922b254e3a41fe63104ef`.

---

## 4. After first deploy — verify the money path in production

1. Sign up → you land on /login (email confirmation) → confirm email → sign in.
2. Go to **Faucet** and claim → balance increases, cooldown starts, daily count
   appears in Transactions.
3. Withdraw page shows the payout rails + your balance; submitting creates a
   withdrawal row.
4. Leaderboard shows your claims once they exist.

---

## 5. If something needs re-applying to Supabase (rare)

```bash
# from vie-faucet-next, with .env.local holding SUPABASE_DB_* (pooler host)
node --env-file=.env.local scripts/apply-supabase-migration.mjs
```
The runner tracks applied migrations in `schema_migrations` and skips them, so
re-running is safe.

---

## What's still Firebase-gated (honest note, as of this guide)

Porting status:
- ✅ **Verified working**: sign-up, login, profile bootstrap, faucet claim
  (credit/replay/daily-cap/cooldown), transactions (ledger list), withdraw
  submit + refund, leaderboard read, platform stats, notifications.
- ⏳ **Still Firestore-gated** (returns empty until ported): PTC ads, shortlinks,
  coupon, lottery, offerwall grids, and the support-ticket reads. These read
  Firestore documents and fall back to empty on the Supabase backend. They don't
  break the faucet, but "everything" means these need porting next.
- 🔧 **Scheduled jobs**: the 9 Cloud Functions (lottery draw, leaderboard reset,
  withdrawal batch, streak sweep, rate refresh, stats rollup, cleanup, chat
  escalation, suspension expiry) are not yet ported to pg_cron/Edge.

The faucet core is production-ready. The earn economy + jobs are the remaining
milestone before "every feature works."