import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { PlatformLifecycleService } from './platform-lifecycle.service';

/*
 * The legacy `enterprise-plus` plan is converted in place by migration
 * 20261102090000. A SQL file cannot be unit-run here, so these tests pin the
 * properties the conversion must keep (verified against real databases in the
 * handoff): it renames and never deletes, it leaves every contracted row alone,
 * and it stops instead of guessing.
 */
const migration = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20261102090000_plan_kind_and_custom_plan_metadata/migration.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const code = migration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('legacy enterprise-plus conversion migration', () => {
  it('converts in place: it renames the row and never deletes or re-creates a plan', () => {
    expect(code).not.toMatch(/DELETE\s+FROM\s+"Plan"/i);
    expect(code).not.toMatch(/INSERT\s+INTO\s+"Plan"/i);
    expect(code).toMatch(/SET "key" = new_key/);
    expect(code).toMatch(/WHERE "id" = legacy_id/);
  });

  it('gives the plan a neutral, id-derived key and name', () => {
    expect(code).toMatch(/'custom-' \|\| left\(replace\(legacy_id/);
    expect(code).toMatch(/'Custom Plan ' \|\|/);
  });

  it('keeps the old key only as provenance, not as an identity', () => {
    expect(code).toMatch(/convertedFromLegacyPlan/);
    // The only places the legacy key appears are the lookup and that provenance.
    const mentions = code.match(/enterprise-plus/g) ?? [];
    expect(mentions.length).toBeLessThanOrEqual(4);
  });

  it('never touches features, prices, subscriptions or their history', () => {
    for (const table of [
      'PlanFeature',
      'PlanPrice',
      'Subscription',
      'SubscriptionOrder',
      'TenantFeature',
      'Contract',
      'PlatformAuditLog',
    ]) {
      expect(code).not.toMatch(
        new RegExp(`(UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+"${table}"`, 'i'),
      );
    }
  });

  it('makes the plan custom-only and reserves it only when exactly one customer uses it', () => {
    expect(code).toMatch(/"salesModel" = 'CUSTOM_ONLY'/);
    expect(code).toMatch(
      /CASE WHEN customer_count = 1 THEN sole_customer ELSE NULL END/,
    );
    expect(code).toMatch(/'ARCHIVED'/);
  });

  it('stops with a specific message rather than overwrite a colliding key', () => {
    expect(code).toMatch(
      /RAISE EXCEPTION 'Cannot convert legacy plan enterprise-plus/,
    );
  });

  it('is a no-op when the legacy plan is absent (fresh and already-converted databases)', () => {
    expect(code).toMatch(/IF legacy_id IS NULL THEN\s+RETURN;/);
  });
});

describe('the catalogue after the conversion', () => {
  it('lists exactly Starter, Growth and Enterprise', () => {
    expect(DEFAULT_PLAN_DEFINITIONS.map((plan) => plan.key)).toEqual([
      'starter',
      'growth',
      'enterprise',
    ]);
  });

  it('no seed or catalogue source names the legacy plan', () => {
    const base = join(__dirname);
    for (const file of [
      'plans.catalog.ts',
      'markets.catalog.ts',
      'pricing.catalog.ts',
      'commercial-bootstrap.ts',
    ]) {
      const text = readFileSync(join(base, file), 'utf8');
      expect(text).not.toMatch(/['"`]enterprise-plus['"`]/);
    }
  });
});

describe('selecting a reserved or expired plan for a customer', () => {
  function service(plan: Record<string, unknown> | null) {
    const svc = Object.create(
      PlatformLifecycleService.prototype,
    ) as PlatformLifecycleService;
    (svc as unknown as { prisma: unknown }).prisma = {
      plan: { findUnique: jest.fn().mockResolvedValue(plan) },
    };
    return svc as unknown as {
      assertPlanSelectable: (
        planId: string | null | undefined,
        customerId: string | null,
      ) => Promise<void>;
    };
  }
  const reserved = {
    name: 'Custom Plan A1B2C3',
    eligibleCustomerAccountId: 'cust-1',
    effectiveFrom: null,
    effectiveUntil: null,
  };

  it('lets the reserved customer select it', async () => {
    await expect(
      service(reserved).assertPlanSelectable('p', 'cust-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses every other customer, and a customer that does not exist yet', async () => {
    await expect(
      service(reserved).assertPlanSelectable('p', 'cust-2'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service(reserved).assertPlanSelectable('p', null),
    ).rejects.toThrow(/reserved for another customer/);
  });

  it('refuses an expired plan for a new assignment', async () => {
    await expect(
      service({
        ...reserved,
        eligibleCustomerAccountId: null,
        effectiveUntil: new Date('2020-01-01T00:00:00Z'),
      }).assertPlanSelectable('p', 'cust-1'),
    ).rejects.toThrow(/expired/);
  });

  it('does nothing when no plan is being selected', async () => {
    await expect(
      service(null).assertPlanSelectable(undefined, 'cust-1'),
    ).resolves.toBeUndefined();
  });
});
