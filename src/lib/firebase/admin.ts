import 'server-only';

import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/* ============================================================================
   FIREBASE — ADMIN SDK (server only)
   ----------------------------------------------------------------------------
   `import 'server-only'` makes it a BUILD ERROR to pull this module into a
   Client Component, which is the guardrail that matters: the service account
   private key must never reach a browser bundle.

   Two credential sources, in order:
   1. FIREBASE_SERVICE_ACCOUNT_KEY — the full JSON, base64-encoded. Use this on
      hosts where you can only set env vars (Vercel, Fly, Railway).
   2. Application Default Credentials — automatic on Cloud Run / GCE / Cloud
      Functions. Preferred in production: no key to leak or rotate.

   The private key is base64-encoded rather than pasted raw because the PEM
   contains literal newlines, and every hosting provider mangles them
   differently. Decoding once here beats a `.replace(/\\n/g, '\n')` scattered
   across the codebase.
   ========================================================================== */

const ADMIN_APP_NAME = 'vie-admin';

function credentialFromEnv() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!encoded) return null;
  try {
    const json = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
    });
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid base64-encoded service-account JSON.',
    );
  }
}

let adminApp: App | null = null;

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const credential = credentialFromEnv();
  adminApp = initializeApp(
    {
      ...(credential ? { credential } : {}),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    ADMIN_APP_NAME,
  );
  return adminApp;
}

export const getAdminAuth = (): Auth => getAuth(getAdminApp());
export const getAdminDb = (): Firestore => getFirestore(getAdminApp());

/** Named app lookup, exported for tests that need to assert singleton reuse. */
export const getAdminAppIfInitialised = (): App | null =>
  getApps().find((a) => a.name === ADMIN_APP_NAME) ?? null;

export { getApp as getDefaultAdminApp };
