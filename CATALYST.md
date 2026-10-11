# Vazionix — Deploy to Zoho Catalyst (Slate) + Supabase production setup

This is the end-to-end guide to get the site **live** on [Zoho Catalyst](https://catalyst.zoho.com)
so sign-up, login, faucet claims, withdrawals and the admin console all work against **real** data.

- **Backend:** Supabase (Postgres + Auth) — project `zlabpwyezgdbylogbcxm`, migrations applied.
- **Hosting:** Catalyst **Slate**, Zoho's Node.js service — the only Catalyst service that runs a
  Next.js App Router app natively (standalone build, `ZC` runtime headers, no Docker needed).
- **App root:** the `vazionix` folder. The repo root holds the old HTML prototype, not the
  app — run every command from `vazionix`.

```powershell
cd "F:\New Developemnts\vie-faucet-redesign-full\vazionix"
```

---

## 1. Supabase dashboard — one-time auth setup

1. **Auth → Providers → Google:** enable it, and put the Supabase callback
   (`https://zlabpwyezgdbylogbcxm.supabase.co/auth/v1/callback`) in your Google Cloud OAuth client.
2. **Auth → URL Configuration → Site URL:** set it to your **Catalyst production domain**
   (see §4 — the `*.zohocatalyst.com` URL or your custom domain).
   Add `http://localhost:3000` too so local sign-in works.
3. **Auth → URL Configuration → Redirect URLs:** add
   `https://your-catalyst-domain/auth/callback` **and** `http://localhost:3000/auth/callback`.
   Supabase rejects the post-login redirect if the URL is missing.
4. **Auth → Email:** keep confirmation enabled — the app gates the console on verified email,
   which is right for a payouts product.

**Schema is already applied.** All migrations — including 0019 (integrity fixes, RPC hardening,
referral trigger) and 0020 (`faq` / `legal` / `broadcasts` tables) — are live on the project.

If a migration ever needs re-applying:

```bash
node --env-file=.env.local scripts/apply-supabase-migration.mjs
```

The runner tracks applied migrations in `schema_migrations` and skips them, so re-running is safe.

---

## 2. Environment variables

Catalyst console → your Slate function → **Configuration → Advanced → Edit Environment Variables**.
(Or `catalyst config` locally.) Every variable below is read at runtime as `process.env.NAME`;
the complete annotated list lives in [`.env.example`](.env.example).

**Everything marked SERVER ONLY is a secret. It must never carry the `NEXT_PUBLIC_` prefix —
anything prefixed `NEXT_PUBLIC_` is inlined into the public browser bundle.**

### Required (Supabase backend)

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zlabpwyezgdbylogbcxm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | your `service_role` JWT — **SERVER ONLY** |
| `NEXT_PUBLIC_SITE_URL` | your Catalyst production domain |

### Identity / branding (optional)

`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_NOREPLY_EMAIL`, `NEXT_PUBLIC_SOCIAL_X`,
`NEXT_PUBLIC_SOCIAL_TELEGRAM`, `NEXT_PUBLIC_SOCIAL_DISCORD` (blank hides the icon).

### Ads

The build-time fallbacks for the six global overlay units and the shortlink hop —
`NEXT_PUBLIC_AD_GLOBAL_SOCIALBAR`, `_POPUNDER`, `_INPAGEPUSH`, `_INTERSTITIAL`, `_ANCHOR`,
`NEXT_PUBLIC_AD_SHORTLINK_DIRECTLINK`. The normal path is **Admin → Ads → Inventory** in the
app (writes `ad_units`, takes effect immediately); env vars are only the first-boot fallback.

### Captcha (when you hook AdsLab / hCaptcha / Turnstile)

| Var | Note |
| --- | --- |
| `NEXT_PUBLIC_CAPTCHA_PROVIDER` | `none` in dev; `adslab`/`hcaptcha`/`turnstile`/`recaptcha` in prod |
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | provider's public key |
| `NEXT_PUBLIC_CAPTCHA_SCRIPT_URL` | provider loader (required for AdsLab) |
| `CAPTCHA_SECRET_KEY` | **SERVER ONLY** |
| `CAPTCHA_VERIFY_URL` | override only if the provider differs |

### AdsLab offerwall (SERVER ONLY, never `NEXT_PUBLIC_`)

`ADSLAB_API_KEY` + `ADSLAB_SECRET_KEY` — the server-side offerwall API pair.

### Payout rails (when you process real withdrawals)

`FAUCETPAY_API_KEY`, `CWALLET_API_KEY` (+ `CWALLET_API_URL`) — **SERVER ONLY**.

### Staff / ops

`STAFF_REQUIRE_MFA=false` **only** while enrolling the first admin — remove it after.

---

## 3. Build for Slate

Slate detects the Next.js framework from `package.json` and packages the build itself —
no Dockerfile, no custom server, no `output: 'standalone'` change needed. Nothing in
`next.config.mjs` needs editing for Catalyst.

For a sanity build before deploying:

```bash
npm install
npm run build
```

`npm run build` also enforces the type gate (`ignoreBuildErrors: false`) — a payout
product does not ship on a type error, so a red build here is a build stopped on purpose.

**Memory:** console → your Slate function → Configuration → Advanced → Memory. `512 MB`
handles the console and faucet traffic comfortably; `1 GB` if you see OOM kills on cold
starts. The build itself is allowed 2 GB regardless of the serving memory.

---

## 4. Deploy to Catalyst Slate

Install the CLI once (`npm i -g zcatalyst-cli`), then from `vazionix`:

```bash
catalyst login                     # opens a browser sign-in
catalyst init slate                # link/create the project; choose Next.js
catalyst slate:link                # re-link the local folder to the Slate function
catalyst deploy slate --production # push the current build to production
```

- **Local run:** `catalyst serve` (or `ZC_SLATE_PORT=3000 npm run start` after `npm run build`)
  serves the standalone build at `http://localhost:3000`.
- **Updates:** re-run `catalyst deploy slate --production`. Deployments are versioned in the
  console; a bad push can be rolled back to the previous version from the function's version
  list — no rebuild needed.
- **Custom domain:** console → Catalyst → your project → Slate → **Domains** → add the domain
  and point the CNAME it shows you. Update `NEXT_PUBLIC_SITE_URL` and the Supabase redirect
  URLs (§1) to the final domain **before** promoting traffic to it.

If you prefer the console flow over the CLI: console → Slate → **Deploy from Direct Upload**
(upload the project zip) or connect the Git repository for build-on-push.

---

## 5. After first deploy — verify the money path

1. Open the production domain — the landing page loads and config reads work.
2. Sign up → confirm email (Supabase sends it) → sign in. The `handle_new_user` trigger
   creates the profile row, referral code and signup-bonus ledger entry.
3. Claim on the **Faucet** → balance rises, cooldown starts, the claim shows in Transactions.
4. Submit a **withdrawal** → row appears in Admin → Payouts; approve from the console
   (FaucetPay/CWallet send if the rail key is configured) or record the txid for a manual send.
5. **Admin console** → Users list loads, Review queue shows held withdrawals, the FAQ/Legal
   editors save.
6. Verify the ad-network verification file still returns exact bytes:
   `https://your-domain/6a9922b254e3a41fe63104ef.html` → `6a9922b254e3a41fe63104ef`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Login loops back with "email confirmation" | Supabase Auth → URL Configuration → the production domain must be in Site URL / Redirect URLs. |
| Admin console empty after deploy | `SUPABASE_SERVICE_ROLE_KEY` missing in the Slate env config — reads fall back to empty. |
| "Approve" withheld on withdrawals | Rail API keys (`FAUCETPAY_API_KEY` / `CWALLET_API_KEY`) not set — the button is hidden on purpose. |
| Cold-start OOM kills | Raise the Slate memory to 1 GB in Configuration → Advanced. |
| `catalyst` command not found | `npm i -g zcatalyst-cli`, then re-open the terminal. |
| Migration drift after pulling changes | `node --env-file=.env.local scripts/apply-supabase-migration.mjs` (idempotent). |
