/**
 * Drive the self-service checkout the whole way: five wizard steps, the owner
 * email verification, Stripe Checkout with a test card, and back to the success
 * page — then read the database to see what was actually created.
 *
 * This is a driver rather than a spec because the first job is to find out what
 * the journey does: which requests it makes, what it sends, where it stops. The
 * spec is written from what this proves.
 *
 * The verification code is read out of `PlatformOutboundEmail`, which is the
 * harness equivalent of opening the inbox. It is not a bypass — the code still
 * goes through `POST /verify-email` and the server still checks the hash. A
 * bypass would be writing `ownerEmailVerifiedAt` directly, and that would prove
 * nothing about the flow a buyer walks.
 *
 * It refuses to run against production. Completing this journey creates a
 * customer, a subscription order, a Stripe charge and a tenant.
 */
import { chromium } from '@playwright/test';
import { Client } from 'pg';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3010';
const HEADED = process.argv.includes('--headed');
const RUN = `qa${Date.now().toString(36)}`;

if (/dijipeople\.com/i.test(BASE)) {
  console.error('REFUSING: this driver completes a real purchase. Not against production.');
  process.exit(1);
}

const DB_URL = fs
  .readFileSync(new URL('../../services/api/.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL="?([^"\n\r]*)"?/m)?.[1];

if (!DB_URL || !/localhost/.test(DB_URL) || !/_e2e_/.test(DB_URL)) {
  console.error('REFUSING: DATABASE_URL is not a local, disposable e2e database.');
  process.exit(1);
}

async function db(work) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try { return await work(client); } finally { await client.end().catch(() => {}); }
}

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 120 : 0 });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const consoleErrors = [];
const apiCalls = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 250)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 250)));
page.on('request', (r) => {
  if (/\/api\//.test(r.url()) && !/_next/.test(r.url())) {
    apiCalls.push({ method: r.method(), url: r.url().replace(BASE, ''), body: r.postData()?.slice(0, 700) ?? null });
  }
});
page.on('response', async (r) => {
  if (/\/api\//.test(r.url()) && !/_next/.test(r.url())) {
    const entry = apiCalls.findLast((c) => r.url().includes(c.url.split('?')[0]));
    if (entry && entry.status === undefined) {
      entry.status = r.status();
      try { entry.response = (await r.text()).slice(0, 400); } catch {}
    }
  }
});

const step = (l) => console.log(`\n--- ${l} ---`);
const mainText = () => page.locator('main').innerText();

async function fill(labelText, value) {
  const c = page.getByLabel(labelText, { exact: false }).first();
  await c.waitFor({ state: 'visible', timeout: 15_000 });
  const tag = await c.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') await c.selectOption({ label: value });
  else await c.fill(value);
  console.log(`   ${labelText} = ${value}`);
}

async function buttonInventory() {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')].map(
      (b) => `${(b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50)}${b.disabled ? ' [disabled]' : ''}`,
    ),
  );
}

async function clickNamed(name, why) {
  const b = page.getByRole('button', { name }).first();
  try {
    await b.waitFor({ state: 'visible', timeout: 15_000 });
  } catch (error) {
    console.log(`   "${why}" NOT FOUND. Buttons on page:`, await buttonInventory());
    console.log('   step text:\n' + (await mainText()).slice(0, 900));
    throw error;
  }
  if (await b.isDisabled()) {
    console.log(`   "${why}" is DISABLED. Step text:\n${(await mainText()).slice(0, 800)}`);
    throw new Error(`${why} disabled`);
  }
  await b.click();
  await page.waitForTimeout(800);
}

let orderId = null;
let slug = null;

try {
  step('open /subscribe with a self-service selection');
  await page.goto(`${BASE}/subscribe?plan=starter&billingInterval=MONTH&teamSize=25`, {
    waitUntil: 'networkidle', timeout: 60_000,
  });
  console.log('   quoted:', (await mainText()).match(/(PKR|USD|QAR)[^\n]*/g)?.slice(0, 3));

  /*
   * Driven by what is on screen, not by a step count.
   *
   * The wizard does not always advance one step per click — a step whose
   * fields are already satisfied can be skipped — so a fixed
   * fill/click/fill/click sequence silently ends up filling the wrong step and
   * then fails somewhere unrelated. Reading the current step and acting on it
   * is both more robust and a truer imitation of a person.
   */
  slug = `qa-${RUN}`.toLowerCase().slice(0, 30);
  const filled = new Set();

  for (let guard = 0; guard < 12; guard++) {
    /*
     * Settle before reading. A click can start a submission that only changes
     * the screen a second later, and a matcher run against the half-changed
     * page picks the wrong branch — which is how this driver spent three runs
     * "on the agreements step" while the page had already moved on.
     */
    await page.waitForTimeout(1200);
    const text = await mainText();

    if (/Confirm your email/i.test(text)) { step('reached email verification'); break; }

    if (/Your organization/i.test(text) && !filled.has('org')) {
      step('organization');
      await fill('Company name', `QA Test Co ${RUN}`);
      await fill('Country', 'Pakistan');
      await fill('Approximate employees', '25');
      filled.add('org');
    } else if (/Your workspace/i.test(text) && !filled.has('workspace')) {
      step('workspace');
      await fill('Workspace address', slug);
      await page.waitForTimeout(2500);
      console.log('   availability:', text.split('\n').filter((l) => /avail|taken|in use/i.test(l)).slice(0, 3));
      filled.add('workspace');
    } else if (/Workspace administrator/i.test(text) && !filled.has('owner')) {
      step('administrator');
      await fill('First name', 'Ada');
      await fill('Last name', 'Lovelace');
      await fill('Work email', `qa+${RUN}@dijipeople.local`);
      filled.add('owner');
      /*
       * Matched on the step's own body copy, not the word "Agreements" — that
       * appears in the five-across progress rail on *every* step, so the rail
       * made this branch fire on whatever screen happened to be showing.
       */
    } else if (/accept|agree to|terms below/i.test(text) && !filled.has('agreements')) {
      step('agreements');
      const boxes = page.locator('input[type=checkbox]');
      const count = await boxes.count();
      console.log(`   ${count} agreement checkbox(es) offered`);
      for (let i = 0; i < count; i++) await boxes.nth(i).check().catch(() => {});
      filled.add('agreements');
    }

    const submit = page.getByRole('button', { name: /confirm and verify email/i });
    if (await submit.count()) {
      step('review — submitting');
      console.log(text.slice(0, 700));
      await clickNamed(/confirm and verify email/i, 'Confirm and verify email');
      await page.waitForTimeout(3000);
      break;
    }

    /*
     * A Continue click can submit outright — when nothing is published to
     * accept, the wizard passes through Agreements and Review in one move — and
     * the button is gone before the next locator resolves. Losing it is not a
     * failure if the page landed where the click was meant to take it.
     */
    try {
      await clickNamed(/^continue$/i, 'Continue');
    } catch (error) {
      if (/Confirm your email/i.test(await mainText())) {
        step('reached email verification');
        break;
      }
      throw error;
    }
  }
  console.log('   after submit:', (await mainText()).slice(0, 300));

  step('read the verification code out of the outbound email');
  const email = await db((c) =>
    c.query(
      `select "entityId","htmlBody","createdAt" from "PlatformOutboundEmail"
       where "eventCode" = 'ONBOARDING_EMAIL_VERIFICATION'
       order by "createdAt" desc limit 1`,
    ).then((r) => r.rows[0]),
  );
  if (!email) throw new Error('no ONBOARDING_EMAIL_VERIFICATION email was recorded');
  orderId = email.entityId;
  const code = email.htmlBody.match(/<strong>(\d{4,8})<\/strong>/)?.[1];
  console.log('   order:', orderId, ' code:', code);
  if (!code) throw new Error('could not extract a code from the email body');

  step('enter the code');
  const codeInput = page.getByLabel(/verification code/i).first();
  await codeInput.waitFor({ state: 'visible', timeout: 15_000 });
  await codeInput.fill(code);
  await page.waitForTimeout(400);
  await clickNamed(/confirm and continue to payment/i, 'Confirm and continue to payment');

  step('expect Stripe Checkout');
  await page.waitForURL(/checkout\.stripe\.com|\/subscribe\/(success|cancel)/, { timeout: 60_000 });
  console.log('   landed on:', page.url());

  if (/checkout\.stripe\.com/.test(page.url())) {
    step('pay with the Stripe test card');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
    await page.getByPlaceholder('MM / YY').fill('12 / 34');
    await page.getByPlaceholder('CVC').fill('123');
    const name = page.getByPlaceholder('Full name on card');
    if (await name.count()) await name.fill('Ada Lovelace');
    const zip = page.getByPlaceholder('12345');
    if (await zip.count()) await zip.fill('12345');
    await page.getByTestId('hosted-payment-submit-button').click();
    console.log('   submitted payment; waiting for return…');
    await page.waitForURL(/\/subscribe\/(success|cancel)/, { timeout: 120_000 });
    console.log('   returned to:', page.url());
    await page.waitForTimeout(4000);
    console.log('   success page text:\n' + (await mainText()).slice(0, 900));
  }
} catch (error) {
  console.log('\n*** DRIVER STOPPED: ' + String(error).split('\n')[0]);
  try { console.log('current url: ' + page.url()); } catch {}
  try { console.log('main text:\n' + (await mainText()).slice(0, 1000)); } catch {}
}

console.log('\n=== API CALLS ===');
for (const c of apiCalls) {
  console.log(`${c.method} ${c.url} -> ${c.status ?? '?'}`);
  if (c.body) console.log('   body: ' + c.body);
  if (c.response) console.log('   resp: ' + c.response);
}
console.log('\n=== CONSOLE ERRORS ===', consoleErrors.length ? consoleErrors : 'none');

console.log('\n=== WHAT LANDED IN THE DATABASE ===');
try {
  const rows = await db(async (c) => ({
    orders: (await c.query(
      `select id, status, "customerAccountId", "requestedSlug", "ownerEmailVerifiedAt",
              "stripeCheckoutSessionId", "requestedSeats", "planPriceId", "totalAmount", "currency"
         from "SubscriptionOrder" order by "createdAt" desc limit 3`,
    )).rows,
    customers: (await c.query(
      `select id, "companyName", "contactEmail" from "CustomerAccount"
        order by "createdAt" desc limit 3`,
    )).rows,
    tenants: (await c.query(
      `select id, name, slug, status from "Tenant" order by "createdAt" desc limit 3`,
    )).rows,
  }));
  console.log('orders:', JSON.stringify(rows.orders, null, 1));
  console.log('customers:', JSON.stringify(rows.customers, null, 1));
  console.log('tenants:', JSON.stringify(rows.tenants, null, 1));
} catch (e) {
  console.log('db read failed:', String(e).slice(0, 300));
}

console.log('\nRUN:', RUN, 'slug:', slug, 'order:', orderId);
if (!HEADED) await browser.close();
