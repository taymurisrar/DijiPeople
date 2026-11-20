import { expect, request, type Page } from '@playwright/test';
import type { Client } from 'pg';
import { BASE_URLS } from '../playwright.config';
import { withDatabase } from './environment';
import { RUN_TAG } from './growth-api';
import { TARGET } from './landing-target';
import { assessSafety } from './safety';
import { tenantUrl } from './web-session';

/**
 * Everything the bank-transfer purchase journey needs that is not the journey
 * itself: the safety gate, the two platform operators, the receiving account
 * the platform must have before a customer can be shown bank details, the
 * browser steps shared by every test, and the tag-based cleanup.
 *
 * ## Why the checker is a second real platform user
 *
 * The product's two-person rule sits on **where customer money is sent**: an
 * operator who enters a receiving account cannot approve it, and a payment
 * method needs an approved, active account before it can be enabled
 * (`PaymentMethodRegistryService.decideAccount`). Claim approval itself is a
 * single operator's decision on top of an independent bank-statement
 * reference. So the maker/checker pair created here is what makes bank details
 * appear on the landing page at all, and the rule is exercised, not bypassed:
 * the maker is refused when it tries to approve its own account.
 *
 * ## Why SQL appears here
 *
 * Only to read what a person reads from an inbox (the verification code), to
 * assert persisted outcomes a browser cannot see, and to remove exactly the rows
 * this run created, found by `RUN_TAG`. Every state change in the journey goes
 * through the product.
 */

export const TAG = RUN_TAG;

/** A real PNG signature plus padding: enough for the server's magic-byte check. Not a real receipt. */
export const SYNTHETIC_RECEIPT = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

export type Json = Record<string, unknown>;
export type ApiCall = { status: number; body: Json; message: string; code: string };

export type PlatformOperator = {
  email: string;
  password: string;
  userId: string;
  call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<ApiCall>;
};

/* ------------------------------------------------------------------ safety */

/**
 * Throws (never skips) unless every URL this journey touches is loopback, the
 * API is not production and the database is a disposable `*_test` / `*_e2e`
 * one. Runs before the first write.
 */
export async function requireBankTransferEnvironment(): Promise<void> {
  const probe = await request.newContext();
  let apiEnvironment: string | null = null;
  try {
    const response = await probe.get(`${BASE_URLS.api}/api/health`).catch(() => null);
    if (!response?.ok()) throw new Error(`API not reachable at ${BASE_URLS.api}/api/health`);
    apiEnvironment =
      ((await response.json().catch(() => null)) as { environment?: string } | null)?.environment ?? null;
  } finally {
    await probe.dispose();
  }
  const verdict = assessSafety({
    urls: {
      api: BASE_URLS.api,
      landing: TARGET.landing,
      landingApi: TARGET.api,
      admin: BASE_URLS.admin,
      web: BASE_URLS.web,
    },
    databaseUrl: process.env.E2E_DATABASE_URL,
    apiEnvironment,
  });
  if (!verdict.safe) {
    throw new Error(
      [
        'REFUSING TO RUN: this journey creates customers, tenants and payment claims and must only run against a disposable local stack.',
        ...verdict.reasons.map((reason) => `  - ${reason}`),
      ].join('\n'),
    );
  }
  if (!process.env.E2E_PLATFORM_ADMIN_EMAIL || !process.env.E2E_PLATFORM_ADMIN_PASSWORD) {
    throw new Error('E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD are required (no default exists by design).');
  }
}

/* ---------------------------------------------------------- platform admins */

export async function platformOperator(email: string, password: string): Promise<PlatformOperator> {
  const context = await request.newContext();
  const api = `${BASE_URLS.api}/api`;
  const login = await context.post(`${api}/admin/auth/login`, {
    headers: { 'X-DijiPeople-App': 'admin' },
    data: { email, password },
  });
  if (!login.ok()) {
    throw new Error(`platform sign-in as ${email} failed with ${login.status()} (429 = login throttle: restart your own API)`);
  }
  const session = (await login.json()) as { tokens: { accessToken: string }; user: { userId: string } };
  const headers = { 'X-DijiPeople-App': 'admin', Authorization: `Bearer ${session.tokens.accessToken}` };
  return {
    email,
    password,
    userId: session.user.userId,
    async call(method, path, data) {
      const response = await context.fetch(`${api}${path}`, { method, headers, data });
      const text = await response.text();
      let body: Json = {};
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = { raw: text };
      }
      const raw = body.message;
      return {
        status: response.status(),
        body,
        message: Array.isArray(raw) ? raw.join(' | ') : String(raw ?? ''),
        code: String(body.errorCode ?? (body.code as string | undefined) ?? ''),
      };
    },
  };
}

/** The checker: a second, tagged platform user created through the product's own endpoint. */
export async function createChecker(maker: PlatformOperator): Promise<PlatformOperator> {
  const email = `qa-${TAG}-checker@example.test`;
  const password = `Qa!Checker-${TAG}-9`;
  const created = await maker.call('POST', '/platform-users', {
    email,
    firstName: 'QA',
    lastName: `Checker ${TAG}`,
    password,
    role: 'SUPER_ADMIN',
  });
  if (created.status !== 201) {
    throw new Error(`could not create the checker platform user: ${created.status} ${created.message}`);
  }
  return platformOperator(email, password);
}

/* ------------------------------------------------- the platform's bank setup */

export type GrowthOffer = {
  planPriceId: string;
  marketId: string;
  currency: string;
  unitAmount: string;
};

/** The published, active Growth monthly price the landing page shows for this visitor (USD, market-scoped). */
export async function findGrowthOffer(): Promise<GrowthOffer> {
  const row = await withDatabase(async (client) => {
    const result = await client.query(
      `select pp.id, pp."marketId", pp.currency, pp."unitAmount"
         from "PlanPrice" pp join "Plan" p on p.id = pp."planId"
        where p.key = 'growth' and pp."isActive" and pp."publicationStatus" = 'PUBLISHED'
          and pp."billingCycle" = 'MONTHLY' and pp."marketId" is not null and pp.currency = 'USD'
        limit 1`,
    );
    return result.rows[0] as { id: string; marketId: string; currency: string; unitAmount: string } | undefined;
  });
  if (!row) {
    throw new Error('no published USD Growth monthly price in a market: run seed:config (the INTL market carries it)');
  }
  return { planPriceId: row.id, marketId: row.marketId, currency: row.currency, unitAmount: row.unitAmount };
}

/**
 * Make bank transfer purchasable for the offer's market: a method configuration,
 * one receiving account entered by the maker and approved by a different
 * operator, then approval and enablement. Reuses an already-ready method (and
 * says so) rather than creating a second configuration for the same market.
 */
export async function provisionBankMethod(
  maker: PlatformOperator,
  checker: PlatformOperator,
  offer: GrowthOffer,
): Promise<{ configId: string; owned: boolean }> {
  const existing = await maker.call('GET', '/super-admin/billing/payment-methods');
  const items = (existing.body.items ?? []) as Array<Json>;
  const match = items.find(
    (item) =>
      item.marketId === offer.marketId && item.currency === offer.currency && item.methodKey === 'BANK_TRANSFER',
  );
  if (match) {
    if (match.enabled === true && match.approvalStatus === 'APPROVED') {
      return { configId: String(match.id), owned: false };
    }
    throw new Error(
      `a BANK_TRANSFER method already exists for this market in state ${String(match.approvalStatus)}/enabled=${String(match.enabled)}; finish or remove it before running this journey`,
    );
  }

  const config = await maker.call('POST', '/super-admin/billing/payment-methods', {
    marketId: offer.marketId,
    currency: offer.currency,
    methodKey: 'BANK_TRANSFER',
    displayName: `QA bank transfer ${TAG}`,
  });
  if (config.status !== 201) throw new Error(`payment method create failed: ${config.status} ${config.message}`);
  const configId = String(config.body.id);

  const account = await maker.call('POST', `/super-admin/billing/payment-methods/${configId}/accounts`, {
    bankName: `QA Test Bank ${TAG}`,
    accountTitle: `QA Test Co ${TAG}`,
    accountNumber: '0000111122',
    paymentInstructions: 'SYNTHETIC TEST ACCOUNT. Do not send money.',
    receiptContactEmail: `receipts-${TAG}@example.test`,
  });
  if (account.status !== 201) throw new Error(`receiving account create failed: ${account.status} ${account.message}`);
  const accountId = String(account.body.id);

  // The two-person rule, exercised: the maker is refused before the checker succeeds.
  const own = await maker.call('POST', `/super-admin/billing/receiving-accounts/${accountId}/approve`, {});
  if (own.status < 400) throw new Error('the maker approved their own receiving account: the two-person rule is broken');

  for (const step of [
    () => checker.call('POST', `/super-admin/billing/receiving-accounts/${accountId}/approve`, {}),
    () => checker.call('POST', `/super-admin/billing/receiving-accounts/${accountId}/activate`, {}),
    () => checker.call('PATCH', `/super-admin/billing/payment-methods/${configId}/approval`, { status: 'APPROVED' }),
    () => checker.call('PATCH', `/super-admin/billing/payment-methods/${configId}/enabled`, { enabled: true }),
  ]) {
    const result = await step();
    if (result.status >= 400) throw new Error(`bank method setup step failed: ${result.status} ${result.message}`);
  }
  return { configId, owned: true };
}

/* --------------------------------------------------------------- the buyer */

export type Buyer = { company: string; slug: string; email: string; owner: string };

export function newBuyer(label: string): Buyer {
  const key = `${TAG}${label}`.toLowerCase();
  return {
    company: `QA Co ${TAG} ${label}`,
    slug: `qa-${key}`.slice(0, 30),
    email: `qa-${key}@example.test`,
    owner: 'Ada Lovelace',
  };
}

/** Typing into a field that hydrates late: retry until the value sticks. */
export async function fillStable(field: ReturnType<Page['getByLabel']>, value: string) {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** The six-digit code, read the way a person reads their inbox. The server still checks its hash. */
export async function verificationEmail(email: string): Promise<{ orderId: string; code: string }> {
  let found: { orderId: string; code: string } | null = null;
  await expect
    .poll(
      async () => {
        found = await withDatabase(async (client) => {
          const row = (
            await client.query(
              `select "entityId", "htmlBody" from "PlatformOutboundEmail"
                where "eventCode" = 'ONBOARDING_EMAIL_VERIFICATION' and recipient = $1
                order by "createdAt" desc limit 1`,
              [email],
            )
          ).rows[0] as { entityId: string; htmlBody: string } | undefined;
          const code = row?.htmlBody.match(/<strong>(\d{4,8})<\/strong>/)?.[1];
          return row && code ? { orderId: row.entityId, code } : null;
        });
        return found !== null;
      },
      { message: 'the verification email should be recorded', timeout: 30_000 },
    )
    .toBe(true);
  return found!;
}

/**
 * Landing: pricing -> Growth -> five-step wizard -> verification email. Stops on
 * the "Confirm your email" screen and returns the order id and the code.
 */
export async function runWizardToVerification(page: Page, buyer: Buyer) {
  await page.goto(`${TARGET.landing}/plans`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /start with growth/i }).first().click();
  await expect(page).toHaveURL(/\/subscribe\?plan=growth/);
  const main = page.locator('main');

  await fillStable(page.getByLabel(/company name/i).first(), buyer.company);
  await expect(main).toContainText('Bank transfer / Raast');
  await page.getByLabel(/country/i).first().selectOption({ label: 'Pakistan' });
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(main).toContainText('Step 2 of 5');
  await fillStable(page.getByLabel('Workspace address'), buyer.slug);
  await expect(main).toContainText(/is available/i);
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(main).toContainText('Step 3 of 5');
  const [first, ...rest] = buyer.owner.split(' ');
  await fillStable(page.getByLabel('First name'), first);
  await fillStable(page.getByLabel('Last name'), rest.join(' '));
  await fillStable(page.getByLabel('Work email'), buyer.email);
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(main).toContainText('Step 4 of 5');
  for (const box of await page.locator('main input[type=checkbox]').all()) await box.check();
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(main).toContainText('Step 5 of 5');
  await expect(main).toContainText(buyer.company);
  await page.getByRole('button', { name: /confirm and verify email/i }).click();
  await expect(main).toContainText(/confirm your email/i);
  return verificationEmail(buyer.email);
}

/** The full purchase up to the bank invoice, in the browser. */
export async function buyGrowthToInvoice(page: Page, buyer: Buyer) {
  const { orderId, code } = await runWizardToVerification(page, buyer);
  await page.getByLabel(/verification code/i).fill(code);
  await page.getByRole('button', { name: /confirm and continue to payment/i }).click();
  await page.waitForURL(/\/subscribe\/bank-transfer\?onboarding=/, { timeout: 45_000 });
  await expect(page.locator('main')).toContainText('Awaiting your transfer');
  const reference = (await page.locator('main').innerText()).match(/DP-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] ?? '';
  expect(reference, 'the invoice should show a payment reference').not.toBe('');
  return { orderId, reference };
}

/** "I have paid": a synthetic reference and a synthetic receipt file. */
export async function submitClaimInBrowser(page: Page, txnReference: string) {
  await fillStable(page.getByLabel(/transaction reference/i), txnReference);
  await page.getByLabel(/^note/i).fill(`synthetic claim ${TAG}`);
  await page
    .locator('input[name=evidence]')
    .setInputFiles({ name: `receipt-${TAG}.png`, mimeType: 'image/png', buffer: SYNTHETIC_RECEIPT });
  await page.getByRole('button', { name: 'I have paid' }).click();
  await expect(page.locator('main')).toContainText('Pending verification');
}

/* ------------------------------------------------------------- admin console */

export async function signInToAdminAs(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URLS.admin}/login`);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await fillStable(page.getByLabel('Email').first(), email);
  await fillStable(page.getByLabel('Password').first(), password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
}

/** Open the verification dialog for a company's claim. */
export async function openClaimDialog(page: Page, company: string) {
  await page.goto(`${BASE_URLS.admin}/billing?tab=bank-transfers`, { waitUntil: 'domcontentloaded' });
  const row = page.getByRole('row').filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(company);
  return dialog;
}

export async function approveInDialog(dialog: ReturnType<Page['getByRole']>, statementRef: string, clicks = 1) {
  await fillStable(dialog.getByLabel(/bank statement reference/i), statementRef);
  await dialog.getByRole('checkbox').check();
  const button = dialog.getByRole('button', { name: 'Approve and activate' });
  if (clicks > 1) await button.dblclick();
  else await button.click();
}

export async function rejectInDialog(dialog: ReturnType<Page['getByRole']>, reason: string) {
  await dialog.getByRole('tab', { name: 'Reject' }).click();
  await fillStable(dialog.getByLabel(/reason/i), reason);
  await dialog.getByRole('button', { name: 'Reject claim' }).click();
}

/* ---------------------------------------------------------- tenant sign-in */

export const OWNER_PASSWORD = `Qa!Activate-${TAG}-7`;

export async function attemptTenantLogin(page: Page, slug: string, email: string, password: string) {
  await page.goto(tenantUrl(BASE_URLS.web, slug), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await fillStable(page.getByLabel(/email/i).first(), email);
  await fillStable(page.getByLabel(/password/i).first(), password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
}

/* --------------------------------------------------------- persisted reads */

export type OrderState = {
  status: string;
  tenantId: string | null;
  subscriptionId: string | null;
  totalAmount: string;
  claims: Array<{ id: string; status: string }>;
};

export async function orderState(orderId: string): Promise<OrderState> {
  const state = await withDatabase(async (client) => {
    const order = (
      await client.query(
        `select status, "tenantId", "subscriptionId", "totalAmount" from "SubscriptionOrder" where id = $1`,
        [orderId],
      )
    ).rows[0] as Omit<OrderState, 'claims'>;
    const claims = (
      await client.query(
        `select id, status from "BankTransferClaim" where "subscriptionOrderId" = $1 order by "submittedAt"`,
        [orderId],
      )
    ).rows as OrderState['claims'];
    return { ...order, claims };
  });
  return state!;
}

/** Wait until provisioning has finished for the order and return the tenant it created. */
export async function awaitProvisioned(orderId: string) {
  await expect
    .poll(
      async () => {
        const state = await orderState(orderId);
        if (!state.tenantId) return state.status;
        const tenant = await withDatabase(async (client) => {
          const row = (
            await client.query(`select status, "readinessStatus" from "Tenant" where id = $1`, [state.tenantId])
          ).rows[0] as { status: string; readinessStatus: string } | undefined;
          return row ? `${state.status}/${row.status}/${row.readinessStatus}` : state.status;
        });
        return tenant;
      },
      { message: 'provisioning should finish: order ACTIVATED, tenant ACTIVE and READY', timeout: 120_000, intervals: [2_000] },
    )
    .toBe('ACTIVATED/ACTIVE/READY')
    .catch(async (error: unknown) => {
      // The status string alone cannot say why a handler kept retrying. The
      // consumption row holds the exception, so a CI-only failure is diagnosable
      // from the log instead of needing a second run.
      const why = await withDatabase(async (client) =>
        (
          await client.query(
            `select e."eventType", e.status, e."attemptCount", left(e."lastError", 700) as "lastError"
               from "OutboxEvent" e
              where e."aggregateId" = $1 or e.payload::text like $2
              order by e."createdAt"`,
            [orderId, `%${orderId}%`],
          )
        ).rows,
      );
      throw new Error(`${(error as Error).message}
outbox events: ${JSON.stringify(why)}`);
    });
  return orderState(orderId);
}

export async function scalar<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await withDatabase(async (client) => (await client.query(sql, params)).rows[0] as Record<string, T>);
  return Object.values(result ?? {})[0] as T;
}

/* ------------------------------------------------------------------ cleanup */

const like = `%${TAG}%`;

/** Delete rows, first deleting whatever still references them (FKs without ON DELETE CASCADE). */
async function purge(client: Client, table: string, where: string, params: unknown[], depth = 0): Promise<number> {
  if (depth > 12) throw new Error(`purge of ${table} is nested too deep`);
  for (let attempt = 0; attempt < 400; attempt++) {
    try {
      return (await client.query(`delete from "${table}" where ${where}`, params)).rowCount ?? 0;
    } catch (error) {
      const failure = error as { code?: string; detail?: string; table?: string; constraint?: string };
      if (!['23503', '23001'].includes(failure.code ?? '') || !failure.table || !failure.constraint) throw error;
      const key = /Key \(.+?\)=\((.+?)\) is (?:still )?referenced/.exec(failure.detail ?? '')?.[1];
      const column = (
        await client.query(
          `select a.attname from pg_constraint c
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
            where c.conname = $1 and c.conrelid = format('%I', $2::text)::regclass`,
          [failure.constraint, failure.table],
        )
      ).rows[0]?.attname as string | undefined;
      if (!key || !column) throw error;
      await purge(client, failure.table, `"${column}" = $1`, [key], depth + 1);
    }
  }
  throw new Error(`purge of ${table} did not converge`);
}

/*
 * $1 is the run tag pattern; $2 is every id this run created (customers, orders,
 * claims, tenants, operators, payment methods, accounts). Append-only platform
 * tables (audit, events, outbox, error log) name rows by id rather than by tag,
 * so the ids found before deletion are what removes them afterwards.
 */
const ROOTS: Array<{ table: string; where: string }> = [
  { table: 'Tenant', where: `name like $1` },
  {
    table: 'SubscriptionOrder',
    where: `"customerAccountId" in (select id from "CustomerAccount" where "companyName" like $1)`,
  },
  { table: 'BankTransferClaim', where: `"customerNote" like $1` },
  { table: 'CustomerAccount', where: `"companyName" like $1` },
  { table: 'Lead', where: `"companyName" like $1` },
  { table: 'PlatformOutboundEmail', where: `recipient like $1` },
  { table: 'EmailDeliveryLog', where: `recipient like $1` },
  { table: 'PaymentMethodConfiguration', where: `"displayName" like $1` },
  { table: 'BankReceivingAccount', where: `"bankName" like $1` },
  { table: 'Identity', where: `email like $1` },
  { table: 'PlatformUser', where: `email like $1` },
  {
    table: 'OutboxEvent',
    where: `payload::text like $1 or "aggregateId" = any($2) or "customerAccountId" = any($2) or "tenantId" = any($2)`,
  },
  {
    table: 'PlatformAuditLog',
    where: `"afterSnapshot"::text like $1 or "beforeSnapshot"::text like $1 or "entityId" = any($2)`,
  },
  {
    table: 'AuditLog',
    where: `"afterSnapshot"::text like $1 or "beforeSnapshot"::text like $1 or "entityId" = any($2)`,
  },
  {
    table: 'PlatformEvent',
    where: `$1::text is not null and ("entityId" = any($2) or "customerAccountId" = any($2) or "tenantId" = any($2))`,
  },
  {
    table: 'ErrorLog',
    where: `"tenantId" = any($2) or message like $1 or path like $1 or exists (select 1 from unnest($2::text[]) i where path like '%' || i || '%')`,
  },
];

let createdIds: string[] = [];

/** A prepared statement must be given exactly the parameters it mentions. */
const paramsFor = (where: string, ids: string[]) => (where.includes('$2') ? [like, ids] : [like]);

/** Every id this run created that an append-only table may name. Read before anything is deleted. */
async function collectIds(client: Client): Promise<string[]> {
  const ids = new Set<string>(createdIds);
  const queries = [
    `select id from "CustomerAccount" where "companyName" like $1`,
    `select o.id from "SubscriptionOrder" o join "CustomerAccount" c on c.id = o."customerAccountId" where c."companyName" like $1`,
    `select o."tenantId" as id from "SubscriptionOrder" o join "CustomerAccount" c on c.id = o."customerAccountId" where c."companyName" like $1 and o."tenantId" is not null`,
    `select b.id from "BankTransferClaim" b join "SubscriptionOrder" o on o.id = b."subscriptionOrderId" join "CustomerAccount" c on c.id = o."customerAccountId" where c."companyName" like $1`,
    `select id from "Tenant" where name like $1`,
    `select id from "PlatformUser" where email like $1`,
    `select id from "PaymentMethodConfiguration" where "displayName" like $1`,
    `select id from "BankReceivingAccount" where "bankName" like $1`,
    `select id from "CustomerOnboarding" where "customerId" in (select id from "CustomerAccount" where "companyName" like $1)`,
  ];
  for (const sql of queries) {
    for (const row of (await client.query(sql, [like])).rows) ids.add(String(row.id));
  }
  createdIds = [...ids];
  return createdIds;
}

/** Remove exactly what this run created, found by RUN_TAG and the ids that tag led to. */
export async function cleanTagged(): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  await withDatabase(async (client) => {
    const ids = await collectIds(client);
    for (const root of ROOTS) {
      const count = await purge(client, root.table, root.where, paramsFor(root.where, ids));
      if (count) removed[root.table] = count;
    }
  });
  return removed;
}

/** What is still tagged, or still named by an id this run created. Anything but `{}` is residue. */
export async function taggedResidue(): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  await withDatabase(async (client) => {
    for (const root of ROOTS) {
      const n = (
        await client.query(`select count(*)::int as n from "${root.table}" where ${root.where}`, paramsFor(root.where, createdIds))
      ).rows[0].n as number;
      if (n > 0) left[root.table] = n;
    }
    const users = (await client.query(`select count(*)::int as n from "User" where email like $1`, [like])).rows[0].n as number;
    if (users > 0) left.User = users;
  });
  return left;
}
