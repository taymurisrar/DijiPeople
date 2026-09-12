import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import {
  ENTITLEMENT_ENFORCEMENT_MODES,
  ENTITLEMENT_SETTING_FIELD,
  ENTITLEMENT_SETTING_KEY,
  parseEnforcementMode,
  type EntitlementEnforcementMode,
} from '../src/common/security/tenant-entitlement.service';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Flip `TenantEntitlementService`'s enforcement posture — BUG-3350.
 *
 * This is deliberately NOT a change to `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE`
 * or to `prisma/seed-config.ts`'s shipped `module-settings` defaults. Either
 * of those would silently flip production the next time anyone ran
 * `npm run release:api` — `seed:config` runs on every release, and its merge
 * only preserves a key the target database already has, so a fresh field in
 * the shipped default becomes live for every environment that has never set
 * it. The BUG-3350 ADR is explicit that this cutover is a deliberate,
 * reviewed act on one environment at a time, not a deploy side effect.
 *
 * This script is that deliberate act: it writes the `module-settings`
 * `PlatformSetting` row directly, merging only the `entitlementEnforcement`
 * field so nothing else in that row is disturbed. Idempotent — running it
 * twice with the same mode is a no-op after the first write, and reading the
 * current mode never fails even if the row does not exist yet.
 *
 * `TenantEntitlementService.mode()` re-reads this row with a 60s TTL, so the
 * change reaches every request within a minute — no restart required.
 *
 * Usage:
 *   npm run entitlement:set-mode -- ENFORCE
 *   npm run entitlement:set-mode -- REPORT_ONLY   (the reversal)
 *   npm run entitlement:set-mode                  (reports the current mode)
 */
/**
 * Host and database name only, never credentials — the same rule
 * `grandfather-entitlement-overrides.ts` follows, so whoever runs this with a
 * mode argument sees which database is about to change before it does.
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

async function setEntitlementEnforcement() {
  const requested = process.argv[2]?.trim().toUpperCase();
  console.log(`Target database: ${describeTargetDatabase()}`);
  const prisma = createPrismaClient();

  try {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: ENTITLEMENT_SETTING_KEY },
    });
    const currentMode = parseEnforcementMode(existing?.value);

    if (!requested) {
      console.log(`Current entitlement enforcement mode: ${currentMode}`);
      console.log(
        `Pass a mode to change it: ${ENTITLEMENT_ENFORCEMENT_MODES.join(' | ')}`,
      );
      return;
    }

    if (
      !(ENTITLEMENT_ENFORCEMENT_MODES as readonly string[]).includes(requested)
    ) {
      throw new Error(
        `Unknown mode "${requested}". Valid modes: ${ENTITLEMENT_ENFORCEMENT_MODES.join(', ')}`,
      );
    }
    const targetMode = requested as EntitlementEnforcementMode;

    if (currentMode === targetMode) {
      console.log(
        `Entitlement enforcement is already ${targetMode}. No change made.`,
      );
      return;
    }

    const existingValue =
      existing?.value &&
      typeof existing.value === 'object' &&
      !Array.isArray(existing.value)
        ? (existing.value as Record<string, unknown>)
        : {};

    await prisma.platformSetting.upsert({
      where: { key: ENTITLEMENT_SETTING_KEY },
      create: {
        key: ENTITLEMENT_SETTING_KEY,
        value: { ...existingValue, [ENTITLEMENT_SETTING_FIELD]: targetMode },
      },
      update: {
        value: { ...existingValue, [ENTITLEMENT_SETTING_FIELD]: targetMode },
      },
    });

    console.log(
      `Entitlement enforcement changed: ${currentMode} -> ${targetMode}.`,
    );
    if (targetMode === 'ENFORCE') {
      console.log(
        'Run prisma/grandfather-entitlement-overrides.ts FIRST if this has not ' +
          'already been done on this database — otherwise every tenant using a ' +
          'module outside its plan loses access immediately.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setEntitlementEnforcement().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { setEntitlementEnforcement };
