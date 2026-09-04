# Vazionix — Live Deployment & Setup

Run everything from the **`vie-faucet-next`** folder. The repo root (`vie-faucet-redesign-full`)
contains the HTML prototype and NOT the app — running `firebase` or `npm` from there fails with
"not a Firebase project directory" / ENOENT `package.json`.

```powershell
cd "F:\New Developemnts\vie-faucet-redesign-full\vie-faucet-next"
```

---

## 0. Preconditions

- Firebase CLI installed and logged in: `firebase login` → `firebase login:list` shows your account.
- Firebase project **`vazionix`** exists (shown in `firebase projects:list`).
- Firebase plan is **Blaze (pay-as-you-go)** — Cloud Functions / scheduled jobs require it.
  Check: Firebase console → Project settings → Usage and billing.

---

## 1. Select the project & deploy rules

```powershell
firebase use vazionix
npm run deploy:rules        # pushes firestore.rules + firestore.indexes.json
```

- `npm run deploy:rules` runs `firebase deploy --only firestore:rules,firestore:indexes`.
- After deploying, open **Firestore → Indexes** and wait until every row reads **Enabled**
  (minutes on an empty project, hours on a populated one). Indexes still building cause
  `FAILED_PRECONDITION` on the leaderboard / withdrawal queue / ledger filters.

There are no storage rules — the app has no storage bucket wired, only Firestore.

---

## 2. Set functions secrets

Set in the console (**Functions → Secrets**) or CLI:

```powershell
# Optional: improves the spot-price feed. Skip if you don't have a key.
firebase functions:secrets:set COINGECKO_API_KEY --project vazionix

# One-time: allows your account to mint the first super_admin.
# Firestore / Admin → Platform: create /staff with role super_admin for the signed-up email.
firebase functions:secrets:set BOOTSTRAP_ADMIN_EMAIL --project vazionix
```

---

## 3. Deploy functions

```powershell
npm run deploy:functions    # compiles functions/ with tsc, then
                            # firebase deploy --only functions
```

Deploys 11 functions: 9 scheduled jobs (lottery draw, leaderboard reset, direct-withdrawal
batch, suspension expiry, streak sweep, rate refresh, daily stats rollup, ephemeral cleanup,
stale-chat escalation), 1 `onCall` (`setStaffRole`), 1 document trigger (`onUserLevelChange`),
1 auth trigger (`onUserDeleted`).

---

## 4. Seed config + catalogue

```powershell
npm run seed:config          # economy, rates, site, ads, stats/global, lottery/current
npm run seed:catalogue       # PTC ads, shortlinks, challenges, offerwall providers
```

Both are idempotent (merge missing keys, never overwrite existing values). Run after every
release so new keys appear; safe to re-run.

---

## 5. Bootstrap the first admin

After signing up through the site (a real username + verified email):

```powershell
npm run bootstrap:admin
```

Set `STAFF_REQUIRE_MFA=false` in Vercel **only** for this enrollment, then remove it.

---

## 6. Vercel environment variables

All verified as read by real code. Add in **Vercel → Project → Settings → Environment Variables**.

From **Firebase console → Project settings → General → Your apps** (web SDK config):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `vazionix.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `vazionix` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `vazionix.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |
| `NEXT_PUBLIC_SITE_URL` | `https://vazionixfaucet.vercel.app` (or custom domain) |

**Server-only secret — Firebase → Project settings → Service accounts → Generate new private key → base64-encode the whole JSON:**

```
base64 -w0 path/to/service-account.json
```

| Variable | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `base64 -w0` single line of the service-account JSON |

Optional / by feature:
- `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_NOREPLY_EMAIL`
- `NEXT_PUBLIC_CAPTCHA_PROVIDER`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY`, `NEXT_PUBLIC_CAPTCHA_SCRIPT_URL` + server `CAPTCHA_SECRET_KEY`
- `NEXT_PUBLIC_AD_GLOBAL_SOCIALBAR`, `POPUNDER`, `INPAGEPUSH`, `INTERSTITIAL`, `ANCHOR`, `NEXT_PUBLIC_AD_SHORTLINK_DIRECTLINK`
- `FAUCETPAY_API_KEY`, `CWALLET_API_KEY` (+ optional `CWALLET_API_URL`)
- `STAFF_REQUIRE_MFA=false` — first-admin enrollment only

---

## 7. Deploy the app

```powershell
git push origin main        # push triggers the Vercel build automatically
```

Verify the ad-network verification file returns the exact bytes:

```
https://vazionixfaucet.vercel.app/6a9922b254e3a41fe63104ef.html
→ 6a9922b254e3a41fe63104ef
```

---

## 8. One-time TTL policies (console — no gcloud needed)

Firestore → **Time-to-live (TTL)** → Create policy:

1. Collection group `captchaTokens`, field `expiresAt`
2. Collection group `taskSessions`, field `expiresAt`

Both are pure churn and should auto-delete; the `cleanupEphemeral` scheduled function is the
safety net but falls behind at volume, so the TTL is the real cost control.

---

## Deployment order (why this order)

Rules and indexes first — an index still building makes a query **fail**, not run slowly.
So: rules → (wait for indexes Enabled) → functions → seeds → app. See `DEPLOY.md` for the
index derivation table and rule-verification checklist.