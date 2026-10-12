import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import {
  applyOwnerNameRepair,
  planOwnerNameRepair,
} from '../src/modules/super-admin/owner-name-repair';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Clear the "Owner" / "Workspace" placeholder names provisioning used to write
 * on workspace owners (BUG-4111). See `owner-name-repair.ts` for exactly which
 * users qualify — a real person surnamed Owner does not.
 *
 * Dry run by default; prints every decision. Pass `--apply` to write. Each
 * change is audited (`USER_PLACEHOLDER_NAME_REPAIRED`) and the script is safe
 * to run repeatedly.
 *
 *   npm --workspace api run repair:owner-names            # dry run
 *   npm --workspace api run repair:owner-names -- --apply
 */
async function runRepairOwnerNames() {
  const apply = process.argv.includes('--apply');
  const prisma = createPrismaClient();
  try {
    const decisions = await planOwnerNameRepair(prisma);
    const fixable = decisions.filter((item) => item.after);
    console.log(
      `${decisions.length} owner(s) carry a placeholder word; ${fixable.length} provably a placeholder.`,
    );
    for (const item of decisions) {
      const from = `${item.before.firstName} ${item.before.lastName}`.trim();
      const to = item.after
        ? `${item.after.firstName} ${item.after.lastName}`.trim()
        : '(unchanged)';
      // Ids, not emails: the output may be pasted into a ticket.
      console.log(`  ${item.userId}  "${from}" -> "${to}"  — ${item.reason}`);
    }
    if (!apply) {
      console.log('Dry run — nothing written. Re-run with --apply to repair.');
      return;
    }
    const repaired = await applyOwnerNameRepair(prisma, decisions);
    console.log(`Repaired ${repaired} user(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runRepairOwnerNames().catch((error) => {
    console.error('Owner name repair failed.', error);
    process.exitCode = 1;
  });
}

export { runRepairOwnerNames };
