import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkforceSnapshotDerivation } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WorkforceSnapshotService } from '../src/modules/reporting/snapshot/workforce-snapshot.service';
import {
  addDays,
  daysBetweenInclusive,
} from '../src/modules/reporting/engine/period.engine';

/**
 * Reconstructs workforce history for a range of days, deliberately.
 *
 * NOTHING RUNS THIS FOR YOU, and nothing may: it is not wired into startup, not
 * into a migration and not into a seed. It writes one row per employee per day
 * across a range that can easily be years, and a reconstruction that starts
 * itself is a reconstruction nobody decided to do.
 *
 * WHAT IT CAN AND CANNOT KNOW. `Employee` keeps no history. The only historical
 * facts on the record are `hireDate` and `terminationDate`, so this script can
 * say who was employed on a given day and nothing else that changed since. It
 * places every employee in their CURRENT department, business unit, team,
 * location, manager and status, because that is all there is to place them in.
 * A reorg that happened last March is therefore projected backwards onto every
 * day before it.
 *
 * THAT IS WHY EVERY ROW IT WRITES IS `BACKFILLED`, and why it will never write
 * `OBSERVED` — not with a flag, not with an override. The column is what lets a
 * chart shade the reconstructed part of a line and tell a reader that the shape
 * before a certain date is an inference. A backfill that wrote `OBSERVED` would
 * destroy the only signal that distinguishes measurement from reconstruction,
 * and it would do so invisibly. For the same reason it never overwrites a row
 * the daily worker already captured; `WorkforceSnapshotService` enforces that.
 *
 * USAGE
 *   npm --workspace api run backfill:workforce-snapshots -- \
 *     --tenant <slug|id> --from 2025-01-01 --to 2025-12-31 --confirm
 *
 * OPTIONS
 *   --tenant <slug|id>  required; one tenant, never all of them
 *   --from <date>       inclusive first day, YYYY-MM-DD
 *   --to <date>         inclusive last day, YYYY-MM-DD
 *   --batch <n>         employees read per page (default 500)
 *   --max-days <n>      raise the range guard (default 1100)
 *   --dry-run           report what would happen and write nothing
 *   --confirm           required for any write
 *
 * START WITH --dry-run. It reports the same counts and touches nothing.
 *
 * RESTARTABLE. Every write is an upsert on
 * `(tenantId, snapshotDate, employeeId)`, so a run that is interrupted can be
 * re-issued with the same range and will converge on the same result rather
 * than duplicating anything.
 */
async function main(): Promise<number> {
  const logger = new Logger('WorkforceSnapshotBackfill');
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return 0;
  }

  const problems = validate(options);
  if (problems.length > 0) {
    for (const problem of problems) logger.error(problem);
    printUsage();
    return 2;
  }

  // The whole application, so the backfill uses exactly the service the running
  // system uses. A standalone script with its own Prisma client would be a
  // second implementation of the snapshot rules waiting to drift from the one
  // the daily worker runs.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const snapshots = app.get(WorkforceSnapshotService);

    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ id: options.tenant! }, { slug: options.tenant! }],
      },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      logger.error(`No tenant matches "${options.tenant}".`);
      return 2;
    }

    const days = daysBetweenInclusive(options.from!, options.to!);
    const maxDays = options.maxDays ?? DEFAULT_MAX_DAYS;
    if (days > maxDays) {
      logger.error(
        `The range spans ${days} days, above the ${maxDays}-day guard. Narrow it, or raise --max-days if you mean it.`,
      );
      return 2;
    }

    logger.log('');
    logger.log(
      `Workforce snapshot backfill${options.dryRun ? ' (dry run)' : ''}`,
    );
    logger.log(`  Tenant     ${tenant.name} (${tenant.slug})`);
    logger.log(`  Range      ${options.from} to ${options.to} (${days} days)`);
    logger.log(`  Derivation BACKFILLED — reconstructed, not observed`);
    logger.log('');

    const summary = {
      daysProcessed: 0,
      rowsWritten: 0,
      skippedObserved: 0,
      joiners: 0,
      leavers: 0,
      failedDays: [] as Array<{ date: string; reason: string }>,
    };

    for (
      let date = options.from!;
      date <= options.to!;
      date = addDays(date, 1)
    ) {
      try {
        const captured = await snapshots.captureDay({
          tenantId: tenant.id,
          snapshotDate: date,
          // Never configurable. See the header comment.
          derivation: WorkforceSnapshotDerivation.BACKFILLED,
          batchSize: options.batch,
          dryRun: options.dryRun,
        });

        summary.daysProcessed += 1;
        summary.rowsWritten += captured.written;
        summary.skippedObserved += captured.skippedObserved;
        summary.joiners += captured.joiners;
        summary.leavers += captured.leavers;

        // One line per day, so an interrupted run leaves a record of exactly
        // how far it got and can be resumed from there.
        logger.log(
          `  ${date}  employees=${captured.employeesConsidered} written=${captured.written} keptObserved=${captured.skippedObserved} joiners=${captured.joiners} leavers=${captured.leavers} ${captured.durationMs}ms`,
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'The day failed.';
        summary.failedDays.push({ date, reason });
        logger.warn(`  ${date}  FAILED: ${reason}`);
      }
    }

    logger.log('');
    logger.log(`Summary for ${tenant.slug}`);
    logger.log(`  Days processed   ${summary.daysProcessed}`);
    logger.log(`  Rows written     ${summary.rowsWritten}`);
    logger.log(`  Kept as observed ${summary.skippedObserved}`);
    logger.log(`  Joiners marked   ${summary.joiners}`);
    logger.log(`  Leavers marked   ${summary.leavers}`);
    logger.log(`  Days failed      ${summary.failedDays.length}`);

    if (summary.failedDays.length > 0) {
      logger.warn('');
      logger.warn('Failed days (first 50):');
      for (const failure of summary.failedDays.slice(0, 50)) {
        logger.warn(`  ${failure.date}: ${failure.reason}`);
      }
    }

    // A run with failures exits non-zero so a scripted invocation notices,
    // while the days it did complete still stand.
    return summary.failedDays.length > 0 ? 1 : 0;
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : 'The backfill could not run.',
    );
    return 1;
  } finally {
    await app.close();
  }
}

/** Roughly three years, matching the reporting engine's own period ceiling. */
const DEFAULT_MAX_DAYS = 1100;
const DEFAULT_BATCH = 500;

interface Options {
  tenant?: string;
  from?: string;
  to?: string;
  batch: number;
  maxDays?: number;
  dryRun: boolean;
  confirm: boolean;
  help: boolean;
}

function parseArguments(argv: readonly string[]): Options {
  const options: Options = {
    batch: DEFAULT_BATCH,
    dryRun: false,
    confirm: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    const next = () => argv[++index];

    switch (token) {
      case '--tenant':
        options.tenant = next();
        break;
      case '--from':
        options.from = next();
        break;
      case '--to':
        options.to = next();
        break;
      case '--batch':
        options.batch = Number(next());
        break;
      case '--max-days':
        options.maxDays = Number(next());
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--confirm':
        options.confirm = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function validate(options: Options): string[] {
  const problems: string[] = [];
  const isDate = (value?: string) =>
    Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

  // One tenant, always named. There is no "every tenant" mode: this writes
  // millions of rows and the blast radius of a typo should stop at one
  // workspace.
  if (!options.tenant) problems.push('--tenant <slug|id> is required.');
  if (!isDate(options.from))
    problems.push('--from must be a date, YYYY-MM-DD.');
  if (!isDate(options.to)) problems.push('--to must be a date, YYYY-MM-DD.');
  if (
    isDate(options.from) &&
    isDate(options.to) &&
    options.to! < options.from!
  ) {
    problems.push('--to must not be before --from.');
  }

  if (!Number.isFinite(options.batch) || options.batch <= 0) {
    problems.push('--batch must be a positive number.');
  }
  if (options.maxDays !== undefined && !Number.isFinite(options.maxDays)) {
    problems.push('--max-days must be a number.');
  }

  // A dry run writes nothing, so it needs no confirmation. Anything that
  // writes does.
  if (!options.confirm && !options.dryRun) {
    problems.push(
      '--confirm is required to write. Run with --dry-run first to see what would happen.',
    );
  }

  return problems;
}

function printUsage(): void {
  process.stdout.write(`
Reconstruct daily workforce snapshots for one tenant.

  npm --workspace api run backfill:workforce-snapshots -- \\
    --tenant <slug|id> --from 2025-01-01 --to 2025-12-31 --confirm

  --tenant <slug|id>  required; one tenant, never all of them
  --from <date>       inclusive first day, YYYY-MM-DD
  --to <date>         inclusive last day, YYYY-MM-DD
  --batch <n>         employees read per page (default ${DEFAULT_BATCH})
  --max-days <n>      raise the range guard (default ${DEFAULT_MAX_DAYS})
  --dry-run           report what would happen and write nothing
  --confirm           required for any write

Every row is written as BACKFILLED. Rows the daily worker already captured as
OBSERVED are left exactly as they are.

Start with --dry-run.
`);
}

void main().then((code) => {
  process.exitCode = code;
});
