#!/usr/bin/env node
/**
 * Put a seeded demo tenant on the Growth plan with entitlement enforcement ON.
 *
 * `seed-demo` creates a tenant with no subscription and the platform's
 * enforcement posture at REPORT_ONLY, so every module is reachable and a
 * "Growth tenant is refused payroll" assertion would pass or fail by accident.
 * Production runs ENFORCE. The Growth workflow flows (M, N) need the same
 * posture, and this makes it explicit and repeatable rather than a thing one
 * developer did by hand once.
 *
 * Idempotent: replaces the tenant's subscription, merges one field into
 * `module-settings`, touches nothing else. Refuses a database that is not a
 * disposable local one (`*_test` or `*_e2e*` on localhost / CI), because it
 * writes a subscription row.
 *
 *   E2E_DATABASE_URL=... E2E_TENANT_SLUG=dijipeople-demo node e2e/tools/prepare-growth-tenant.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
const slug = process.env.E2E_TENANT_SLUG?.trim() || 'dijipeople-demo';
if (!url) {
  console.error('E2E_DATABASE_URL (or DATABASE_URL) is required.');
  process.exit(2);
}
const name = new URL(url).pathname.replace(/^\//, '');
const host = new URL(url).hostname;
if (!/(_test|_e2e)/i.test(name) || !['localhost', '127.0.0.1'].includes(host)) {
  console.error(
    `Refusing to write a subscription to "${name}" on "${host}": not a disposable local test database.`,
  );
  process.exit(2);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const tenant = (
    await client.query('select id from "Tenant" where slug = $1', [slug])
  ).rows[0];
  if (!tenant) throw new Error(`no tenant with slug "${slug}"`);
  const plan = (
    await client.query(`select id from "Plan" where key = 'growth'`)
  ).rows[0];
  if (!plan) throw new Error('no "growth" plan — run seed:config first');

  await client.query('begin');
  await client.query('delete from "Subscription" where "tenantId" = $1', [
    tenant.id,
  ]);
  await client.query(
    `insert into "Subscription"
       (id, "tenantId", "planId", "billingCycle", "basePrice", "finalPrice",
        currency, status, "startDate", "purchasedSeats", "updatedAt")
     values (gen_random_uuid(), $1, $2, 'MONTHLY', 165, 165, 'USD', 'ACTIVE',
             now(), 25, now())`,
    [tenant.id, plan.id],
  );
  const updated = await client.query(
    `update "PlatformSetting"
        set value = jsonb_set(value::jsonb, '{entitlementEnforcement}', '"ENFORCE"')
      where key = 'module-settings'`,
  );
  if (updated.rowCount === 0)
    throw new Error('no module-settings row — run seed:config first');
  await client.query('commit');
  console.log(`tenant "${slug}" is on Growth with entitlement enforcement ENFORCE`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
