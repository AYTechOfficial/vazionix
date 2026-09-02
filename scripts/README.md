# Operator scripts

Four files. Three are commands you run; one is the shared setup they import.
All of them talk to Firestore through `firebase-admin`, which bypasses
`firestore.rules` — that is the point of running them locally rather than
building the same operations into the app.

Run them with the project's own environment file:

```bash
node --env-file=.env.local scripts/seed-config.mjs
```

`--env-file` needs Node 20.6 or newer. The `npm run` aliases in `package.json`
already include it. Every script prints the project id it resolved as its first
line of output — read it before you read anything else, because these write to
whatever project your credential points at and there is no confirmation prompt.

## `_firebase.mjs`

Not a command. Resolves credentials in the same order the web app does
(`FIREBASE_SERVICE_ACCOUNT_KEY` as base64 JSON, then
`GOOGLE_APPLICATION_CREDENTIALS` as a path, then Application Default
Credentials), exposes `db()` / `auth()`, parses flags, and provides
`mergeMissing()` — the merge that writes only keys a document does not already
have. That function is what makes the seeds safe to re-run: it walks nested
objects, so a release that adds `faucet.happyHourLengthMinutes` reaches an
existing `/config/economy` without touching the `faucet.reward` you tuned by
hand. Output is plain text with no colour or spinners, because these run in CI
logs and over SSH as often as in a terminal.

## `bootstrap-admin.mjs` — `npm run bootstrap:admin`

Promotes an existing account to `super_admin` (or any staff role) by email. It
solves a genuine chicken-and-egg: granting a staff role requires a
`super_admin`, and a fresh project has none. Doing it here rather than through
an HTTP endpoint means the operation needs the service-account key, which means
filesystem access to your deploy — a far higher bar than any request-time check
on a "promote me if nobody is admin yet" route.

It looks the account up by email and **refuses if there is no Auth user**,
telling you to sign up through the site first. It will not create the account:
an Auth user with no `/users` profile cannot earn or withdraw until the app
repairs it on next sign-in, and a missing account here is almost always a typo
in the address. On success it sets custom claims `{ role, perms?, mfa: true }`,
mirrors the same fields `setStaffRole` writes to `/staff/{uid}`, revokes refresh
tokens so an open session picks the role up on its next request instead of in up
to an hour, appends an `/auditLog` row attributed to `bootstrap:<email>`, and
prints what changed plus the four things to do next. The claim is what
authorises; `/staff/{uid}` is a mirror for display and for the "does a
super_admin already exist" check, so deleting it revokes nothing.

```bash
npm run bootstrap:admin -- --email you@example.com
npm run bootstrap:admin -- --email agent@example.com --role support
npm run bootstrap:admin -- --help
```

## `seed-config.mjs` — `npm run seed:config`

Writes `/config/economy`, `/config/rates`, `/config/site`, `/config/ads`,
`/stats/global` and `/lottery/current` from the shipped defaults. The app does
not need them — `src/server/config.ts` merges Firestore over its own compiled
defaults, so an unseeded project serves a working site — but the admin console
renders what is in Firestore, so without this run Admin → Modules shows empty
fields and no way to discover that the faucet pays 65 tokens. This is the script
that makes a fresh project editable.

It merges missing keys and never overwrites an existing value, so running it
after every release is the intended workflow. There is deliberately no
`--force`: a flag that reverts live economy configuration is a flag somebody
will eventually run against production. `--dry-run` reports what it would add
through a separate read-only code path, and `--only economy,rates` narrows the
targets. The defaults are duplicated from `src/lib/config/economy.ts`,
`src/server/config.ts` and `src/lib/ads/config.ts` because a `.mjs` script
cannot import TypeScript; drift is harmless (the app always merges over its own
copy) but confusing, so change both in one commit.

```bash
npm run seed:config
npm run seed:config -- --dry-run
npm run seed:config -- --only lottery
```

## `seed-catalogue.mjs` — `npm run seed:catalogue`

Optional starter rows for `ptcAds`, `shortlinks`, `offerwallProviders` and
`challenges`. **It ships with no inventory and will not invent any.** Run it with
no arguments and it prints every field each collection needs, with types,
defaults and which are required, then exits non-zero having written nothing.
Supply rows as a JSON file (`--file catalogue.json`) or one row of flags
(`--collection shortlinks --name … --targetUrl … --reward 40`).

The reason for the strictness: the previous revision of this project served its
PTC wall and shortlink list from fixture modules full of invented advertisers and
URLs that went nowhere, and users clicked them. So every value is validated
against the fields the earning engines actually read, unknown field names are
refused rather than silently dropped, URLs must parse, and anything that looks
like a half-finished copy-paste — `example.com`, `YOUR_KEY`, `TODO`, lorem ipsum
— is rejected by name. A half-finished row is worse than a missing one, because
it renders as a real offer.

Offerwall providers require an explicit `id`, because that id is the
`{providerId}` in your postback URL; after writing them the script prints the
full postback URL for each one, derived from `NEXT_PUBLIC_SITE_URL`.

```bash
npm run seed:catalogue                               # what it needs
npm run seed:catalogue -- --file catalogue.json --dry-run
npm run seed:catalogue -- --file catalogue.json
```
