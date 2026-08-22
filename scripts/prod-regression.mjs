#!/usr/bin/env node
/*
 * A read-only regression pass against production.
 *
 * WHY THIS EXISTS, AND WHAT IT IS NOT.
 *
 * `smoke-deployment.mjs` answers "did it boot". This answers "is it the thing we
 * shipped, and does the thing we shipped it for actually work" — which is a
 * different question, and the one that was missing when a merge sat undeployed
 * for 48 minutes with nothing reporting an error.
 *
 * **Strictly read-only.** Every request is a GET against a public endpoint. It
 * creates nothing, signs in as nobody, and touches no tenant data. A regression
 * pass that mutates production is not a regression pass.
 *
 * **Every check names what it would mean if it failed**, because the output is
 * read by somebody deciding whether to roll back, and "check 7 failed" does not
 * help them.
 *
 * Usage:
 *   node scripts/prod-regression.mjs                     # expects nothing in particular
 *   node scripts/prod-regression.mjs --expect-commit <sha>
 */
import { readFileSync } from 'node:fs';

const API = 'https://api.dijipeople.com/api';
const SURFACES = {
  landing: 'https://www.dijipeople.com',
  web: 'https://app.dijipeople.com',
  admin: 'https://admin.dijipeople.com',
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

const expectCommit = arg('expect-commit');

const results = [];
function record(name, passed, detail, meaning) {
  results.push({ name, passed, detail, meaning });
  const mark = passed === null ? '~' : passed ? 'PASS' : 'FAIL';
  console.log(`  ${String(mark).padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed && meaning) console.log(`       ↳ ${meaning}`);
}

async function get(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, {
      redirect: options.follow === false ? 'manual' : 'follow',
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    return { status: response.status, text, ok: response.ok };
  } catch (error) {
    return { status: 0, text: '', ok: false, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

console.log(`Production regression — ${new Date().toISOString()}`);
console.log('Read-only. No writes, no sign-in, no tenant data.\n');

console.log('API');
const health = await get(`${API}/health`);
const healthBody = json(health.text);

record(
  'health responds',
  health.status === 200 && healthBody?.status === 'ok',
  `HTTP ${health.status}`,
  'The API is down or unreachable. Nothing below is meaningful.',
);

record(
  'environment is production',
  healthBody?.environment === 'production',
  healthBody?.environment ?? 'unknown',
  'This is not the production deployment — check which service was reached.',
);

if (expectCommit) {
  const deployed = String(healthBody?.commitShort ?? '');
  record(
    'the deployed commit is the one we shipped',
    deployed.startsWith(expectCommit.slice(0, 7)),
    `deployed ${deployed || 'unknown'}, expected ${expectCommit.slice(0, 7)}`,
    'The merge did not reach production. A green merge is not a deploy — the build may still be running, or it failed.',
  );
} else {
  record('deployed commit', null, healthBody?.commitShort ?? 'unknown');
}

/*
 * BUG-0714. The scheme here is not cosmetic: this value is what customer-facing
 * links are built from, and it 301s, so an http value works and quietly sends
 * the first hop in plaintext.
 */
record(
  'apiBaseUrl is https',
  String(healthBody?.apiBaseUrl ?? '').startsWith('https://'),
  healthBody?.apiBaseUrl ?? 'unknown',
  'BUG-0714 has regressed, or the deploy has not picked up the corrected environment.',
);

record(
  'apiBaseUrl is on the customer domain',
  String(healthBody?.apiBaseUrl ?? '').includes('dijipeople.com') &&
    !String(healthBody?.apiBaseUrl ?? '').includes('onrender.com'),
  healthBody?.apiBaseUrl ?? 'unknown',
  'The API advertises a deployment host rather than the customer domain.',
);

console.log('\nLegal documents — ITEM-0053');

/*
 * The expected state is DERIVED, not asserted.
 *
 * A first version of this hardcoded "documents must be published", which was
 * right while publication was the goal and wrong ten minutes later. On
 * 2026-08-22 ten documents were published carrying a banner reading "Draft —
 * not published, and not legal advice", and withdrawing them was the correct
 * action — at which point a regression demanding publication was reporting a
 * deliberate fix as four failures.
 *
 * So it asks the repository what the right answer is. If the seeded copy still
 * declares itself a draft, then UNPUBLISHED is correct and publication is the
 * failure. When the reviewed copy replaces it, the expectation flips on its own
 * and nobody has to remember a flag.
 */
const seedPath = new URL('../services/api/prisma/seed-legal.ts', import.meta.url);
let copyIsPublishable = false;
try {
  const { findDraftSelfDeclarations } = await import(
    new URL('../services/api/src/modules/legal/legal.service.ts', import.meta.url).href
  ).catch(() => ({}));
  const seed = readFileSync(seedPath, 'utf8');
  copyIsPublishable = typeof findDraftSelfDeclarations === 'function'
    ? findDraftSelfDeclarations(seed).length === 0
    : !/Draft\s*[—–-]\s*not published|not been reviewed by a lawyer/i.test(seed);
} catch {
  // Cannot read the seed — say so rather than guessing an expectation.
  copyIsPublishable = null;
}

const legal = await get(`${API}/public/legal`);
const legalBody = json(legal.text);
const documents = Array.isArray(legalBody?.documents) ? legalBody.documents : [];

record(
  'the legal endpoint responds',
  legal.status === 200,
  `HTTP ${legal.status}`,
  'The public legal API is unreachable.',
);

if (copyIsPublishable === null) {
  record('legal publication state', null, 'seed file unreadable — expectation unknown');
} else if (copyIsPublishable) {
  record(
    'documents are published',
    documents.length > 0,
    `${documents.length} document(s)`,
    'The copy is publishable but nothing is published — seed:legal / legal:publish did not run.',
  );

  for (const slug of ['privacy', 'terms']) {
    const document = await get(`${API}/public/legal/${slug}`);
    const body = json(document.text);
    record(
      `${slug} is served with content`,
      document.status === 200 && Boolean(body?.contentMarkdown),
      `HTTP ${document.status}`,
      `The ${slug} document is not published. Consent would be recorded against a notice with no published text.`,
    );
  }
} else {
  /*
   * The copy still declares itself a draft, so nothing should be public. This
   * is the assertion that would have caught the 2026-08-22 incident within
   * seconds of it happening.
   */
  record(
    'no draft document is published',
    documents.length === 0,
    `${documents.length} document(s) public while the seeded copy still declares itself a draft`,
    'A document that calls itself an unreviewed draft is publicly readable. Withdraw it: npm --workspace api run legal:unpublish -- --confirm',
  );

  for (const slug of ['privacy', 'terms']) {
    const document = await get(`${API}/public/legal/${slug}`);
    record(
      `${slug} is correctly not served`,
      document.status === 404,
      `HTTP ${document.status}`,
      `The ${slug} document is being served while its text still says it is an unreviewed draft.`,
    );
  }
}

console.log('\nSurfaces');
for (const [name, url] of Object.entries(SURFACES)) {
  const response = await get(url, { follow: false });
  // 200 for the landing, 3xx for the two authenticated apps redirecting to login.
  const healthy = response.status === 200 || (response.status >= 300 && response.status < 400);
  record(
    `${name} responds`,
    healthy,
    `HTTP ${response.status}`,
    `${url} is not serving. Customers cannot reach this surface.`,
  );
}

const privacyPage = await get(`${SURFACES.landing}/legal/privacy`);
const pageShowsPlaceholder = privacyPage.text.includes('Not published yet');
if (copyIsPublishable) {
  record(
    'the privacy page renders published text',
    privacyPage.status === 200 && !pageShowsPlaceholder,
    pageShowsPlaceholder ? 'still unpublished' : `HTTP ${privacyPage.status}`,
    'The page is live but still shows its placeholder — publication did not reach the database the landing site reads.',
  );
} else {
  /*
   * Note this reads the page, not the API. They can disagree: the API went
   * clean immediately after the withdrawal while the pages served a Vercel
   * prerender cache for several more minutes, and it is the page a visitor
   * sees.
   */
  record(
    'the privacy page shows its unpublished state',
    privacyPage.status === 200 && pageShowsPlaceholder,
    pageShowsPlaceholder ? 'unpublished, as intended' : 'serving draft text',
    'The page is serving a document whose own text says it is an unreviewed draft — possibly a stale edge cache. Re-request it to force revalidation.',
  );
}

console.log('\nPublic endpoints that must stay closed');
/*
 * Not exhaustive, and deliberately so — this asks whether the shape of public
 * access changed, not whether authorization is correct, which is what the RBAC
 * suites are for. A 401 or 403 is the pass; a 200 is a leak.
 */
for (const path of ['/super-admin/customers', '/platform/tenants', '/users']) {
  const response = await get(`${API}${path}`);
  /*
   * A 404 is a pass, not a failure.
   *
   * The first version of this accepted only 401 and 403, and reported
   * `/platform/tenants` returning 404 as "an authenticated endpoint answered an
   * anonymous request" — which is the opposite of what a 404 means. It is a
   * refusal, and arguably the better one, since it does not confirm the route
   * exists to somebody probing for it.
   *
   * The check that matters is the inverse: **a 2xx is the leak.** Anything that
   * refuses, refuses. Written the other way round, this would cry wolf during
   * the one situation it exists for.
   */
  const leaked = response.status >= 200 && response.status < 300;
  record(
    `${path} refuses an unauthenticated caller`,
    !leaked,
    `HTTP ${response.status}`,
    'An authenticated endpoint answered an anonymous request with data. Stop and investigate before anything else.',
  );
}

const failed = results.filter((entry) => entry.passed === false);
console.log(
  `\n${results.length - failed.length}/${results.filter((r) => r.passed !== null).length} checks passed`,
);

if (failed.length) {
  console.log('\nFAILED:');
  for (const entry of failed) console.log(`  x ${entry.name} — ${entry.detail}`);
  process.exit(1);
}
console.log('PRODUCTION_REGRESSION = PASS');
