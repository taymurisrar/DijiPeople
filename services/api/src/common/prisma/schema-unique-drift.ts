import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Catch a uniqueness guarantee Prisma believes in and Postgres is not keeping.
 *
 * A database built by applying every migration from empty does not match
 * `schema.prisma`. Most of that difference is cosmetic — constraint and index
 * naming — but some `@@unique` / `@unique` declarations exist only in the schema
 * file. Postgres never creates them, so the application reasons about a
 * uniqueness guarantee that nothing enforces, and the failure mode is not an
 * error: `upsert` on a compound key with no matching constraint silently
 * degrades from atomic to read-then-write, and two concurrent callers both find
 * nothing and both insert.
 *
 * That is BUG-0084, seven constraints deep at the time of writing. Nothing in
 * CI compared a from-empty migration chain against the schema, so the gap could
 * only widen.
 *
 * This module is that comparison, done statically. It reads the schema text and
 * the migration SQL and needs no database, which matters: the check has to run
 * in the ordinary unit suite on every push, not in a job that first has to
 * stand a Postgres up.
 *
 * **Matching is by (table, column set), never by name.** Roughly fifty-five
 * indexes in this chain exist under a name Prisma would not have chosen, and a
 * name-based comparison would report every one of them as missing — noise that
 * people learn to scroll past, which is how the seven real ones survived.
 */

/** One `@@unique([...])` or field-level `@unique` declaration in the schema. */
export interface UniqueDeclaration {
  /** The Prisma model name, which is also the physical table name here. */
  readonly model: string;
  /** Physical column names, in declaration order. */
  readonly columns: readonly string[];
  /** The name Prisma would give the index, for reporting. */
  readonly impliedName: string;
}

/** A unique index or constraint the migration chain leaves in place. */
export interface MigrationUniqueIndex {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly string[];
}

/** One migration's SQL, in chain order. */
export interface MigrationSource {
  readonly name: string;
  readonly sql: string;
}

/**
 * The seven constraints BUG-0084 measured, and the state this check pins.
 *
 * This list is deliberately an exact expectation rather than a floor. An eighth
 * constraint drifting out of the chain fails the check, and so does fixing one
 * of these seven without updating the list — which is the point: the day the
 * migration lands, this array empties in the same commit.
 *
 * Do not add to it to make a red build green. Adding an entry here asserts that
 * a uniqueness guarantee the code relies on is not enforced by the database,
 * which needs a bug record, not a line in a constant.
 */
export const KNOWN_MISSING_UNIQUE_CONSTRAINTS: readonly string[] = [
  'HolidayCalendar_tenantId_name_key',
  'PartnerOnboardingApplication_invitationTokenHash_key',
  'PartnerOnboardingSubmission_applicationId_version_key',
  'PartnerPortalUser_invitationTokenHash_key',
  'PlatformApprovalRequest_requestNumber_key',
  'PlatformApprovalStep_approvalRequestId_stepOrder_key',
  'SupportCaseIncident_supportCaseId_errorLogId_key',
];

/** Order-insensitive identity for a constraint: the table and its column set. */
export function constraintKey(
  table: string,
  columns: readonly string[],
): string {
  return `${table}::${[...columns].sort().join('|')}`;
}

function unquote(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

function parseColumnList(raw: string): string[] {
  return raw
    .split(',')
    .map((column) => unquote(column).replace(/\s+(ASC|DESC)$/i, ''))
    .filter((column) => column.length > 0);
}

/**
 * Extract every unique declaration from `schema.prisma`.
 *
 * Both spellings are collected: block-level `@@unique([a, b])` and field-level
 * `@unique` on a single field. A field carrying `@map("x")` contributes the
 * mapped physical name, because that is what the index would be built on.
 */
export function parseSchemaUniqueConstraints(
  schemaSource: string,
): UniqueDeclaration[] {
  const declarations: UniqueDeclaration[] = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  let model: RegExpExecArray | null;
  while ((model = modelPattern.exec(schemaSource)) !== null) {
    const modelName = model[1];

    for (const rawLine of model[2].split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('//')) continue;

      const block = line.match(/^@@unique\(\s*\[([^\]]+)\]/);
      if (block) {
        const columns = block[1].split(',').map((column) => column.trim());
        declarations.push({
          model: modelName,
          columns,
          impliedName: `${modelName}_${columns.join('_')}_key`,
        });
        continue;
      }

      // Every other block-level attribute (`@@index`, `@@id`, `@@map`) is not a
      // uniqueness declaration, and skipping them first keeps the field pattern
      // below from having to exclude `@@unique` by hand.
      if (line.startsWith('@@')) continue;

      const field = line.match(/^(\w+)\s+\S+/);
      if (!field || !/(^|\s)@unique\b/.test(line)) continue;

      const mapped = line.match(/@map\("([^"]+)"\)/);
      const column = mapped ? mapped[1] : field[1];
      declarations.push({
        model: modelName,
        columns: [column],
        impliedName: `${modelName}_${column}_key`,
      });
    }
  }

  return declarations;
}

/**
 * Replay the migration chain and return the unique indexes still standing.
 *
 * Replay rather than a plain grep, because a constraint can be created in one
 * migration and dropped, renamed, or carried through a table rename in a later
 * one. Counting `CREATE UNIQUE INDEX` alone would call a dropped constraint
 * present and hide exactly the drift this exists to find.
 */
export function parseMigrationUniqueIndexes(
  migrations: readonly MigrationSource[],
): MigrationUniqueIndex[] {
  const live = new Map<string, { table: string; columns: string[] }>();

  const createIndex =
    /CREATE\s+UNIQUE\s+INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"\s+ON\s+(?:"[^"]+"\.)?"([^"]+)"\s*\(([^)]*)\)/gi;
  const addConstraint =
    /ALTER\s+TABLE\s+(?:"[^"]+"\.)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(([^)]*)\)/gi;
  const renameIndex =
    /ALTER\s+INDEX(?:\s+IF\s+EXISTS)?\s+(?:"[^"]+"\.)?"([^"]+)"\s+RENAME\s+TO\s+"([^"]+)"/gi;
  const renameTable =
    /ALTER\s+TABLE\s+(?:"[^"]+"\.)?"([^"]+)"\s+RENAME\s+TO\s+"([^"]+)"/gi;
  const dropIndex =
    /DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+(?:"[^"]+"\.)?"([^"]+)"/gi;
  const dropConstraint =
    /ALTER\s+TABLE\s+(?:"[^"]+"\.)?"[^"]+"\s+DROP\s+CONSTRAINT(?:\s+IF\s+EXISTS)?\s+"([^"]+)"/gi;
  const dropTable =
    /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:"[^"]+"\.)?"([^"]+)"/gi;

  for (const migration of migrations) {
    // Commented-out DDL appears in this chain where a statement was replaced in
    // review. It must not count as applied.
    const sql = migration.sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    let match: RegExpExecArray | null;

    createIndex.lastIndex = 0;
    while ((match = createIndex.exec(sql)) !== null) {
      live.set(match[1], {
        table: match[2],
        columns: parseColumnList(match[3]),
      });
    }

    addConstraint.lastIndex = 0;
    while ((match = addConstraint.exec(sql)) !== null) {
      live.set(match[2], {
        table: match[1],
        columns: parseColumnList(match[3]),
      });
    }

    renameIndex.lastIndex = 0;
    while ((match = renameIndex.exec(sql)) !== null) {
      const existing = live.get(match[1]);
      if (existing) {
        live.delete(match[1]);
        live.set(match[2], existing);
      }
    }

    renameTable.lastIndex = 0;
    while ((match = renameTable.exec(sql)) !== null) {
      for (const entry of live.values()) {
        if (entry.table === match[1]) entry.table = match[2];
      }
    }

    dropIndex.lastIndex = 0;
    while ((match = dropIndex.exec(sql)) !== null) live.delete(match[1]);

    dropConstraint.lastIndex = 0;
    while ((match = dropConstraint.exec(sql)) !== null) live.delete(match[1]);

    dropTable.lastIndex = 0;
    while ((match = dropTable.exec(sql)) !== null) {
      for (const [name, entry] of live) {
        if (entry.table === match[1]) live.delete(name);
      }
    }
  }

  return [...live].map(([name, entry]) => ({
    name,
    table: entry.table,
    columns: entry.columns,
  }));
}

/**
 * Unique declarations in the schema that the migration chain never creates.
 *
 * These are the dangerous ones: Prisma will happily accept a compound `where`
 * on them and Postgres will not defend them.
 */
export function findUniqueConstraintsMissingFromMigrations(
  schemaSource: string,
  migrations: readonly MigrationSource[],
): UniqueDeclaration[] {
  const live = new Set(
    parseMigrationUniqueIndexes(migrations).map((index) =>
      constraintKey(index.table, index.columns),
    ),
  );

  return parseSchemaUniqueConstraints(schemaSource)
    .filter(
      (declaration) =>
        !live.has(constraintKey(declaration.model, declaration.columns)),
    )
    .sort((left, right) => left.impliedName.localeCompare(right.impliedName));
}

/**
 * Find `prisma/` from wherever this file ended up — `src/` under ts-node,
 * `dist/` under node, and the workspace root under Jest all differ.
 */
export function locatePrismaDir(
  startDirs: readonly string[] = [__dirname, process.cwd()],
): string | null {
  for (const start of startDirs) {
    let current = resolve(start);

    // A depth bound rather than `while (true)`: on Windows `dirname('C:\\')`
    // returns `C:\\`, so the parent-equals-self test alone can spin.
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = join(current, 'prisma');
      if (existsSync(join(candidate, 'schema.prisma'))) return candidate;

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

/** Read every migration's SQL from `prisma/migrations`, in chain order. */
export function readMigrationSources(prismaDir: string): MigrationSource[] {
  const migrationsDir = join(prismaDir, 'migrations');

  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) => {
      const file = join(migrationsDir, name, 'migration.sql');
      return existsSync(file)
        ? [{ name, sql: readFileSync(file, 'utf8') }]
        : [];
    });
}
