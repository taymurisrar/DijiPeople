import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Tell a developer their database is behind *before* a screen 500s.
 *
 * A development database can sit several migrations behind indefinitely without
 * anything breaking, because the generated Prisma client in `node_modules` is
 * usually just as far behind: it does not select columns that do not exist, so
 * the two stale artifacts agree with each other. Then someone runs
 * `prisma generate` for an unrelated reason — clearing a stale type error, say.
 * The client catches up. The database does not. Every query touching a new
 * column starts returning `P2022`, attributed to whichever screen happened to
 * touch the newest column first and to whoever was using it at the time.
 *
 * That is BUG-0283. `GET /api/platform-runtime/plans` returned 500 with
 * `column PlanPrice.overageUnitAmount does not exist`, thirty minutes after an
 * unrelated `prisma generate`, and was reported as a regression in Plans.
 *
 * `npm run db:preflight` already detects exactly this. Nothing ran it. So the
 * check moves to the one moment the mismatch becomes reachable — API startup —
 * and says so by name.
 *
 * It **warns and continues**. A developer deliberately working against an older
 * database should not be locked out of the whole API, and refusing to boot over
 * a condition that is often intentional would train people to ignore it.
 */

/** A migration directory name, e.g. `20260820140000_planprice_overage`. */
export type MigrationName = string;

/**
 * Migrations that exist in the repository but are not recorded as applied.
 *
 * Comparison is by directory name because that is exactly what Prisma records
 * in `_prisma_migrations.migration_name` — no timestamp arithmetic, no ordering
 * assumption. A migration applied on the database but absent from the
 * repository is *not* reported: that is a different condition (a branch switch,
 * usually), it does not cause `P2022`, and warning about it here would produce
 * noise on every feature branch.
 */
export function findPendingMigrations(
  migrationNamesOnDisk: readonly MigrationName[],
  appliedMigrationNames: readonly MigrationName[],
): MigrationName[] {
  const applied = new Set(appliedMigrationNames);
  return migrationNamesOnDisk.filter((name) => !applied.has(name)).sort();
}

/**
 * Read migration directory names from `prisma/migrations`.
 *
 * Returns `[]` when the directory cannot be found or read. This is diagnostics:
 * a missing directory means the check cannot run, never that startup should
 * fail.
 */
export function readMigrationNamesFromDisk(migrationsDir: string): MigrationName[] {
  try {
    return readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Find `prisma/migrations` from wherever this file ended up.
 *
 * The API is started three ways — `ts-node` against `src/`, `node` against
 * `dist/`, and Jest from the workspace root — and each gives a different
 * `__dirname` and a different `process.cwd()`. Rather than encode one of them,
 * walk up from both until a `prisma/migrations` directory appears.
 */
export function locateMigrationsDir(
  startDirs: readonly string[] = [__dirname, process.cwd()],
): string | null {
  for (const start of startDirs) {
    let current = resolve(start);

    // A depth bound rather than a `while (true)`: on Windows `dirname('C:\\')`
    // returns `C:\\`, so the parent-equals-self test alone can spin.
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = join(current, 'prisma', 'migrations');
      if (existsSync(candidate)) return candidate;

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

/**
 * The warning text, or `null` when the database is up to date.
 *
 * Separated from the logging so it can be asserted directly — the thing worth
 * testing is that pending migrations are *named*, which is the whole point of
 * the warning. A list that says "4 migrations pending" sends the reader back to
 * the CLI; a list that names them lets them recognise their own branch.
 */
export function describeMigrationDrift(pending: readonly MigrationName[]): string | null {
  if (pending.length === 0) return null;

  const noun = pending.length === 1 ? 'migration' : 'migrations';
  return (
    `Database is behind the committed migrations — ${pending.length} pending ${noun}:\n` +
    pending.map((name) => `  - ${name}`).join('\n') +
    `\nQueries touching columns these add will fail with P2022 ` +
    `("column does not exist"), on whichever screen reaches one first. ` +
    `Run: npm --workspace api run prisma:migrate:deploy  (or db:preflight for the full picture). ` +
    `Startup continues — this is a warning, not a refusal. BUG-0283.`
  );
}

/** Shape of the two collaborators, kept minimal so tests need neither. */
interface DriftCheckDeps {
  readonly queryAppliedMigrationNames: () => Promise<MigrationName[]>;
  readonly readMigrationNames: () => MigrationName[];
  readonly warn: (message: string) => void;
  readonly debug: (message: string) => void;
}

/**
 * Run the check. Never throws: a diagnostic that can break startup is worse
 * than the condition it diagnoses.
 */
export async function reportMigrationDrift(deps: DriftCheckDeps): Promise<void> {
  try {
    const onDisk = deps.readMigrationNames();
    if (onDisk.length === 0) {
      deps.debug(
        'Migration drift check skipped — prisma/migrations was not found or is empty.',
      );
      return;
    }

    const applied = await deps.queryAppliedMigrationNames();
    const message = describeMigrationDrift(findPendingMigrations(onDisk, applied));
    if (message) deps.warn(message);
  } catch (error) {
    // A fresh database with no `_prisma_migrations` table lands here, as does
    // any permission problem. Neither is worth a warning: the first is normal
    // before the first migrate, the second is not this check's business.
    deps.debug(
      `Migration drift check could not run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
