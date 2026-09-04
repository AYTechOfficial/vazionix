# Deploying Vazionix

The ordered checklist, the index derivation table, and the two things the Firebase
CLI cannot do for you. Read [`README.md`](README.md) first for what the product is;
this file assumes you have `.env.local` filled in and a Firebase project on Blaze.

## Order

Rules and indexes go out before the app. An index that is still building makes a
query fail rather than run slowly, so deploying the app first means shipping a
window where the leaderboard, the withdrawal queue and the ledger filters return
`FAILED_PRECONDITION`.

```bash
firebase login
firebase use your-project

# 1. Rules and indexes.
npm run deploy:rules

# 2. Wait. Firestore console -> Indexes. Every row must read "Enabled".
#    Minutes on an empty project, hours on a populated one.

# 3. Functions. Compiles functions/ with tsc first.
npm run deploy:functions

# 4. Config, if this is a fresh project.
npm run seed:config

# 5. The app.
npm run build
#    then deploy the build to your host
```

Then, once, by hand: the two TTL policies below, and App Check.

## The two TTL policies

`firestore.indexes.json` does not declare them. Whether the CLI accepts a `ttl` flag
inside a field override depends on its version, and an unknown property fails the
entire deploy — so these are created out of band.

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=captchaTokens --enable-ttl --project=your-project

gcloud firestore fields ttls update expiresAt \
  --collection-group=taskSessions --enable-ttl --project=your-project
```

Console equivalent: Firestore -> **Time-to-live (TTL)** -> *Create policy* ->
collection group `captchaTokens`, field `expiresAt`; repeat for `taskSessions`.

Both collections are pure churn. `captchaTokens` takes one document per solved
captcha across the whole platform — it is the single-use record that stops one solve
funding a thousand claims — and `taskSessions` one per started PTC view or shortlink.
Both are dead the moment they expire and neither is read afterwards. TTL deletion is
free; the `cleanupEphemeral` function deletes them hourly at 400 documents a page,
which costs a delete per document and will fall behind at volume. Keep the function
anyway: it catches documents written before the policies existed.

## Verifying the rules by hand

There is no rules test suite. Before and after any change to `firestore.rules`, start
the emulator, sign in as an ordinary user, and confirm all six of these **fail**:

```
read    /users/{someone-else's-uid}
write   /users/{your-own-uid}            (any field, including a no-op)
list    /usernames
read    /offerwallProviders/{any}
read    /coupons/{any}
create  /auditLog/{any}                  (even holding super_admin)
```

And these **succeed**:

```
get     /users/{your-own-uid}
get     /usernames/{a-taken-handle}
read    /config/rates                    (signed out, too)
read    /stats/global                    (signed out, too)
update  /users/{you}/notifications/{id}  (only the `read` field)
```

The sixth failure is the one people get wrong. `/auditLog` is write-denied for
everybody including `super_admin`; the log still gets written because the Admin SDK
does not evaluate rules. That asymmetry is the design.

## Index derivation

25 composite indexes, each traced to the query that needs it. The `"//"` key at the
top of `firestore.indexes.json` carries the same table with file references; this is
the summary.

| # | Collection group | Fields | Query |
| --- | --- | --- | --- |
| 1 | `entries` | `board`, `value` desc | The five leaderboards, and the ranking pass of `resetLeaderboards`. |
| 2 | `entries` | `board`, `finalRank` asc | Reading a settled period back for the podium and prize payout. |
| 3 | `entries` (group) | `board`, `value` desc | No live caller. Kept per the deployment brief so a cross-period `collectionGroup('entries')` query is not a rebuild away. Safe to delete. |
| 4 | `claims` | `source`, `createdAt` desc | Ledger page filtered by source; coupon redemption history. |
| 5 | `claims` | `source`, `day` | `countToday()` — every daily cap check in the product. |
| 6 | `claims` | `source`, `createdAt` asc | Per-link shortlink usage today. An ascending range, which is not the reverse of #4. |
| 7 | `withdrawals` | `uid`, `createdAt` desc | A user's history, the admin user detail, and the daily-count aggregate. |
| 8 | `withdrawals` | `uid`, `clientRequestId` | The submit-replay lookup, on the money path. |
| 9 | `withdrawals` | `status`, `createdAt` desc | The admin queue. Serves `status ==` and `status in [...]`. |
| 10 | `withdrawals` | `status`, `processedAt` desc | The payout ticker and the finance rollup over completed payouts. |
| 11 | `withdrawals` | `status`, `rail`, `createdAt` asc | `processDirectWithdrawalBatch`. `network` is **not** in this index — the job groups by network in memory, and an index with `network` between `rail` and `createdAt` would not serve the query at all. |
| 12 | `users` | `suspended`, `createdAt` desc | The admin users table's suspended filter. |
| 13 | `users` | `suspended`, `suspendedUntil` asc | `expireSuspensions`, hourly. |
| 14 | `tickets` | `uid`, `lastMessageAt` desc | A user's ticket list; the admin user detail. |
| 15 | `tickets` | `status`, `lastMessageAt` desc | The support inbox filtered by status. |
| 16 | `ptcAds` | `enabled`, `tokens` desc | The PTC wall. |
| 17 | `shortlinks` | `enabled`, `reward` desc | The shortlink grid. |
| 18 | `challenges` | `enabled`, `tokens` desc | The challenge list. |
| 19 | `offerwallProviders` | `enabled`, `rating` desc | The offerwall grid. |
| 20 | `offerwallConversions` | `uid`, `createdAt` desc | Offerwall history. |
| 21 | `lotteryTickets` | `uid`, `createdAt` desc | A user's tickets across rounds. |
| 22 | `lotteryTickets` | `round`, `status` | The draw, reading up to 20k pending tickets for one round. |
| 23 | `lotteryTickets` | `uid`, `round` | The per-round ticket cap aggregate. |
| 24 | `taskSessions` | `kind`, `itemId` | Closing an open session before issuing another, which stops two tabs completing one PTC view. |
| 25 | `chats` | `mode`, `lastMessageAt` asc | `escalateStaleChats`. |

Six field overrides: `taskSessions.expiresAt` indexed at collection **and**
collection-group scope (a collection-group query needs an explicit index even for a
single field — this is the one the hourly cleanup depends on); `captchaTokens.expiresAt`
ascending only, dropping the descending index on the highest-churn collection in the
product; and index exemptions for `offerwallConversions.rawPayload`, `claims.meta`,
`adUnits.html` and `messages.body`. The exemptions are not cosmetic: Firestore indexes
every leaf of a map and rejects a write whose index entry exceeds 7.5 KiB, so an
indexed arbitrary provider payload or a multi-kilobyte ad snippet can make the write
**fail** — which would present as "the admin console will not let me paste my tag".

Single-field indexes are automatic and are deliberately absent. The API rejects a
composite index naming one field, so adding one breaks the whole deploy. The
`"//"` block in `firestore.indexes.json` lists the twenty-odd queries that rely on
automatic single-field indexes, so you can tell "not needed" from "forgotten".

## One inconsistency to know about

`/auditLog` has two writers with different field shapes. `src/server/admin.ts` and
`functions/src/ledger.ts` write
`{ actorUid, actorName, action, target, detail, createdAt }`, which is what the
console reads. An older path in `src/lib/admin/claims.ts#setAdminRole` writes
`{ admin, perm, target, before, after, at, ip }`. Rows from the second shape render
blank in Admin -> Platform -> Audit log. No composite index is defined for
`auditLog` until that is reconciled — indexing `admin`/`at` would look like the
per-actor filter works when half the rows do not carry those fields. The audit page
itself orders by `createdAt` alone, which an automatic single-field index serves.

## Rollback

Rules and indexes are versioned in Firestore, but the CLI does not roll them back.
Keep the previous `firestore.rules` in git and redeploy it; deleting an index is
immediate and rebuilding it is not, so remove an index only when you are sure the
query is gone. Functions roll back per-function through the console. The seeds never
overwrite existing values, so re-running them is not a rollback path — restoring a
changed economy value means editing it in Admin -> Modules.

<!-- deployed-at: 2026-09-04T12:27:24Z -->
