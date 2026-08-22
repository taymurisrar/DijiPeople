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
const legal = await get(`${API}/public/legal`);
const legalBody = json(legal.text);
const documents = Array.isArray(legalBody?.documents) ? legalBody.documents : [];

record(
  'the legal endpoint responds',
  legal.status === 200,
  `HTTP ${legal.status}`,
  'The public legal API is unreachable; the pages will render their unpublished state.',
);

record(
  'documents are published',
  documents.length > 0,
  `${documents.length} document(s)`,
  'seed-legal / legal:publish did not run, or ran and published nothing. The pages will still say "drafted but has not been published".',
);

for (const slug of ['privacy', 'terms']) {
  const document = await get(`${API}/public/legal/${slug}`);
  const body = json(document.text);
  record(
    `${slug} is served with content`,
    document.status === 200 && Boolean(body?.body || body?.content || body?.html),
    `HTTP ${document.status}`,
    `The ${slug} document is not published. Consent is being recorded against a notice with no published text.`,
  );
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
record(
  'the privacy page renders published text',
  privacyPage.status === 200 && !privacyPage.text.includes('Not published yet'),
  privacyPage.text.includes('Not published yet') ? 'still unpublished' : `HTTP ${privacyPage.status}`,
  'The page is live but still shows its honest placeholder — publication did not reach the database the landing site reads.',
);

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
