/* ============================================================================
   SHARED SETUP FOR THE OPERATOR SCRIPTS
   ----------------------------------------------------------------------------
   Three scripts need the same four things: an authenticated Admin SDK handle, a
   project id to print so nobody seeds the wrong database, a flag parser, and
   output that reads like a report rather than a stack trace. They live here
   instead of being copied three times.

   CREDENTIALS, IN THE SAME ORDER THE APP RESOLVES THEM
     1. FIREBASE_SERVICE_ACCOUNT_KEY — the service-account JSON, base64-encoded.
        Identical to what the web app reads in src/lib/firebase/admin.ts, so a
        working .env.local is a working script run with no extra setup.
     2. GOOGLE_APPLICATION_CREDENTIALS — a path to the same JSON on disk.
     3. Application Default Credentials — `gcloud auth application-default login`,
        or a Google runtime's own service account.

   THESE SCRIPTS WRITE TO WHATEVER PROJECT THE CREDENTIAL POINTS AT. There is no
   confirmation prompt, because they are idempotent and because a prompt is not a
   safety feature when the answer is always yes. Instead every script prints the
   project id as its first line. Read it.

   RUN THEM WITH:  node --env-file=.env.local scripts/<name>.mjs
   `--env-file` needs Node 20.6 or newer. On an older Node, export the variables
   yourself before the command.
   ========================================================================== */

import { readFileSync } from 'node:fs';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const APP_NAME = 'vazionix-scripts';

function serviceAccount() {
  const encoded = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '').trim();
  if (encoded) {
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
      bail(
        'FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid base64-encoded ' +
          'service-account JSON.\nRe-encode the whole file:  base64 -w0 service-account.json',
      );
    }
    return parsed;
  }

  const path = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim();
  if (path) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      bail(`GOOGLE_APPLICATION_CREDENTIALS points at ${path}, which could not be read as JSON.\n${error.message}`);
    }
  }

  return null;
}

let cached = null;

export function app() {
  if (cached) return cached;
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    cached = existing;
    return cached;
  }

  const json = serviceAccount();
  const projectId =
    json?.project_id ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    bail(
      'No Firebase project could be resolved.\n' +
        'Set FIREBASE_SERVICE_ACCOUNT_KEY (base64 service-account JSON) in .env.local,\n' +
        'or set GOOGLE_APPLICATION_CREDENTIALS to the key file,\n' +
        'or at minimum set NEXT_PUBLIC_FIREBASE_PROJECT_ID and run `gcloud auth application-default login`.',
    );
  }

  cached = initializeApp(
    {
      projectId,
      ...(json
        ? {
            credential: cert({
              projectId: json.project_id,
              clientEmail: json.client_email,
              privateKey: json.private_key,
            }),
          }
        : {}),
    },
    APP_NAME,
  );
  return cached;
}

export const db = () => getFirestore(app());
export const auth = () => getAuth(app());
export const now = () => FieldValue.serverTimestamp();

export const projectId = () => app().options.projectId ?? 'unknown';

/** True when the target is a local emulator rather than a real project. */
export const usingEmulator = () => Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/* ---- OUTPUT ----------------------------------------------------------------
   No colour, no spinners, no emoji. These scripts run in CI logs and over SSH
   as often as in a terminal, and a report that is greppable beats one that is
   pretty.                                                                   */

export const line = (text = '') => process.stdout.write(`${text}\n`);

export function heading(title) {
  line();
  line(title);
  line('-'.repeat(Math.max(8, title.length)));
}

export function banner(script) {
  line(`${script} → project ${projectId()}${usingEmulator() ? ` (EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST})` : ''}`);
}

/** Print a message and exit non-zero. Every refusal in these scripts goes
    through here, so a failure always says what to do next. */
export function bail(message, code = 1) {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(code);
}

/* ---- ARGUMENTS -------------------------------------------------------------
   `--key=value`, `--key value` and bare `--flag` (which reads as true), plus
   positionals. Hand-rolled rather than a dependency: adding a package to parse
   six flags is a supply-chain decision, and this is twenty lines.           */

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body, next);
      i += 1;
    } else {
      flags.set(body, 'true');
    }
  }

  return { flags, positional };
}

/**
 * Merge `values` into `path` WITHOUT overwriting any key the document already
 * holds. This is what makes the seed scripts idempotent in the way that matters:
 * re-running them tops up new configuration keys added by a release, and never
 * reverts a number the operator tuned in the admin console.
 *
 * Nested objects are walked, so adding `faucet.happyHourLengthMinutes` to the
 * defaults reaches an existing `/config/economy` that already has a hand-edited
 * `faucet.reward` without touching the reward.
 *
 * Returns the flattened list of paths it actually wrote, for the report.
 */
export async function mergeMissing(path, values) {
  const ref = db().doc(path);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const added = [];

  const patch = build(current ?? {}, values, '', added);
  if (!added.length) return { created: false, added };

  await ref.set({ ...patch, updatedAt: now() }, { merge: true });
  return { created: !snap.exists, added };
}

function build(current, desired, prefix, added) {
  const out = {};
  for (const [key, value] of Object.entries(desired)) {
    const at = prefix ? `${prefix}.${key}` : key;
    const existing = current?.[key];

    const bothPlainObjects =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing);

    if (bothPlainObjects) {
      const nested = build(existing, value, at, added);
      if (Object.keys(nested).length) out[key] = { ...existing, ...nested };
      continue;
    }

    if (existing === undefined) {
      out[key] = value;
      added.push(at);
    }
  }
  return out;
}

export { FieldValue, Timestamp };
