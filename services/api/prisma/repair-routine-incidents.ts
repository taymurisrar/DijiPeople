import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { NOT_AN_INCIDENT } from '../src/modules/error-logs/expected-protocol-outcome';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Take the non-incidents out of the triage queue.
 *
 * BUG-1754. The queue held 1,588 rows waiting for a human and the newest pages
 * were almost entirely `401`s from ordinary session expiry and `404`s for
 * routes that do not exist. Neither is something anyone should pick up, and
 * together they buried the genuine signal — including eleven critical items
 * nobody had touched.
 *
 * The ingest path no longer files these as `NEW`. This repairs what was written
 * before that, which is the only reason it exists: it is a one-off for rows
 * already in the database, not a routine.
 *
 * **What it does not do.** It does not delete anything. Support still needs to
 * answer "why was I signed out", so the rows keep every field they had and only
 * their `supportStatus` changes, from `NEW` to `NOT_AN_INCIDENT`. They remain
 * searchable and remain in the All view.
 *
 * **What it deliberately leaves alone:**
 *
 *   - Anything a human has already touched. Only `NEW` rows are moved — if
 *     somebody assigned, investigated or resolved one, that judgement stands
 *     and is not overwritten by a heuristic.
 *   - Every `400`. The record proposing this fix suggested sweeping client
 *     validation rejections too, and that is the dangerous one: BUG-1742 — no
 *     lead could be created from Platform Admin, for anyone, in production —
 *     presented as exactly that, a 400 saying `partnerId must be a UUID`.
 *   - Any `404` naming a record rather than a route. Same status code,
 *     different event: a missing record may be a broken link.
 *
 * Safe to run repeatedly. A queue already clean produces no writes.
 *
 *   npm --workspace api run repair:routine-incidents
 *   npm --workspace api run repair:routine-incidents -- --dry-run
 */

/** 401 codes that mean "not signed in", rather than "something went wrong". */
const SESSION_AUTH_CODES = [
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_UNAUTHORIZED',
  'SESSION_EXPIRED',
];

async function runRepairRoutineIncidents() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = createPrismaClient();

  try {
    /*
     * Matched the same way the filter decides it live: Nest answers an unrouted
     * request with `Cannot GET /path`, and a domain 404 carries a catalog code
     * and a written message instead.
     */
    const criteria = {
      supportStatus: 'NEW',
      OR: [
        { statusCode: 401, errorCode: { in: SESSION_AUTH_CODES } },
        { statusCode: 404, message: { startsWith: 'Cannot ' } },
      ],
    };

    const candidates = await prisma.errorLog.findMany({
      where: criteria,
      select: { statusCode: true, errorCode: true },
    });

    if (!candidates.length) {
      console.log('Triage queue holds no routine protocol outcomes.');
      return;
    }

    const byKind = new Map<string, number>();
    for (const row of candidates) {
      const kind = `${row.statusCode} ${row.errorCode}`;
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }

    console.log(
      `${candidates.length} row(s) in the triage queue are routine protocol outcomes:`,
    );
    for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)}  ${kind}`);
    }

    if (dryRun) {
      console.log('\n--dry-run: nothing was written.');
      return;
    }

    const { count } = await prisma.errorLog.updateMany({
      where: criteria,
      data: { supportStatus: NOT_AN_INCIDENT },
    });

    console.log(
      `\n${count} row(s) moved from NEW to ${NOT_AN_INCIDENT}. ` +
        'They remain searchable; they are no longer queued for triage.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void runRepairRoutineIncidents().catch((error) => {
  console.error(error);
  process.exit(1);
});
