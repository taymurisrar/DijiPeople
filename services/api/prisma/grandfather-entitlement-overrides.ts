import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { TenantFeatureSource } from '@prisma/client';
import { createPrismaClient } from './create-prisma-client';
import { isSubscriptionLive } from '../src/common/security/tenant-entitlement.rule';
import {
  ENTITLEMENT_GATED_MODULES,
  type TenantFeatureKey,
} from '../src/common/constants/tenant-features';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Grandfather every tenant actively using a module its plan does not sell —
 * BUG-3350, the recommended route (2) in the record's Proposed Resolution.
 *
 * The whole point of switching `TenantEntitlementService` enforcement from
 * `REPORT_ONLY` to `ENFORCE` (`set-entitlement-enforcement.ts`) without
 * cutting anybody off by accident. Run this FIRST, on the target database,
 * before flipping enforcement on that same database.
 *
 * WHY THE ORDINARY OVERRIDE MECHANISM COULD NOT BE REUSED AS-IS.
 * `TenantModulesService.update()` (the settings-admin write path) and
 * `resolveTenantFeatureState()` both deliberately refuse to let a tenant
 * override grant what the plan does not sell — that is the safety property
 * the ordinary path relies on, and it must stay true for it. Grandfathering
 * is the one legitimate exception: it exists only to carry a tenant across
 * *this* cutover. So this script writes `TenantFeature` rows with
 * `source: CUSTOM` directly via Prisma, bypassing `TenantModulesService`
 * entirely, and `resolveTenantFeatureState` treats a `CUSTOM` override (and
 * only that source) as authoritative regardless of plan — see
 * `common/security/tenant-entitlement.rule.ts`. A `MANUAL` override (the
 * settings-admin path) still cannot grant beyond the plan.
 *
 * WHAT "ACTIVELY USING" MEANS HERE. Not "the plan should have sold it" — this
 * script has no opinion on that, and changing what a plan sells is a pricing
 * decision, not a migration. It means: the tenant has a live subscription
 * whose plan excludes the feature key, AND at least one row exists in that
 * module's data for this tenant. A tenant with zero payroll cycles on a plan
 * that excludes Payroll is not "using" it; enforcement is correct to refuse
 * it, and this script leaves it alone.
 *
 * IDEMPOTENT. Upserts on `(tenantId, key)`; running it twice, or against a
 * database that already has some of these rows, changes nothing the second
 * time. Safe to re-run after new tenants sign up, before a later enforcement
 * review.
 *
 * SAFE BY DEFAULT. Reports what it WOULD do and writes nothing unless called
 * with `--apply`. Never run against production without first reading the
 * dry-run report.
 *
 * Usage:
 *   npm run entitlement:grandfather                (dry run, the default)
 *   npm run entitlement:grandfather -- --apply      (writes the overrides)
 */

type UsageProbe = (
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
) => Promise<number>;

/**
 * One representative table per gated module, scoped to the tenant. Not an
 * exhaustive list of every table a module owns — a single row is enough to
 * prove the tenant has touched the module at all, which is all this decision
 * needs.
 */
const USAGE_PROBES: Partial<Record<TenantFeatureKey, UsageProbe>> = {
  payroll: (prisma, tenantId) =>
    prisma.payrollCycle.count({ where: { tenantId } }),
  timesheets: (prisma, tenantId) =>
    prisma.timesheet.count({ where: { tenantId } }),
  projects: (prisma, tenantId) => prisma.project.count({ where: { tenantId } }),
  recruitment: (prisma, tenantId) =>
    prisma.jobOpening.count({ where: { tenantId } }),
  onboarding: (prisma, tenantId) =>
    prisma.employeeOnboarding.count({ where: { tenantId } }),
  leave: (prisma, tenantId) =>
    prisma.leaveRequest.count({ where: { tenantId } }),
  attendance: (prisma, tenantId) =>
    prisma.attendanceEntry.count({ where: { tenantId } }),
};

/** The gated feature keys this script knows how to measure, deduplicated. */
const GATED_FEATURE_KEYS = Array.from(
  new Set(Object.values(ENTITLEMENT_GATED_MODULES)),
);

/**
 * The host and database name only — never the credentials — so whoever runs
 * this with `--apply` sees which database they are about to write to before
 * anything happens. `DATABASE_URL` is otherwise never logged anywhere in this
 * repository, and that rule holds here too.
 */
function describeTargetDatabase(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return '(DATABASE_URL not set)';
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(DATABASE_URL could not be parsed)';
  }
}

async function grandfatherEntitlementOverrides() {
  const apply = process.argv.includes('--apply');
  const target = describeTargetDatabase();
  console.log(`Target database: ${target}`);
  if (apply) {
    console.log(
      'Running with --apply: TenantFeature rows WILL be written to the database above.',
    );
  }
  const prisma = createPrismaClient();

  try {
    const subscriptions = await prisma.subscription.findMany({
      select: {
        tenantId: true,
        status: true,
        tenant: { select: { slug: true } },
        plan: {
          select: { key: true, features: true },
        },
      },
    });

    const existingOverrides = await prisma.tenantFeature.findMany({
      select: { tenantId: true, key: true, source: true, isEnabled: true },
    });
    const existingByTenantAndKey = new Map(
      existingOverrides.map((row) => [`${row.tenantId}:${row.key}`, row]),
    );

    const toGrant: Array<{
      tenantId: string;
      tenantSlug: string;
      planKey: string;
      key: TenantFeatureKey;
      usageCount: number;
    }> = [];
    const alreadyGranted: typeof toGrant = [];

    for (const subscription of subscriptions) {
      if (!isSubscriptionLive(subscription.status)) continue;

      const planFeatureByKey = new Map(
        subscription.plan.features.map((feature) => [
          feature.featureKey,
          feature.isEnabled,
        ]),
      );

      for (const key of GATED_FEATURE_KEYS) {
        const isIncludedInPlan = planFeatureByKey.get(key) ?? false;
        if (isIncludedInPlan) continue;

        const probe = USAGE_PROBES[key];
        if (!probe) continue;

        const usageCount = await probe(prisma, subscription.tenantId);
        if (usageCount === 0) continue;

        const existing = existingByTenantAndKey.get(
          `${subscription.tenantId}:${key}`,
        );
        const entry = {
          tenantId: subscription.tenantId,
          tenantSlug: subscription.tenant.slug,
          planKey: subscription.plan.key,
          key,
          usageCount,
        };

        if (
          existing?.source === TenantFeatureSource.CUSTOM &&
          existing.isEnabled
        ) {
          alreadyGranted.push(entry);
        } else if (existing && existing.source !== TenantFeatureSource.CUSTOM) {
          /*
           * A MANUAL override already sits on this (tenant, key) pair — most
           * likely `isEnabled: false`, since `TenantModulesService.update()`
           * would have refused a MANUAL `true` beyond the plan. Overwriting an
           * operator's explicit MANUAL decision is not this script's call to
           * make; it reports the conflict instead of resolving it.
           */
          console.warn(
            `SKIPPED tenant=${subscription.tenantId} (${subscription.tenant.slug}) ` +
              `key=${key}: a MANUAL override already exists ` +
              `(isEnabled=${existing.isEnabled}). Resolve by hand.`,
          );
        } else {
          toGrant.push(entry);
        }
      }
    }

    console.log(
      `Checked ${subscriptions.length} subscription(s) across ${GATED_FEATURE_KEYS.length} gated feature key(s).`,
    );
    console.log(`Already grandfathered: ${alreadyGranted.length}`);
    for (const entry of alreadyGranted) {
      console.log(
        `  = tenant=${entry.tenantId} (${entry.tenantSlug}) plan=${entry.planKey} key=${entry.key} usage=${entry.usageCount}`,
      );
    }
    console.log(`${apply ? 'Granting' : 'Would grant'}: ${toGrant.length}`);
    for (const entry of toGrant) {
      console.log(
        `  + tenant=${entry.tenantId} (${entry.tenantSlug}) plan=${entry.planKey} key=${entry.key} usage=${entry.usageCount}`,
      );
    }

    if (!apply) {
      console.log(
        '\nDry run only — nothing was written. Re-run with --apply to write these overrides.',
      );
      return;
    }

    for (const entry of toGrant) {
      await prisma.tenantFeature.upsert({
        where: { tenantId_key: { tenantId: entry.tenantId, key: entry.key } },
        create: {
          tenantId: entry.tenantId,
          key: entry.key,
          isEnabled: true,
          source: TenantFeatureSource.CUSTOM,
        },
        update: {
          isEnabled: true,
          source: TenantFeatureSource.CUSTOM,
        },
      });
    }
    console.log(`\nWrote ${toGrant.length} grandfather override(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  grandfatherEntitlementOverrides().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { grandfatherEntitlementOverrides, GATED_FEATURE_KEYS, USAGE_PROBES };
