/* ============================================================================
   SEED THE EARNING CATALOGUES — WITH YOUR DATA, NOT INVENTED DATA
   ----------------------------------------------------------------------------
   Usage:
     npm run seed:catalogue                          # prints what it needs
     npm run seed:catalogue -- --file catalogue.json
     npm run seed:catalogue -- --collection shortlinks \
        --name "Shrinkme 30s" --targetUrl https://shrinkme.io/xyz --reward 40
     npm run seed:catalogue -- --file catalogue.json --dry-run

   WHY THIS SCRIPT SHIPS EMPTY
   The previous revision of this project served its PTC wall, shortlink list and
   offerwall grid from 27 fixture modules full of invented advertisers, invented
   payouts and URLs that went nowhere. Users clicked them. Removing that was the
   point of the rebuild, so this script will not write a row it did not get from
   you. It has no built-in inventory, no "sample" campaign, and no placeholder
   URL — a faucet's PTC list is its advertisers' copy and its shortlink list is
   its own affiliate links. Neither can be guessed, and a guessed one is a dead
   link in front of a real user on day one.

   WHAT IT DOES INSTEAD
   Validates what you give it against the fields the earning engines actually
   read, refuses obvious placeholders (example.com, YOUR_KEY, TODO, lorem), and
   writes one document per row with `enabled` and the counters the engines
   maintain. Everything it writes is equally editable in
   Admin → Modules, which is the normal path; this exists for the case where you
   are restoring inventory, moving projects, or scripting a launch.

   THE COLLECTIONS
     ptcAds              paid-to-click campaigns
     shortlinks          your monetised link inventory
     offerwallProviders  one document per wall; the doc id is in the postback URL
     challenges          progress goals, mirrored off the ledger's own counters
   ========================================================================== */

import { readFileSync } from 'node:fs';

import { bail, banner, db, heading, line, now, parseArgs } from './_firebase.mjs';

/* ---- FIELD SPECS ------------------------------------------------------------
   Every field below is one the earning engines read. `req` means the engine
   cannot work without it: `assertItemUsable()` refuses an item with no
   `targetUrl`, and a row with no reward is a row that pays nothing and looks
   broken. Defaults are the same fallbacks the read models apply, written
   explicitly so the document in Firestore matches what the UI shows.        */

const SPECS = {
  ptcAds: {
    label: 'PTC campaign',
    idFrom: null,
    fields: {
      title: { type: 'string', req: true, note: 'advertiser copy — your advertiser writes this' },
      description: { type: 'string', def: '' },
      targetUrl: { type: 'url', req: true, note: 'where the viewer is sent' },
      tokens: { type: 'int', req: true, note: 'integer tokens paid per completed view' },
      exp: { type: 'int', def: 2 },
      seconds: { type: 'int', def: 15, note: 'server-measured dwell time' },
      cooldownHours: { type: 'number', def: 24 },
      type: { type: 'enum', values: ['Window', 'Iframe', 'External', 'Youtube'], def: 'Window' },
      enabled: { type: 'bool', def: true },
    },
    counters: { viewsDelivered: 0 },
  },
  shortlinks: {
    label: 'Shortlink',
    idFrom: null,
    fields: {
      name: { type: 'string', req: true },
      targetUrl: { type: 'url', req: true, note: 'your monetised hop — the shortener or direct link' },
      reward: { type: 'int', req: true },
      exp: { type: 'int', def: 5 },
      seconds: { type: 'int', def: 180 },
      cap: { type: 'int', def: 1, note: 'completions allowed per user per UTC day' },
      cooldownHours: { type: 'number', def: null, note: 'omit and the engine derives 24/cap' },
      provider: { type: 'string', def: null },
      enabled: { type: 'bool', def: true },
    },
    counters: {},
  },
  offerwallProviders: {
    label: 'Offerwall provider',
    idFrom: 'id',
    fields: {
      name: { type: 'string', req: true },
      iframeUrl: { type: 'url', req: true, note: 'accepts {uid}, {username}, {country} placeholders' },
      secret: { type: 'string', req: true, note: 'postback signing secret from the provider' },
      signatureMode: {
        type: 'enum',
        values: ['hmac_sha256_payload', 'md5_tx_reward_secret', 'sha256_uid_reward_secret', 'none'],
        def: 'hmac_sha256_payload',
      },
      blurb: { type: 'string', def: '' },
      rating: { type: 'number', def: 4 },
      mark: { type: 'string', def: null, note: 'two-letter monogram; derived from the name if absent' },
      hue: { type: 'int', def: 160 },
      featured: { type: 'bool', def: false },
      enabled: { type: 'bool', def: true },
    },
    counters: {},
  },
  challenges: {
    label: 'Challenge',
    idFrom: null,
    fields: {
      title: { type: 'string', req: true },
      kind: { type: 'enum', values: ['faucet', 'ptc', 'shortlink', 'offerwall', 'referral'], req: true },
      target: { type: 'int', req: true, note: 'progress is read from the ledger, never stored' },
      tokens: { type: 'int', req: true },
      exp: { type: 'int', def: 0 },
      repeat: { type: 'enum', values: ['once', 'weekly'], def: 'once' },
      note: { type: 'string', def: null },
      enabled: { type: 'bool', def: true },
    },
    counters: {},
  },
};

/* ---- WHAT IT NEEDS ---------------------------------------------------------- */

function printRequirements() {
  heading('This script writes nothing without your data');
  line('  There is no built-in inventory. Supply rows one of two ways.');

  heading('1. A JSON file');
  line('  npm run seed:catalogue -- --file catalogue.json');
  line();
  line('  {');
  line('    "shortlinks": [');
  line('      { "name": "...", "targetUrl": "https://...", "reward": 40, "cap": 2 }');
  line('    ],');
  line('    "ptcAds": [');
  line('      { "title": "...", "targetUrl": "https://...", "tokens": 120, "seconds": 20 }');
  line('    ],');
  line('    "offerwallProviders": [');
  line('      { "id": "bitlabs", "name": "...", "iframeUrl": "https://...?uid={uid}",');
  line('        "secret": "...", "signatureMode": "hmac_sha256_payload" }');
  line('    ],');
  line('    "challenges": [');
  line('      { "title": "...", "kind": "faucet", "target": 50, "tokens": 500 }');
  line('    ]');
  line('  }');

  heading('2. One row on the command line');
  line('  npm run seed:catalogue -- --collection shortlinks \\');
  line('     --name "Shrinkme 30s" --targetUrl https://shrinkme.io/YOURCODE --reward 40');

  for (const [collection, spec] of Object.entries(SPECS)) {
    heading(`${collection} — ${spec.label}`);
    if (spec.idFrom) {
      line(`  id                REQUIRED. The document id, and the {providerId} in your`);
      line(`                    postback URL: /api/offerwall/{providerId}. Use a slug.`);
    }
    for (const [name, field] of Object.entries(spec.fields)) {
      const req = field.req ? 'REQUIRED' : `optional (${field.def === null ? 'unset' : JSON.stringify(field.def)})`;
      const type = field.type === 'enum' ? field.values.join('|') : field.type;
      line(`  ${name.padEnd(17)} ${req.padEnd(24)} ${type}${field.note ? ` — ${field.note}` : ''}`);
    }
  }

  heading('Why it will not make these up');
  line('  A PTC campaign is an advertiser\'s copy and a shortlink is your affiliate');
  line('  link. Inventing either puts dead links in front of real users, which is');
  line('  what this rebuild removed. Bring real values or leave the catalogues');
  line('  empty — an empty earning page states that it is empty and is honest.');
  line();
}

/* ---- VALIDATION -------------------------------------------------------------
   The placeholder check is the part that enforces the rule this script exists
   for. `example.com`, `YOUR_KEY`, `TODO` and lorem ipsum are exactly what a
   half-finished copy-paste looks like, and a half-finished row is worse than a
   missing one: it renders as a real offer, a user clicks it, and the support
   ticket arrives before you notice.                                         */

const PLACEHOLDER = /(example\.(com|org|net)|localhost|your[-_ ]?(key|code|url|link|id)|yourdomain|replace[-_ ]?me|\bTODO\b|\bFIXME\b|lorem ipsum|xxxx+|placeholder|changeme)/i;

function reject(collection, index, message) {
  bail(`${collection}[${index}]: ${message}\n\nNothing was written. Fix the row and run again.`);
}

function coerce(collection, index, name, field, raw) {
  if (raw === undefined || raw === null || raw === '') {
    if (field.req) reject(collection, index, `${name} is required${field.note ? ` (${field.note})` : ''}.`);
    return field.def === undefined ? null : field.def;
  }

  const text = String(raw).trim();

  switch (field.type) {
    case 'int': {
      const n = Number(text);
      if (!Number.isFinite(n)) reject(collection, index, `${name} must be a number, got "${text}".`);
      if (field.req && Math.trunc(n) <= 0) {
        reject(collection, index, `${name} must be a positive integer — a row that pays 0 looks broken.`);
      }
      return Math.trunc(n);
    }
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) reject(collection, index, `${name} must be a number, got "${text}".`);
      return n;
    }
    case 'bool':
      return text !== 'false' && text !== '0';
    case 'enum':
      if (!field.values.includes(text)) {
        reject(collection, index, `${name} must be one of ${field.values.join(', ')}, got "${text}".`);
      }
      return text;
    case 'url': {
      let parsed;
      try {
        parsed = new URL(text);
      } catch {
        reject(collection, index, `${name} is not a URL: "${text}".`);
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        reject(collection, index, `${name} must be http(s), got "${parsed.protocol}".`);
      }
      if (parsed.protocol === 'http:') {
        line(`  warning: ${collection}[${index}].${name} is plain http — browsers will flag it.`);
      }
      if (PLACEHOLDER.test(text)) {
        reject(collection, index, `${name} looks like a placeholder: "${text}". Use the real destination.`);
      }
      return text;
    }
    default:
      if (PLACEHOLDER.test(text)) {
        reject(collection, index, `${name} looks like placeholder copy: "${text}".`);
      }
      if (text.length > 500) reject(collection, index, `${name} is over 500 characters.`);
      return text;
  }
}

function buildRow(collection, index, input) {
  const spec = SPECS[collection];
  const doc = {};

  for (const [name, field] of Object.entries(spec.fields)) {
    const value = coerce(collection, index, name, field, input[name]);
    if (value !== null) doc[name] = value;
    else if (field.def === null) doc[name] = null;
  }

  let id = null;
  if (spec.idFrom) {
    const raw = String(input[spec.idFrom] ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,48}$/.test(raw)) {
      reject(
        collection,
        index,
        `id is required and must be a slug (a-z, 0-9, - and _). It becomes the ` +
          `{providerId} in your postback URL, so pick the name the provider uses.`,
      );
    }
    id = raw;
  }

  /* Unknown keys are refused rather than dropped. A typo'd field name that gets
     silently ignored is a row that will not behave the way its author thinks it
     does, and the failure surfaces days later as "why is this paying 0". */
  const known = new Set([...Object.keys(spec.fields), spec.idFrom].filter(Boolean));
  const unknown = Object.keys(input).filter((k) => !known.has(k));
  if (unknown.length) {
    reject(collection, index, `unknown field(s): ${unknown.join(', ')}. Nothing reads them.`);
  }

  return { id, doc: { ...doc, ...spec.counters } };
}

function rowsFromFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    bail(`Could not read ${path} as JSON.\n${error.message}`);
  }

  const unknown = Object.keys(parsed).filter((k) => !SPECS[k]);
  if (unknown.length) {
    bail(`${path} has unknown top-level key(s): ${unknown.join(', ')}.\nValid: ${Object.keys(SPECS).join(', ')}.`);
  }

  const out = [];
  for (const [collection, rows] of Object.entries(parsed)) {
    if (!Array.isArray(rows)) bail(`${path}: "${collection}" must be an array of rows.`);
    rows.forEach((row, i) => out.push({ collection, index: i, input: row }));
  }
  return out;
}

async function main() {
  const { flags } = parseArgs();

  const file = flags.get('file');
  const collection = flags.get('collection');
  const dryRun = flags.has('dry-run');

  /* Before `banner()`, which initialises the Admin SDK: printing what this
     script needs must work on a machine with no credentials configured yet,
     because that is exactly the machine whose operator is asking. */
  if (flags.has('help') || (!file && !collection)) {
    printRequirements();
    if (flags.has('help')) return;
    bail('No --file and no --collection given, so nothing was written.');
  }

  banner('seed-catalogue');

  if (collection && !SPECS[collection]) {
    bail(`"${collection}" is not a catalogue.\nValid: ${Object.keys(SPECS).join(', ')}.`);
  }

  const pending = file
    ? rowsFromFile(file)
    : [
        {
          collection,
          index: 0,
          input: Object.fromEntries(
            [...flags.entries()].filter(([k]) => !['collection', 'file', 'dry-run', 'help'].includes(k)),
          ),
        },
      ];

  if (!pending.length) bail(`${file} contained no rows.`);

  const built = pending.map((row) => ({ ...row, ...buildRow(row.collection, row.index, row.input) }));

  if (dryRun) {
    heading('Dry run — validated, nothing written');
    for (const row of built) {
      line(`  ${row.collection}/${row.id ?? '(auto id)'}`);
      line(`    ${JSON.stringify(row.doc)}`);
    }
    line();
    return;
  }

  const written = [];
  for (const row of built) {
    const ref = row.id ? db().doc(`${row.collection}/${row.id}`) : db().collection(row.collection).doc();
    const existed = row.id ? (await ref.get()).exists : false;
    await ref.set({ ...row.doc, updatedAt: now(), ...(existed ? {} : { createdAt: now() }) }, { merge: true });
    written.push({ path: `${row.collection}/${ref.id}`, existed });
  }

  heading('Written');
  for (const row of written) line(`  ${row.existed ? 'updated' : 'created'}  /${row.path}`);

  const providers = written.filter((row) => row.path.startsWith('offerwallProviders/'));
  if (providers.length) {
    heading('Postback URLs to paste into each provider dashboard');
    const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://your-domain').replace(/\/+$/, '');
    for (const row of providers) {
      const id = row.path.split('/')[1];
      line(`  ${origin}/api/offerwall/${id}`);
    }
    line();
    line('  Query parameters the endpoint accepts (it reads any of the common');
    line('  spellings, from the query string or the body, GET or POST):');
    line('    uid  tx  reward  status  offer  signature');
    line();
    line('  An unsigned or wrongly-signed postback is RECORDED and REFUSED, never');
    line('  credited — check Admin → Modules → Offerwall if a provider reports 401s,');
    line('  because the row will be there with signatureValid: false.');
  }

  line();
  line('  Everything written here is editable in Admin → Modules, which is the normal');
  line('  path. Rows are live immediately; set enabled: false to pull one without');
  line('  losing its configuration.');
  line();
}

main().catch((error) => {
  bail(`seed-catalogue failed.\n${error?.stack ?? error}`);
});
