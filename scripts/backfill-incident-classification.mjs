#!/usr/bin/env node
/**
 * Apply the current not-an-incident rule to incidents recorded before it existed.
 *
 * BUG-1754 taught the platform that a routine `401` and a `404` for a route
 * that does not exist are answers the protocol is *for*, and
 * `isExpectedProtocolOutcome` has filed them as `NOT_AN_INCIDENT` since
 * 2026-08-28. The rule was never applied backwards, so every row recorded
 * before that date kept `supportStatus: NEW` forever — and because a repeat
 * increments `occurrenceCount` on the existing row rather than creating a new
 * one, those rows never age out either.
 *
 * The result, measured on 2026-08-30: 1,870 of 1,897 production incidents were
 * queued for triage, and roughly 1,850 of them needed nobody. That is the same
 * blindness BUG-1754 was filed to remove (BUG-2465).
 *
 * ## Why this goes through the API rather than the database
 *
 * `PATCH /platform/logs/events/:traceId` already exists, already requires
 * `monitoring:manage`, and already records who changed what. A direct `UPDATE`
 * against the production database would be faster and would bypass all three.
 * Slower and audited is the right trade for a bulk change to production data.
 *
 * ## Safety
 *
 * - Dry run by default. `--apply` is required to write anything.
 * - Only ever `NEW` → `NOT_AN_INCIDENT`. It never touches a row an operator has
 *   moved to `INVESTIGATING`, `RESOLVED` or anything else, and never moves a
 *   row *into* the queue.
 * - Classification is delegated to the same predicate the API uses at write
 *   time. There is deliberately no second copy of the rule here — a backfill
 *   that disagreed with the live classifier would be worse than no backfill.
 * - Writes a manifest of every changed traceId, so the change can be reversed.
 *
 * Usage:
 *   node scripts/backfill-incident-classification.mjs            # dry run
 *   node scripts/backfill-incident-classification.mjs --apply
 *   node scripts/backfill-incident-classification.mjs --revert <manifest.json>
 *
 * Credentials come from the environment, never from a flag:
 *   DIJIPEOPLE_API_URL     defaults to https://api.dijipeople.com/api
 *   DIJIPEOPLE_ADMIN_EMAIL
 *   DIJIPEOPLE_ADMIN_PASSWORD
 */

import { writeFileSync, readFileSync } from 'node:fs';

const API =
  process.env.DIJIPEOPLE_API_URL ?? 'https://api.dijipeople.com/api';
const EMAIL = process.env.DIJIPEOPLE_ADMIN_EMAIL;
const PASSWORD = process.env.DIJIPEOPLE_ADMIN_PASSWORD;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const revertIndex = args.indexOf('--revert');
const REVERT_FILE = revertIndex === -1 ? null : args[revertIndex + 1];

/**
 * The classification rule, imported rather than reimplemented.
 *
 * Kept as a dynamic import of the compiled source so this script has no build
 * step; if the API has not been built, it says so instead of guessing.
 */
async function loadClassifier() {
  // Prefer a real build when there is one.
  try {
    const built = await import(
      '../services/api/dist/src/modules/error-logs/expected-protocol-outcome.js'
    );
    if (built.isExpectedProtocolOutcome) return built.isExpectedProtocolOutcome;
  } catch {
    // Falls through to compiling the single file below.
  }

  /*
   * No build present, so transpile just that one file. It imports nothing, so
   * this is honest rather than a re-implementation: the bytes executed are the
   * bytes in the module the API ships.
   */
  const { default: ts } = await import('typescript');
  const { readFileSync: read } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');

  const here = dirname(fileURLToPath(import.meta.url));
  const source = read(
    join(
      here,
      '..',
      'services',
      'api',
      'src',
      'modules',
      'error-logs',
      'expected-protocol-outcome.ts',
    ),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
  return module.isExpectedProtocolOutcome;
}

let token = null;

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Set DIJIPEOPLE_ADMIN_EMAIL and DIJIPEOPLE_ADMIN_PASSWORD in the environment.',
    );
  }
  const response = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DijiPeople-App': 'admin',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}.`);
  }
  const data = await response.json();
  token = data.tokens?.accessToken ?? data.accessToken;
  if (!token) throw new Error('Login response carried no access token.');
}

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-DijiPeople-App': 'admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function fetchAllIncidents() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const { status, body } = await api(
      `/platform/logs/events?pageSize=100&page=${page}&sortBy=createdAt&sortDirection=desc`,
    );
    if (status !== 200) {
      throw new Error(`Listing failed on page ${page} with ${status}.`);
    }
    all.push(...(body.items ?? []));
    if (page >= (body.meta?.totalPages ?? 1)) break;
  }
  return all;
}

/**
 * The shape the classifier expects, rebuilt from what the listing exposes.
 *
 * `unmatchedRoute` is not a stored column — the exception filter derives it at
 * write time from the "Cannot GET /x" message Nest generates for a path it does
 * not serve. The same message is on the row, so the same conclusion is
 * available here. Anchored, so a message that merely quotes such a string does
 * not qualify.
 */
function toClassifierInput(incident) {
  return {
    statusCode: incident.statusCode,
    errorCode: incident.category,
    path: incident.route,
    unmatchedRoute: /^Cannot [A-Z]+ \//.test(String(incident.message ?? '')),
  };
}

async function main() {
  if (REVERT_FILE) return revert();

  const isExpectedProtocolOutcome = await loadClassifier();
  await login();

  const incidents = await fetchAllIncidents();
  const queued = incidents.filter((i) => i.supportStatus === 'NEW');
  const reclassify = queued.filter((i) =>
    isExpectedProtocolOutcome(toClassifierInput(i)),
  );

  const byReason = new Map();
  for (const incident of reclassify) {
    const key = `${incident.statusCode} ${incident.category}`;
    const entry = byReason.get(key) ?? { rows: 0, occurrences: 0 };
    entry.rows += 1;
    entry.occurrences += incident.occurrenceCount ?? 1;
    byReason.set(key, entry);
  }

  console.log(`Incidents:              ${incidents.length}`);
  console.log(`Queued as NEW:          ${queued.length}`);
  console.log(`Would reclassify:       ${reclassify.length}`);
  console.log(`Left in the queue:      ${queued.length - reclassify.length}`);
  console.log('\nBy reason:');
  for (const [reason, entry] of [...byReason].sort(
    (a, b) => b[1].occurrences - a[1].occurrences,
  )) {
    console.log(
      `  ${String(entry.rows).padStart(5)} rows / ${String(entry.occurrences).padStart(6)} occ  ${reason}`,
    );
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing was changed. Pass --apply to write.');
    return;
  }

  const manifest = {
    ranAt: new Date().toISOString(),
    api: API,
    changed: [],
    failed: [],
  };

  for (const [index, incident] of reclassify.entries()) {
    const { status, body } = await api(
      `/platform/logs/events/${encodeURIComponent(incident.traceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ supportStatus: 'NOT_AN_INCIDENT' }),
      },
    );
    if (status === 200) {
      manifest.changed.push(incident.traceId);
    } else {
      manifest.failed.push({ traceId: incident.traceId, status, body });
    }
    if ((index + 1) % 100 === 0) {
      console.log(`  … ${index + 1}/${reclassify.length}`);
    }
  }

  const path = `incident-backfill-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(manifest, null, 1));
  console.log(
    `\nReclassified ${manifest.changed.length}, failed ${manifest.failed.length}.`,
  );
  console.log(`Manifest: ${path} — pass it to --revert to undo.`);
}

async function revert() {
  await login();
  const manifest = JSON.parse(readFileSync(REVERT_FILE, 'utf8'));
  let restored = 0;
  for (const traceId of manifest.changed ?? []) {
    const { status } = await api(
      `/platform/logs/events/${encodeURIComponent(traceId)}`,
      { method: 'PATCH', body: JSON.stringify({ supportStatus: 'NEW' }) },
    );
    if (status === 200) restored += 1;
  }
  console.log(`Restored ${restored} of ${manifest.changed?.length ?? 0} to NEW.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
