# Vazionix

Vazionix is a crypto faucet: users earn integer tokens from a timed faucet, PTC
ads, shortlinks, offerwalls, a daily bonus ladder, challenges and a weekly
lottery, then withdraw them as BTC, LTC, DOGE, TRX, USDT, SOL, TON, BNB or one of
four memecoins. It runs on Next.js 15 with **Supabase** (Postgres + Auth) and is
hosted on **Zoho Catalyst Slate**, and every balance change goes through one
ledger path so the books are checkable. This README is for whoever is deploying
and operating it.

- [1. What it is](#1-what-it-is)
- [2. Architecture](#2-architecture)
- [3. The money model](#3-the-money-model)
- [4. Getting started](#4-getting-started)
- [5. Deploying](#5-deploying)
- [6. Filling the ad slots](#6-filling-the-ad-slots)
- [7. Wiring the AdsLab captcha](#7-wiring-the-adslab-captcha)
- [8. Connecting an offerwall](#8-connecting-an-offerwall)
- [9. Payout rails](#9-payout-rails)
- [10. Operating it](#10-operating-it)
- [11. What is deliberately not built](#11-what-is-deliberately-not-built)

---

## 1. What it is

A faucet with eight earning surfaces, three payout rails, a staff console behind
53 permissions, and 82 ad placements you fill yourself. Revenue is advertising:
the placement map is dense on purpose, the captcha is a monetised widget, and
the shortlink engine sends users through your own direct link.

Nothing ships with inventory. The PTC wall, the shortlink list and the offerwall
grid are Postgres tables that start empty and render as empty. The previous
revision of this project served them from fixture modules full of invented
advertisers and URLs that went nowhere, and users clicked them; removing that was
the point of the rebuild.

---

## 2. Architecture

```
Browser
  ├─ Server Components  ──────► src/server/**  (service-role)  reads
  ├─ Route Handlers /api/** ──► src/server/**  (service-role)  every write
  ├─ Supabase SSR client ────► auth.getUser()  session + profile refresh
  └─ middleware.ts (edge)  ───► referral capture, admin perimeter
Postgres (Supabase) ─► SECURITY DEFINER RPCs: credit / debit / refund,
                        bump_stats, set_withdrawal_status
```

**Two clients, two jobs.** `src/server/supabase.ts` holds the service-role
client — it fully bypasses RLS and never crosses into the browser bundle;
everything in `src/server/**` uses it for reads and writes. `src/lib/supabase/`
holds the SSR cookie client built on `@supabase/ssr` — the browser uses it for
sign-in/sign-up and `auth.getUser()`, and it never sees the service-role key.

**Reads are Server Components.** Every page renders on the server through
`src/server/**`. A page component receives a plain read model with ISO date
strings, never a Postgres row — `src/server/db.ts#iso()` is the single place
that conversion happens.

**Writes are Route Handlers, and none of them are in the client.** Claiming the
faucet is `POST /api/earn/faucet`, not a client query against a table. Three
reasons, in order of how much they matter:

1. **The cooldown, the daily cap and the dwell timer are server state.** A
   faucet whose cooldown lives in `localStorage` pays out on every hard
   refresh. A PTC view whose 20 seconds are measured by a browser timer pays
   out on a forged flag. Both are measured between two server timestamps here.
2. **The credit and the ledger row have to land together.** `credit()` is the
   `credit(int, int, …)` SECURITY DEFINER function in Postgres: it inserts the
   `claims` row, updates `users.balance`, pays the referral commission and
   bumps the counters **in one transaction**. A client write cannot be
   transactional with money.
3. **RLS on the money tables denies the anon and authenticated roles.**
   `credit`/`debit`/`refund` are granted to `service_role` only — `revoke
   execute ... from public` — so a caller with the publishable key talking to
   the PostgREST API directly, having never loaded our JavaScript, can run none
   of them.

**The browser never polls the money path.** `SessionProvider` refreshes the
profile from `/api/account` on an interval and after each user action; the
balance it displays is what the server just said, never a local write.

**Middleware does two jobs and authorises nothing.** It runs on the edge
runtime, where the service-role client cannot live, so it verifies nothing. It
captures `?r=<code>` into a `vazionix-ref` cookie on every non-static route and
redirects to the same URL without the parameter — so attribution survives a
bounce to the landing page, a read of the terms and a signup ten minutes later.
Then, for `/admin/**`, it routes on Supabase auth-cookie **presence**: no
`sb-*-auth-token` cookie goes to `/admin/login`. The real check is
`requirePermission()` inside every admin page and route handler, which reads the
verified session and the `staff` table — the perimeter redirect is UX, not a
boundary.

**Cookies**, named from `brand.slug` in `src/lib/brand.ts` so two products on
sibling subdomains cannot clobber each other:

| Cookie | Set by | httpOnly | What it is |
| --- | --- | --- | --- |
| `sb-*-auth-token` (several) | `@supabase/ssr` | yes | The Supabase session. The credential. |
| `vazionix-ref` | `middleware.ts` | no | Referral code, 30 days. Readable so the register form can prefill it. |
| `vazionix-theme` | theme toggle | no | Light or dark, so the server renders the right one first. |
| `vazionix-sidebar`, `vazionix-admin-sidebar` | UI | no | Collapsed state. |

**Scheduled work is not in this process.** The Cloud Functions that used to run
the leaderboard reset, the lottery draw, rate refresh and cleanup are gone with
Firebase. Of those, the lottery draw and leaderboard reset now have server
functions (`src/server/earn/lottery.ts#drawLottery`) reachable from the console;
rate refresh keeps quoting the last stored values — stale, never zero — until a
cron source is wired. That is the honest state; see §11.

---

## 3. The money model

**Tokens are integers.** One internal token is worth `config.rates.usdPerToken`
(shipped default `0.0000098`). Balances, rewards, prizes and commissions are
whole numbers of tokens, and the earning bonus is applied in basis points with
`Math.floor` — so the house rounds down and no float ever touches a balance.

**Asset amounts are decimal strings.** `amount`, `fee`, `receiveAmount` and
`quotedUsdPerUnit` on a withdrawal are strings like `"0.00020000"`. A float
cannot represent 8-decimal satoshi amounts exactly; a string can, and the
conversion happens once, deliberately, in `src/server/decimal.ts`.

**The ledger invariant:**

```
users.balance == sum(claims.amount for uid) - sum(withdrawals.token_cost)
```

Every credit is a `claims` row with a positive `amount`; every debit is one with
a negative `amount`. Both are written by the `credit`/`debit` Postgres functions
called from `src/server/ledger.ts`, and nothing else in the product writes
`balance`. A balance change with no matching claim row is a bug by definition,
and a manual admin adjustment goes through the same functions so it shows up in
the user's own transaction history rather than as an unexplained change.

**Idempotency keys, not retry counters.** Every credit path derives a
deterministic key from the *action*, and the `(user_id, client_request_id)`
unique constraint makes the replay fail with 23505, which `ledger.ts` maps to
"return the original result":

| Path | Key | Why that shape |
| --- | --- | --- |
| Faucet | `faucet_{floor(now / cooldown)}` | The window IS the key, so the replay guard and the cooldown timer cannot disagree. |
| Daily bonus | `daily_{floor(now / cooldownHours)}` | Keyed on the window, not the calendar day. |
| PTC / shortlink | `ptc_{itemId}_{minute}` | The session token is already single-use; this catches a double-tap inside one minute. |
| Offerwall | `ow_{providerId}_{providerTxId}` | The provider's own transaction id. Walls retry postbacks routinely. |
| Challenge | `challenge_{id}` or `challenge_{id}_{isoWeek}` | `once` pays forever, `weekly` resets with the week. |
| Coupon | `coupon_{CODE}` | Plus the `coupon_redemptions (code, user_id)` PK — one redemption per member per code, enforced by the database. |
| Withdrawal | `wd_{withdrawalId}` + `clientRequestId` | The browser generates the request id per submission; a retried submit returns the existing withdrawal. |
| Referral commission | `ref_{claimId}` | One commission per earning event, not per sweep. |

A random UUID would be worse than nothing here: it makes every retry look like a
new action.

**Withdrawals lock, they do not just debit.** Requesting a payout moves tokens
from `balance` into `locked_balance` in the same transaction that creates the
withdrawal row. Without that, a user with 5,000 tokens can queue five
5,000-token payouts before the first settles. The tokens are not destroyed
either: a rejection returns them through `refund()` with a matching ledger row,
and only a completed send releases `locked_balance` for good (via the
`set_withdrawal_status` RPC).

**Counters, not count queries.** The landing page numbers come from the
`stats` table — a `global` row and one per UTC day, incremented by `bump_stats`
inside the transaction that earned them. "How many claims have ever been made"
as a live query is a full scan of the largest table in the product on the
most-visited page.

---

## 4. Getting started

### Prerequisites

- Node 20.6 or newer (the operator scripts use `node --env-file`).
- A Supabase project (this one: `zlabpwyezgdbylogbcxm`, all migrations applied).

### Install and configure

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is documented there with what breaks
without it. The four that matter on day one:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...     # SERVER ONLY, never NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=https://your-domain  # referral links, OG tags, postbacks
STAFF_REQUIRE_MFA=false                    # ONLY while enrolling the first admin
```

### Apply the schema, seed, run

```bash
node --env-file=.env.local scripts/apply-supabase-migration.mjs   # idempotent
node --env-file=.env.local scripts/seed-supabase.mjs              # config rows
npm run dev                                                      # http://localhost:3000
```

The migration runner tracks applied migrations in `schema_migrations` and skips
them, so re-running is safe. `seed-supabase` writes the economy/rates/site/ads
config rows and the first lottery round if they are missing.

### Promote the first admin

Sign up through the normal flow first — the `handle_new_user` trigger creates
the profile row, referral code and signup bonus. Then:

```bash
node --env-file=.env.local scripts/grant-staff.mjs --email you@example.com --role super_admin
```

Sign out and in again, open `/admin`, then set `STAFF_REQUIRE_MFA` back to the
default (true) and remove the temporary `false`. The console's staff screen
(**Admin → Platform → Staff**) manages every role grant after the first one, each
with an audit row.

### Other commands

```bash
npm run build              # production build (also the type gate)
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
```

---

## 5. Deploying

Hosting is Zoho Catalyst Slate. The full walkthrough — env vars, memory,
custom domain, post-deploy verification — is [`CATALYST.md`](CATALYST.md).
The short version:

```bash
catalyst login
catalyst init slate           # link/create the project; Next.js is detected
catalyst deploy slate --production
```

Slate packages the Next.js build itself; nothing in `next.config.mjs` needs
changing. Before first deploy, set `NEXT_PUBLIC_SITE_URL` and the Supabase
auth redirect URLs to the production domain (Auth → URL Configuration) or
login loops back to the email-confirmation step.

Before you go live, verify the money path end-to-end: sign up, claim the
faucet, submit a withdrawal, approve it from the console. §5 of `CATALYST.md`
is that checklist.

---

## 6. Filling the ad slots

This is the section you will use most. Advertising is the revenue, and every slot
ships empty.

### The map

`src/lib/ads/placements.ts` defines **82 placements**. A placement is a stable id
— `faucet.belowClaim` — that survives redesigns, so a zone key you paste once
keeps pointing at the same box. Each carries a desktop format and a mobile
format, chosen by CSS media query rather than JavaScript so there is no layout
shift and no hydration mismatch.

Density by page group: Faucet 9, Dashboard 9, PTC 7, Shortlinks 7 (one of which
is `shortlink.directLink`, a URL rather than a box), Landing 5, Offerwall 5,
Global 5, Daily bonus 4, Challenges 4, Leaderboard 4, Lottery 3, Referrals 3,
Community 3, Transactions 3, Account 3, Withdraw 3, Tickets 2, Coupon 2, Auth 1.
The highest-traffic pages carry the most, which is the point.

### The format registry

`src/lib/ads/formats.ts` holds **22 formats** with exact pixel dimensions:

| Kind | Count | Formats | Behaviour |
| --- | --- | --- | --- |
| `fixed` | 14 | `leaderboard` 728x90, `largeLeaderboard` 970x90, `billboard` 970x250, `banner` 468x60, `rectangle` 300x250, `largeRectangle` 336x280, `halfPage` 300x600, `skyscraper` 160x600, `square` 250x250, `smallSquare` 200x200, `mobileBanner` 320x50, `mobileLarge` 320x100, `mobileRectangle` 300x250, `anchor` 728x90 sticky | A hard w×h box, reserved whether or not a tag is configured |
| `fluid` | 3 | `native`, `inFeed`, `video` | Responsive; height grows with the creative |
| `overlay` | 4 | `socialBar`, `popunder`, `inPagePush`, `interstitial` | Positioned by the network, no document flow |
| `link` | 1 | `directLink` | A destination URL, no markup |

Dimensions are exact so an *unfilled* slot reserves the same box the filled slot
will occupy. If it does not, pasting a live tag reflows the page, the
layout-shift score collapses, and — more expensively — some networks score a
creative that renders into a resizing box as a viewability failure and pay less
for it.

### The four unit kinds

A unit is a row in the `ad_units` table keyed by placement id. `kind` decides
how the payload is rendered:

| `kind` | Needs | Use for |
| --- | --- | --- |
| `html` | `html` | The common case. The network's whole snippet, pasted verbatim. |
| `script` | `src` | A single loader with no container: social bar, popunder, in-page push. |
| `container` | `src` + `containerId` | A loader that fills a div you name: AdSense, some AdsLab zones. |
| `url` | `url` | `shortlink.directLink` only. A smartlink destination. |

Optional on any unit: `format` (override the placement's own), `network` (free
text, for reporting), `capPerSession`, `geo` (array of ISO-3166 alpha-2 codes,
empty means everywhere), and `enabled: false` to blank a slot without losing its
configuration.

Raw HTML is accepted because every ad network on earth ships `document.write`-era
markup, and an ad system that refuses raw HTML cannot serve ads. The snippet is
injected into a **sandboxed iframe** without `allow-same-origin`, so the tag
cannot read the session cookie or walk the parent DOM. That sandbox is the
control — which is also why `ad_units` is writable only with `ads.edit` from the
console: the row is executable content, and whoever can write it runs JavaScript
in every visitor's browser.

### Pasting an Adsterra banner

Adsterra gives you a two-part snippet for display units: an options object and a
loader script.

1. Adsterra dashboard → **Websites** → your site → **Add new ad unit**. Choose
   **Banner** and the size that matches the placement you are filling. For
   `faucet.belowClaim` that is 336x280 (`largeRectangle`); check
   `src/lib/ads/placements.ts` or the Size column in the inventory table.
2. Copy the whole snippet. It looks like this:

   ```html
   <script type="text/javascript">
     atOptions = {
       'key' : 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
       'format' : 'iframe',
       'height' : 280,
       'width' : 336,
       'params' : {}
     };
   </script>
   <script type="text/javascript" src="//www.highperformanceformat.com/a1b2c3d4e5f60718293a4b5c6d7e8f90/invoke.js"></script>
   ```

3. In Vazionix: **Admin → Ads → Inventory**. Find the placement row, click it.
4. Set **kind** to `html`, paste the snippet into the **HTML** field, set
   **network** to `Adsterra`, leave **format** empty to use the placement's own,
   leave **cap** at 0.
5. Save. The slot is live on the next page render — no deploy, no cache purge.

Both `<script>` tags go in together. Splitting them breaks the unit: `atOptions`
is a global the loader reads at execution time, and a loader with no options
object renders nothing.

### Pasting an Adsterra Social Bar, Popunder or In-Page Push

These are single loaders with no container, and the network decides where they
appear.

1. Adsterra → **Add new ad unit** → **Social Bar** (or Popunder, or In-Page
   Push). You get one URL, not a snippet:

   ```
   //pl26481932.profitablecpmgate.com/9a/1b/2c/9a1b2c3d4e5f60718293a4b5c6d7e8f9.js
   ```

2. **Admin → Ads → Inventory** → `global.socialBar` (or `global.popunder`,
   `global.inPagePush`).
3. Set **kind** to `script`, put the URL in **src**, set **network** to
   `Adsterra`. For the popunder set **cap** to 1 — one per session is the
   default in the ads config and the cap on the unit is the second brake.
4. Save.

These four formats are **overlay** units, mounted once globally rather than per
page, and they never load on `/withdraw`, `/login`, `/register` or `/admin`
whatever their configuration says. That list is `overlayBlockedRoutes` in the
ads config and you can edit it — but leave `/withdraw` in it. A popunder firing
while somebody is pasting a payout address is the one ad interaction that
reliably costs more than it earns: the misclick becomes a support ticket, and
the ticket costs more than the impression.

### Pasting an AdsLab zone

AdsLab issues zones in both shapes, so you may get either.

**Shape A — an invoke script.** Same as the Adsterra banner: **kind** `html`,
the whole snippet into **HTML**, **network** `AdsLab`.

**Shape B — a container plus a loader.** You get a div and a script:

```html
<div id="adslab-zone-482913"></div>
<script src="https://cdn.adslab.io/zones/482913/loader.js" async></script>
```

Set **kind** to `container`, **src** to `https://cdn.adslab.io/zones/482913/loader.js`,
and **containerId** to `adslab-zone-482913`. The renderer creates the div with
that exact id and then loads the script, which is the order the loader expects —
it looks for its target on execution and gives up silently if it is not there.

Do not paste Shape B as `html`. The div would be created inside the sandboxed
iframe, and so would the script, but a loader that walks `window.parent` to find
its container fails against a sandbox without `allow-same-origin`. `container`
is the kind that exists for exactly this case.

### The three ways a slot can be filled, in precedence order

1. **The `ad_units` table** — written by Admin → Ads → Inventory. Wins over
   everything, takes effect immediately, and is the normal path.
2. **Environment** — `NEXT_PUBLIC_AD_<PLACEMENT>`, for units you want frozen
   into a build. Only six placements are wired, all global overlays plus the
   direct link, because Next inlines `NEXT_PUBLIC_*` by literal lookup at build
   time and a computed `process.env[key]` is `undefined` in the browser.
   Accepts either a bare URL or a JSON `AdUnitConfig`.
3. **`STATIC_UNITS`** in `src/lib/ads/config.ts` — a committed fallback,
   shipped empty.

An unfilled slot renders a dimension-labelled placeholder in development and
nothing in production. A unit whose `kind` and payload disagree — `kind:
'html'` with no `html` — is treated as unfilled rather than rendered as an empty
iframe, because an empty iframe looks like a broken ad and a placeholder looks
like an unfinished configuration, which is what it is.

---

## 7. Wiring the AdsLab captcha

The captcha gates the faucet and the shortlink completion by default
(`economy.faucet.requireCaptcha`, `.shortlinks.requireCaptcha`; PTC is off).
AdsLab is the intended provider because its captcha is a revenue product — a
solve pays the publisher — so the anti-abuse control and the monetisation are
the same widget.

Three public variables and one secret:

```bash
NEXT_PUBLIC_CAPTCHA_PROVIDER=adslab
NEXT_PUBLIC_CAPTCHA_SITE_KEY=al_pub_9f2c1b7e4d
NEXT_PUBLIC_CAPTCHA_SCRIPT_URL=https://cdn.adslab.io/captcha/v1/loader.js?z=482913
CAPTCHA_SECRET_KEY=al_sec_3e8a6d5c02b14f7a
CAPTCHA_VERIFY_URL=https://api.adslab.io/captcha/verify
```

| Variable | Scope | What it does, and what happens without it |
| --- | --- | --- |
| `NEXT_PUBLIC_CAPTCHA_PROVIDER` | client | Picks the widget and the default verify endpoint. `none` (or unset) disables captchas everywhere — correct locally, never in production. Also accepts `hcaptcha`, `turnstile`, `recaptcha`. |
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | client | Renders the widget. **With a provider set but no site key, `captchaEnabled` is false and gated actions run with no captcha at all** — a widget that cannot appear would otherwise lock every user out of earning, so the code chooses "open" over "broken". Check this first if claims look too easy. |
| `NEXT_PUBLIC_CAPTCHA_SCRIPT_URL` | client | Overrides the loader URL. **Required for AdsLab**, which issues a per-account URL rather than a shared one. |
| `CAPTCHA_SECRET_KEY` | **server** | Verifies the token against the provider. With a provider configured and no secret, every gated claim fails closed with a 500 that names this variable — deliberately, because the alternative is a decorative captcha. |
| `CAPTCHA_VERIFY_URL` | server | Overrides the verification endpoint. Only set it if AdsLab gave you a different one. |

Get all five from the AdsLab dashboard under Captcha → your zone. The site key
and script URL in the block above are shaped like real values and are not real.

Three properties make the server-side check worth having, and all three are in
`src/server/captcha.ts`:

- **Secret-keyed.** The token is presented to the provider with the secret,
  which never leaves the server, so a client cannot forge a provider's "yes".
- **Single-use.** A verified token's hash is written to the `captcha_tokens`
  table with a unique constraint, scoped by action, so presenting the same solve
  twice fails the second time. Without this, one solve funds unlimited claims —
  which is the actual exploit on most faucets, not captcha solving.
- **Fail closed.** A provider outage refuses the claim. An uncredited claim is a
  retry; a free claim is a drained faucet.

Client-side "verification" is decoration. Only the server check counts.

---

## 8. Connecting an offerwall

One row per wall in the `offerwall_providers` table. The row's id slug is
load-bearing: it is the `{providerId}` in your postback URL, so use the
provider's own name as a slug (`bitlabs`, `cpx`, `ayet`).

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | Display name on the offerwall grid. |
| `iframeUrl` | yes | The wall URL. Supports `{uid}`, `{username}` and `{country}` placeholders, substituted server-side and URL-encoded. This is how the provider identifies your user inside their iframe. |
| `secret` | yes | The shared postback signing secret. Never leaves the server; it is never sent to the client — the provider rows are read server-side only. |
| `signatureMode` | no | One of the four below. Default `hmac_sha256_payload`. |
| `blurb` | no | One line of copy under the name. |
| `rating` | no | Sort order on the grid, descending. Default 4. |
| `mark` | no | Two-letter monogram for the tile. Derived from `name` if absent. |
| `hue` | no | Tile accent hue, 0-360. Default 160. |
| `featured` | no | Pins it to the featured row. |
| `enabled` | no | Default true. False hides it without losing the configuration. |

Create them in **Admin → Modules → Offerwall** (which needs `earn.provider`).

### The postback URL

```
https://your-domain/api/offerwall/{providerId}
```

Paste that into the provider's dashboard as the callback, server-to-server
postback, or reward callback — every wall calls it something different.

Both `GET` and `POST` are accepted, because providers disagree and several do
not let you choose. Parameters are read from the query string and the body
alike, and the endpoint accepts the field spellings the major walls use:

| Meaning | Accepted names |
| --- | --- |
| user | `uid`, `user_id`, `userId`, `sub_id`, `subid`, `sid`, `player_id`, `user` |
| transaction | `tx`, `trans_id`, `transaction_id`, `transactionId`, `txn_id`, `id`, `conversion_id` |
| reward | `reward`, `payout`, `amount`, `currency_amount`, `points`, `value` |
| signature | `signature`, `sig`, `hash`, `hashed`, `checksum` |
| status | `status`, `state`, `event` |
| offer name | `offer`, `offer_name`, `offerName`, `name`, `campaign` |

A typical macro string to give the provider:

```
https://your-domain/api/offerwall/bitlabs?uid={USER_ID}&tx={TRANSACTION_ID}&reward={REWARD}&status={STATUS}&offer={OFFER_NAME}&signature={HASH}
```

`status` is normalised: `0|pending|hold|held` becomes Pending,
`-1|rejected|declined|failed|void` becomes Rejected,
`2|reversed|chargeback|refund|refunded` becomes Reversed, anything else is
Approved. Only Approved with a positive reward credits.

**The endpoint is not authenticated, and that is correct.** The caller is the
provider's server, not a signed-in user. The signature is the authentication.
Never add a session check here — it would break every wall.

### Signature modes

| Mode | Expected value |
| --- | --- |
| `hmac_sha256_payload` (default) | `HMAC-SHA256(secret, "{uid}:{tx}:{reward}")` |
| `md5_tx_reward_secret` | `HMAC-MD5(secret, "{tx}{reward}")` |
| `sha256_uid_reward_secret` | `HMAC-SHA256(secret, "{uid}{reward}")` |
| `none` | No signature checked. Only for a wall that genuinely cannot sign, and only with an IP allowlist in front. |

Comparison is case-insensitive and constant-time. If a provider's scheme is
not one of these, add a case to `expectedSignature()` in
`src/server/earn/offerwall.ts` rather than switching to `none`.

### An unsigned postback is recorded and refused, not credited

This is the behaviour to understand before you go live. When a postback arrives
with a missing or wrong signature — or when the provider row has no `secret`
and the mode is not `none` — the endpoint:

1. Creates an `offerwall_conversions` row with the full raw payload and
   `signature_valid: false`.
2. Sets its status to `Rejected` with `rejection_reason: 'signature'`.
3. Answers **401** and credits nothing.

It records first and refuses second, on purpose. A forged postback that is
silently dropped is invisible; one that leaves a row is a row you can look at.
So when a provider reports that your callback returns 401, open **Admin →
Modules → Offerwall** and read the conversion: the payload is there, and it
will usually show that their signature covers different fields than the mode
you selected, or that `secret` was pasted with a trailing space.

**Idempotency is the row id.** A conversion's id is
`{providerId}_{providerTxId}`, so a duplicate postback — which every wall
sends, routinely, some five times over an hour — fails the unique insert
rather than double-crediting. A retry after a successful credit returns
`duplicate: true` and a 200, which is what providers expect.

A conversion an advertiser later charges back is reversed from the console,
which debits the tokens through the ledger and leaves both rows in place.

---

## 9. Payout rails

Three rails, in the `rates` config, each priced per asset with its own minimum,
fee and ETA label. Turn off any rail you have no key for — a rail the user can
select and the server cannot send is a queued payout and a support ticket.

| Rail | Automated | Needs | Settles |
| --- | --- | --- | --- |
| FaucetPay | yes | `FAUCETPAY_API_KEY` | Seconds |
| CWallet | yes | `CWALLET_API_KEY` (+ `CWALLET_API_URL`) | Seconds |
| Direct on-chain | **no, deliberately** | nothing | Batched, broadcast by you |

FaucetPay and CWallet accept an email or a username as well as an address,
because that is how their own deposit flow works, so address validation is
looser for them and strict per-asset regex for Direct. A malformed address is
the most common cause of a lost payout; a rejected request costs nothing, a
broadcast to a bad address is unrecoverable.

**A rail is enabled by the presence of its key and nothing else.** An
unconfigured rail refuses the send and leaves the withdrawal `Pending` with the
tokens still locked. It never marks Completed on uncertainty: a timeout, a
connection error or an unrecognised response body all leave the row
`Processing` with the operator-facing reason attached. Paying twice is
unrecoverable; paying late is a support reply. Admin → Payouts shows which
rails are actually configured, and the Approve button is withheld on rows
whose rail cannot send.

**Direct is manual because signing keys do not belong in a web process.** A hot
wallet key in an environment variable is readable by every dependency in the
tree, every log that dumps `process.env`, and anyone who reaches the runtime.
Approving a Direct payout in the console does not send anything, and says so:
you broadcast the transaction from your custody tooling and record the txid,
which flips the row to `Completed` and releases `locked_balance`.

Withdrawals above `economy.withdraw.reviewThresholdUsd` (default $25) are
created as `HeldForReview` instead of `Pending` and wait for a human — that
queue is **Admin → Review queue**, the same rows the sidebar badge counts.

---

## 10. Operating it

### The kill switches

The `site` config, editable at **Admin → Content → Maintenance mode** and
**Feature flags**:

| Flag | Effect |
| --- | --- |
| `maintenance` | The whole site shows `maintenanceMessage`. The blunt one. |
| `earningOpen` | False makes every earning path answer 503 with "Earning is paused". Faucet, PTC, shortlinks, daily, challenges, lottery. |
| `withdrawalsOpen` | False refuses new withdrawals with "Withdrawals are paused right now. Your balance is safe." Reach for this during a rail outage — earning keeps running. |
| `signupsOpen` | False closes registration. |
| `announcement` + `announcementTone` | A banner across the product. |

The reason there are four rather than one: pausing payouts because FaucetPay is
down should not also stop people earning, and stopping earning because a
shortlink provider is being abused should not stop payouts to users who already
earned.

### The admin console

`/admin`, every screen gated by one of 53 permissions across five roles
(`super_admin`, `admin`, `finance`, `moderator`, `support`).

| Group | What lives there |
| --- | --- |
| Overview | Command centre: members, claims today, liability, pending payouts, held for review. |
| People | Users, review queue (held withdrawals), fraud & risk, change requests. |
| Money | Withdrawal queue, treasury, rates, fees and limits, accounting, reversals. |
| Earning modules | Faucet, PTC, shortlinks, offerwall, lottery, daily bonus, challenges, coupons, leaderboards, referrals. |
| Monetisation | **Ad inventory** (section 6), creative approval (unfilled slots), revenue, advertisers. |
| Support | Ticket inbox, broadcasts, banners, email templates. |
| Analytics | Financial, engagement, geographic, funnel, support metrics. |
| Content | Legal, FAQ, social widgets, supported coins, SEO, feature flags, maintenance. |
| Platform | Staff, roles and permissions, **audit log**, security centre, health, keys and webhooks, anti-abuse. |

Least privilege is real here: Support can view a user and reply to tickets but
holds no `balance.adjust`; Finance approves payouts but cannot ban an account;
only `super_admin` can edit the permission matrix or grant a role.

### The audit log

The `audit_log` table, one row per privileged action, read at **Admin →
Platform → Audit log** behind `audit.view`. Rows are
`{ actorUid, action, target, detail, createdAt }` and are written by
`writeAudit()` in `src/server/admin.ts` — suspensions, balance adjustments,
config saves, ad-unit edits, catalogue changes, role grants, lottery draws.

RLS allows **nobody** to update or delete a row — not Support, not Finance, not
`super_admin`. The service-role client bypasses RLS, so the log still gets
written on every action; what the policy buys is that a stolen staff token,
however privileged, cannot erase one. A log the most powerful role can edit
proves nothing about the person most worth auditing.

Balance adjustments are the ones to watch. They go through the same ledger as
everything else, so an adjustment appears in the user's own transaction history
*and* in the audit log with the operator's uid and their stated reason. "The
admin panel changed my balance and there is no record of it" is not a state
this system can reach.

### Staff accounts

Staff authorisation is the `staff` table: one row per operator with `role`,
optional granular `perms`, and an `mfa` flag. `requirePermission()` resolves the
session through Supabase Auth, loads the staff row with the service-role client,
and checks the permission from the database — never from a client-readable
cookie, so nothing a script can forge buys anything.

`STAFF_REQUIRE_MFA` defaults to true and a staff row without `mfa` is treated
as not-staff. Set it to `false` only while enrolling the first account, then
remove the line. Grant the rest from **Admin → Platform → Staff**, which
requires a reason that goes into the audit row.

### Day-to-day

- **Rates.** The `rates` config stores per-asset spot prices quoted at
  withdrawal time. If nothing refreshes them, the last written values keep
  being quoted — stale, never zero. `usdPerToken` is yours to set.
- **Liability.** Admin → Treasury shows tokens outstanding (`tokensCredited`
  minus `tokensWithdrawn` from the stats table) and their USD value. That is
  what you owe.
- **Leaderboards** read the `leaderboard_entries` table, which earning paths
  maintain as they credit.
- **The lottery draw** publishes its seed. `drawLottery` records the seed,
  pool and winners in an audit row, then shuffles the stored tickets
  deterministically from the seed, so anyone can re-run the selection and
  check the result. "We drew randomly" is otherwise unfalsifiable, which on
  a payouts product is the same as "we picked our friends".

---

## 11. What is deliberately not built

Stated plainly, so nobody spends a day looking for it.

- **Direct on-chain broadcasting.** The console selects, marks and records; it
  does not sign. See section 9.
- **KYC document handling.** There is no document upload, no vendor integration
  and no automated decision. The review queue that exists is the withdrawal
  review threshold — proportionate for faucet-sized payouts. Wire a KYC provider
  before you need one.
- **File storage.** Ticket attachments are modelled in the schema but nothing
  uploads them, and the GDPR export path is not implemented.
- **The advertiser self-serve flow.** The advertiser screens render network
  inventory and an honest "not built" state; there is no payment intake, no
  creative moderation pipeline and no campaign billing. Advertising is
  operator-managed through Admin → Ads → Inventory.
- **Email delivery.** `NEXT_PUBLIC_SUPPORT_EMAIL` and
  `NEXT_PUBLIC_NOREPLY_EMAIL` are display strings. Supabase Auth sends its own
  verification and reset mail; the product sends none. In-product notifications
  are `notifications` rows.
- **A scheduled-job runner.** The lottery draw and the leaderboard/suspension
  sweeps are server functions callable from the console; nothing triggers them
  on a schedule yet. Wire a cron source (Catalyst Cron, pg_cron, or an external
  pinger hitting the admin-only routes) before launch — see `CATALYST.md`.
- **The AI support assistant's model call.** The chat panel and the transcript
  store are real; the assistant's answers are not wired to a model.
- **A second currency.** Everything is tokens plus an asset quote at withdrawal
  time. `deposit_balance` exists on the user row for advertiser credit and no
  flow spends it.
- **RLS unit tests.** Policies are reviewed, not asserted. If you change one,
  test it by hand with the publishable key: try to read another user's profile,
  write your own balance, list the usernames table, and read
  `offerwall_providers`. All four must fail.

---

Two more documents worth reading before you deploy: [`CATALYST.md`](CATALYST.md)
for the hosting walkthrough, and [`scripts/README.md`](scripts/README.md) for
what each operator script does and refuses to do.
