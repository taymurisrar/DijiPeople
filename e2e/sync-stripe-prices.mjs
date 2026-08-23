/**
 * Sync the seeded plan prices to Stripe so a checkout can actually happen.
 *
 * `seed-commercial.ts` deliberately writes prices without touching Stripe, and
 * says so in its own header. The consequence is that a freshly seeded
 * deployment — which is what production is — has 36 active prices and zero
 * sellable ones, because `checkoutReady` requires a verified, active, synced
 * Stripe price.
 *
 * This script performs the operator step that nobody has performed: it PATCHes
 * each active price through the Platform Admin API, which runs
 * `prepareStripePlanPrice` and creates the Stripe product and recurring price.
 *
 * It is a TEST-MODE tool. It refuses to run against an API whose Stripe runtime
 * is live, because creating live Stripe products from a script is exactly the
 * kind of thing that should be a deliberate human act.
 */
import fs from 'node:fs';

const API = process.argv[2] ?? 'http://localhost:4001/api';
const DRY = process.argv.includes('--dry');

function envValue(key) {
  const file = fs.readFileSync(
    new URL('../services/api/.env', import.meta.url),
    'utf8',
  );
  const match = file.match(new RegExp(`^${key}="?([^"\\n\\r]*)"?`, 'm'));
  return match?.[1] ?? null;
}

async function json(path, init = {}) {
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

const email = envValue('BOOTSTRAP_ADMIN_EMAIL');
const password = envValue('BOOTSTRAP_ADMIN_PASSWORD');
const stripeMode = envValue('STRIPE_MODE');

if (stripeMode !== 'test') {
  console.error(`REFUSING: STRIPE_MODE is "${stripeMode}", not "test".`);
  process.exit(1);
}

const login = await json('/admin/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});

if (login.status !== 200 && login.status !== 201) {
  console.error('login failed:', login.status, JSON.stringify(login.body).slice(0, 600));
  process.exit(1);
}

const token =
  login.body?.accessToken ??
  login.body?.tokens?.accessToken ??
  login.body?.data?.accessToken;

if (!token) {
  console.error('no access token in login response:', Object.keys(login.body ?? {}));
  console.error(JSON.stringify(login.body).slice(0, 800));
  process.exit(1);
}
console.log('authenticated as', email);

const auth = { Authorization: `Bearer ${token}` };

const plans = await json('/super-admin/plans', { headers: auth });
if (plans.status !== 200) {
  console.error('plans list failed:', plans.status, JSON.stringify(plans.body).slice(0, 500));
  process.exit(1);
}

const planList = Array.isArray(plans.body) ? plans.body : (plans.body.plans ?? plans.body.data ?? []);
console.log(`plans: ${planList.length}`);

let attempted = 0;
let synced = 0;
const failures = [];

for (const plan of planList) {
  const prices = await json(`/super-admin/plans/${plan.id}/prices`, { headers: auth });
  const priceList = Array.isArray(prices.body) ? prices.body : (prices.body.prices ?? prices.body.data ?? []);

  for (const price of priceList) {
    if (!price.isActive) continue;
    if (price.stripeSyncStatus === 'SYNCED') { synced++; continue; }
    attempted++;
    const label = `${plan.key} ${price.currency} ${price.billingCycle} ${price.billingModel} ${price.unitAmount}`;
    if (DRY) { console.log('would sync:', label); continue; }

    /*
     * A PATCH that changes nothing still runs the Stripe preparation, because
     * `syncToStripe` defaults to true. Re-sending `unitAmount` keeps the price
     * identical while giving the service a reason to re-derive Stripe state.
     */
    const result = await json(`/super-admin/plans/${plan.id}/prices/${price.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ unitAmount: price.unitAmount }),
    });

    if (result.status === 200 || result.status === 201) {
      const status = result.body?.stripeSyncStatus ?? result.body?.price?.stripeSyncStatus ?? '?';
      console.log(`${status === 'SYNCED' ? 'OK  ' : 'WARN'} ${label} -> ${status}`);
      if (status === 'SYNCED') synced++;
      else failures.push(`${label}: ${status} ${result.body?.stripeVerificationError ?? ''}`);
    } else {
      const message = typeof result.body === 'object'
        ? (result.body.message ?? JSON.stringify(result.body).slice(0, 200))
        : String(result.body).slice(0, 200);
      console.log(`FAIL ${label} -> HTTP ${result.status} ${message}`);
      failures.push(`${label}: HTTP ${result.status} ${message}`);
    }
  }
}

console.log(`\nattempted ${attempted}, synced total ${synced}`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(' -', f);
}
