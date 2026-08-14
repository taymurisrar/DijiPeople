import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { AttendanceBackfillService } from '../src/modules/attendance-engine/attendance-backfill.service';

/**
 * Reconciles a range of historical attendance, deliberately.
 *
 * NOTHING RUNS THIS FOR YOU. Deployment does not reconcile history: a tenant may
 * have years of attendance whose evidence was never captured, and silently
 * recalculating it would replace real records with an empty derivation. Someone
 * has to decide, and this is how they say so.
 *
 * USAGE
 *   npm --workspace api run backfill:attendance -- \
 *     --tenant <tenantId> --from 2026-08-01 --to 2026-08-31 [options]
 *
 * OPTIONS
 *   --employee <id>   one employee instead of the whole tenant
 *   --dry-run         report what would happen and change nothing
 *   --include-locked  rebuild finalised days too (see the warning below)
 *   --max-days <n>    raise the range guard, if you mean it
 *
 * START WITH --dry-run. It reports the same counts without writing.
 *
 * --include-locked rebuilds days whose numbers payroll has already consumed.
 * That is occasionally the right thing after an authorised reopen, and it is
 * never the right default, so it is off unless you ask.
 */
async function main(): Promise<number> {
  const logger = new Logger('AttendanceBackfill');
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

  // The whole application, so the backfill uses exactly the services the running
  // system uses. A standalone script with its own Prisma client would be a
  // second implementation of reconciliation waiting to drift.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const backfill = app.get(AttendanceBackfillService);

    const report = await backfill.run({
      tenantId: options.tenant!,
      from: new Date(`${options.from}T00:00:00.000Z`),
      to: new Date(`${options.to}T00:00:00.000Z`),
      employeeId: options.employee ?? null,
      dryRun: options.dryRun,
      includeLocked: options.includeLocked,
      maxDays: options.maxDays,
    });

    logger.log('');
    logger.log(`Attendance backfill${report.dryRun ? ' (dry run)' : ''}`);
    logger.log(`  Range          ${report.from} to ${report.to}`);
    logger.log(`  Employees      ${report.employeesConsidered}`);
    logger.log(`  Days examined  ${report.daysConsidered}`);
    logger.log(`  Reconciled     ${report.reconciled}`);
    logger.log(`  Locked, left   ${report.skippedLocked}`);
    logger.log(`  Before cutover ${report.skippedBeforeCutover}`);
    logger.log(`  Failed         ${report.failed}`);
    logger.log(`  Duration       ${report.durationMs}ms`);

    if (report.failures.length > 0) {
      logger.warn('');
      logger.warn('Failures (first 50):');
      for (const failure of report.failures) {
        logger.warn(`  ${failure.date} employee ${failure.employeeId}: ${failure.reason}`);
      }
    }

    // A run with failures exits non-zero so a scripted invocation notices, while
    // the successful days it did complete still stand.
    return report.failed > 0 ? 1 : 0;
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : 'The backfill could not run.',
    );
    return 1;
  } finally {
    await app.close();
  }
}

interface Options {
  tenant?: string;
  from?: string;
  to?: string;
  employee?: string;
  dryRun: boolean;
  includeLocked: boolean;
  maxDays?: number;
  help: boolean;
}

function parseArguments(argv: readonly string[]): Options {
  const options: Options = { dryRun: false, includeLocked: false, help: false };

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
      case '--employee':
        options.employee = next();
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--include-locked':
        options.includeLocked = true;
        break;
      case '--max-days':
        options.maxDays = Number(next());
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
  const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

  if (!options.tenant) problems.push('--tenant is required.');
  if (!isDate(options.from)) problems.push('--from must be a date, YYYY-MM-DD.');
  if (!isDate(options.to)) problems.push('--to must be a date, YYYY-MM-DD.');

  if (options.maxDays !== undefined && !Number.isFinite(options.maxDays)) {
    problems.push('--max-days must be a number.');
  }

  return problems;
}

function printUsage(): void {
  process.stdout.write(`
Reconcile a range of historical attendance.

  npm --workspace api run backfill:attendance -- \\
    --tenant <tenantId> --from 2026-08-01 --to 2026-08-31 [options]

  --employee <id>   one employee instead of the whole tenant
  --dry-run         report what would happen and change nothing
  --include-locked  rebuild finalised days too
  --max-days <n>    raise the range guard (default 92)

Start with --dry-run.
`);
}

void main().then((code) => {
  process.exitCode = code;
});
