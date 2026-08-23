#!/usr/bin/env node
/**
 * Sync every active plan price to Stripe, so the catalogue can actually be sold.
 *
 * ## Why this exists
 *
 * `seed-commercial.ts` deliberately never contacts Stripe — it says so in its
 * own header, and it is right to: creating products on somebody's real Stripe
 * account is not a seed's business. The consequence is that a freshly seeded
 * deployment has a full catalogue and **nothing purchasable**, because
 * `deriveCheckoutReadiness` requires a verified, active, synced Stripe price.
 *
 * That is exactly the state production was found in on 2026-08-23: 0 of 36
 * active prices checkout-ready, every plan on `/subscribe` rendering
 * `DP-CHK-01` and no form at all, for as long as anyone could measure. Nobody
 * could buy. BUG-0898.
 *
 * The mechanism was never broken. `SuperAdminService.prepareStripePlanPrice`
 * creates the product and the recurring price and verifies the result — it is
 * simply reached only by creating or editing a price through Platform Admin,
 * one at a time. Thirty-six individual admin edits is not a step anyone
 * completes, which is why it had never been completed. ITEM-0085.
 *
 * ## What it does
 *
 * PATCHes each active price through the Platform Admin API with its own current
 * `unitAmount`, which changes nothing about the price and gives the service a
 * reason to re-derive its Stripe state. It is idempotent: a price already
 * `SYNCED` is skipped.
 *
 * ## Guards, and why each one is here
 *
 * - **Dry run by default.** `--confirm` is required to write anything.
 * - **Live mode needs `--live` as well.** Creating products on a live Stripe
 *   account is a commercial act; it should take two deliberate flags, not one.
 * - **The mode must match what the API is actually running.** `stripeEnvironment`
 *   is baked into each price at sync time and `deriveCheckoutReadiness` compares
 *   it to the runtime mode — so syncing in test mode and later switching the API
 *   to live silently invalidates all of them and re-blocks checkout. Getting
 *   this order wrong is the most likely way to repeat BUG-0898, so the script
 *   asks the API which mode it is in rather than trusting a flag.
 *
 * ## Usage
 *
 *     node scripts/sync-stripe-prices.mjs --api https://api.dijipeople.com/api
 *     node scripts/sync-stripe-prices.mjs --api … --confirm            # test mode
 *     node scripts/sync-stripe-prices.mjs --api … --confirm --live     # live mode
 *
 * Credentials come from `SYNC_ADMIN_EMAIL` / `SYNC_ADMIN_PASSWORD`, or fall back
 * to `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`. There is no default
 * password by design — a platform super admin is the most privileged account
 * this system has.
 */

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const API = (arg('--api') ?? process.env.SYNC_API_BASE_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
const CONFIRM = process.argv.includes('--confirm');
const LIVE = process.argv.includes('--live');

const email = process.env.SYNC_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.SYNC_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set SYNC_ADMIN_EMAIL and SYNC_ADMIN_PASSWORD (or the BOOTSTRAP_ADMIN_* pair).');
  process.exit(1);
}

async function call(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-DijiPeople-App': 'admin',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

/*
 * Which Stripe mode is the API actually in? Asked, not assumed — see the guard
 * note above. `/public/plans` exposes `stripeEnvironment` on any already-synced
 * price; when nothing is synced yet there is nothing to compare against, and the
 * operator's `--live` flag is the only signal there is.
 */
const plansProbe = await call('/public/plans');
if (plansProbe.status !== 200) {
  console.error(`Cannot read ${API}/public/plans — got ${plansProbe.status}.`);
  process.exit(1);
}
const probePlans = Array.isArray(plansProbe.body) ? plansProbe.body : (plansProbe.body.plans ?? []);
const observedEnvironments = [
  ...new Set(
    probePlans
      .flatMap((plan) => plan.prices ?? [])
      .map((price) => price.stripeEnvironment)
      .filter(Boolean),
  ),
];

const intended = LIVE ? 'LIVE' : 'TEST';
const conflicting = observedEnvironments.filter((environment) => environment !== intended);
if (conflicting.length) {
  console.error(
    `Refusing: prices already carry stripeEnvironment ${conflicting.join(', ')} ` +
      `but this run intends ${intended}. Re-syncing would leave the two mixed, and ` +
      `checkoutReady requires the environment to match the API's runtime mode.`,
  );
  process.exit(1);
}

const login = await call('/admin/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
if (login.status !== 200 && login.status !== 201) {
  console.error('Login failed:', login.status, JSON.stringify(login.body).slice(0, 300));
  process.exit(1);
}
const token = login.body?.accessToken ?? login.body?.tokens?.accessToken;
if (!token) {
  console.error('No access token in the login response.');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

const plans = await call('/super-admin/plans', { headers: auth });
const planList = Array.isArray(plans.body) ? plans.body : (plans.body.plans ?? []);

console.log(`${API}  —  ${intended} mode  —  ${CONFIRM ? 'CONFIRMED' : 'DRY RUN'}`);
console.log('');

let alreadySynced = 0;
let synced = 0;
const failures = [];
const wouldSync = [];

for (const plan of planList) {
  const prices = await call(`/super-admin/plans/${plan.id}/prices`, { headers: auth });
  const priceList = Array.isArray(prices.body) ? prices.body : (prices.body.prices ?? []);

  for (const price of priceList) {
    if (!price.isActive) continue;
    const label = `${plan.key} ${price.currency} ${price.billingCycle} ${price.billingModel} ${price.unitAmount}`;

    if (price.stripeSyncStatus === 'SYNCED') { alreadySynced++; continue; }
    if (!CONFIRM) { wouldSync.push(label); continue; }

    const result = await call(`/super-admin/plans/${plan.id}/prices/${price.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ unitAmount: price.unitAmount }),
    });

    const status = result.body?.stripeSyncStatus ?? '?';
    if ((result.status === 200 || result.status === 201) && status === 'SYNCED') {
      console.log(`  OK   ${label}`);
      synced++;
    } else {
      const detail = typeof result.body === 'object'
        ? (result.body.message ?? result.body.stripeVerificationError ?? status)
        : String(result.body).slice(0, 160);
      console.log(`  FAIL ${label} → ${detail}`);
      failures.push(`${label}: ${detail}`);
    }
  }
}

if (!CONFIRM) {
  for (const label of wouldSync) console.log(`  would sync  ${label}`);
  console.log('');
  console.log(`${wouldSync.length} price(s) would be synced, ${alreadySynced} already are.`);
  console.log('Re-run with --confirm to write.' + (LIVE ? '' : ' Add --live for a live Stripe account.'));
  process.exit(0);
}

console.log('');
console.log(`Synced ${synced}, already synced ${alreadySynced}, failed ${failures.length}.`);
if (failures.length) {
  for (const failure of failures) console.log('  -', failure);
  process.exit(1);
}

console.log('');
console.log('Confirm with `npm run report:commercial`, then `npm run smoke:deployment`.');
