import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/* ============================================================================
   FIREBASE — CLIENT SDK
   ----------------------------------------------------------------------------
   WHY FIRESTORE AND NOT REALTIME DATABASE
   ----------------------------------------------------------------------------
   This is the single most consequential data decision in the product, so it is
   written down rather than assumed. RTDB is cheaper per byte and lower latency
   for a flat, always-open socket. It loses on all four things this product
   actually does:

   1. COMPOUND QUERIES FOR LEADERBOARDS.
      Five boards, each "order by metric desc, limit 100, where period == the
      current reset". RTDB gives you exactly one orderBy per query and no
      composite indexes, so the only implementations are (a) fetch the whole
      board and sort on the client, or (b) maintain a denormalised, manually
      sorted index node and keep it consistent by hand. Firestore does it as
      one indexed query (see firestore.indexes.json) that reads only the
      documents it returns.

   2. COLLECTION-GROUP QUERIES FOR THE REFERRAL TREE.
      "Every referral of mine that reached level 1", and on the admin side
      "every referral record pointing at this uid", are collectionGroup queries
      over /referrals/{uid}/list/{refUid}. RTDB has no equivalent — you would
      denormalise the same edge into two places and pray they stay in sync.

   3. PER-DOCUMENT SECURITY RULES.
      RTDB rules are path-prefix based and cascade: a `.read` granted high in
      the tree cannot be revoked below it. This product needs field-level
      control — a user may write their own profile but NOT their own `balance`,
      `level` or `exp`. Firestore rules can inspect
      `request.resource.data.diff(resource.data).affectedKeys()` and reject
      exactly those fields. That single capability is what makes a client-side
      balance forgery impossible without a server round-trip.

   4. ATOMIC TRANSACTIONS ACROSS DOCUMENTS.
      Crediting an offerwall conversion touches /users/{uid} (balance),
      /users/{uid}/claims/{id} (ledger) and /offerwallConversions/{id}
      (idempotency marker). Firestore transactions span documents and
      collections with proper optimistic concurrency. RTDB transactions operate
      on a single location, so a multi-document credit becomes a hand-rolled
      two-phase commit.

   Cost: Firestore bills per document read, and a leaderboard is read far more
   often than it is written. Mitigated by (a) reading boards through
   getDocsFromCache-first listeners, (b) capping boards at 100 entries, and
   (c) serving the top-10 podium from a single aggregate document written by
   `resetLeaderboards` rather than from 10 individual reads.
   ============================================================================

   ENVIRONMENT
   Every key here is a NEXT_PUBLIC_* value and is safe in the client bundle:
   Firebase web config is an identifier, not a credential. Access control is
   enforced entirely by firestore.rules and App Check — never by hiding the
   config. See .env.example.
   ========================================================================== */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

/** True when enough config is present to actually initialise. Lets the app run
    (and this bundle build) without credentials, rather than crashing at import
    time — the UI degrades to the bundled mock data instead. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;

/**
 * Idempotent app initialisation. Next's fast refresh re-evaluates modules, and
 * `initializeApp` throws on a duplicate name, so the `getApps()` guard is not
 * optional.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (app) return app;
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const instance = getFirebaseApp();
  return instance ? getAuth(instance) : null;
}

export function getDb(): Firestore | null {
  const instance = getFirebaseApp();
  return instance ? getFirestore(instance) : null;
}
