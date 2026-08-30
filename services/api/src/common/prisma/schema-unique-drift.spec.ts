import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNOWN_MISSING_UNIQUE_CONSTRAINTS,
  constraintKey,
  findUniqueConstraintsMissingFromMigrations,
  locatePrismaDir,
  parseMigrationUniqueIndexes,
  parseSchemaUniqueConstraints,
  readMigrationSources,
} from './schema-unique-drift';

/**
 * BUG-0084 — a uniqueness guarantee Prisma believes in and Postgres is not
 * keeping.
 *
 * Seven `@@unique` / `@unique` declarations exist only in `schema.prisma`. The
 * database never gets them, so `upsert` on a compound key silently degrades
 * from atomic to read-then-write and two concurrent callers both insert.
 * Nothing compared a from-empty migration chain against the schema, so the gap
 * could only widen.
 *
 * The invariant: **the set of unique declarations the migration chain does not
 * create is exactly the seven already recorded.** An eighth fails this; so does
 * fixing one of the seven without emptying the list in the same commit.
 *
 * The fixture tests below are not decoration. A check that only ran against the
 * real repository would pass just as convincingly if the parser matched nothing
 * at all, which is the failure mode this repository has been bitten by before.
 */
describe('schema / migration unique-constraint drift', () => {
  describe('parseSchemaUniqueConstraints', () => {
    it('reads a block-level @@unique', () => {
      const declarations = parseSchemaUniqueConstraints(
        [
          'model Thing {',
          '  id       String @id',
          '  tenantId String',
          '  code     String',
          '',
          '  @@unique([tenantId, code])',
          '}',
        ].join('\n'),
      );

      expect(declarations).toEqual([
        {
          model: 'Thing',
          columns: ['tenantId', 'code'],
          impliedName: 'Thing_tenantId_code_key',
        },
      ]);
    });

    it('reads a field-level @unique', () => {
      const declarations = parseSchemaUniqueConstraints(
        ['model Thing {', '  slug String @unique', '}'].join('\n'),
      );

      expect(declarations).toEqual([
        {
          model: 'Thing',
          columns: ['slug'],
          impliedName: 'Thing_slug_key',
        },
      ]);
    });

    it('uses the mapped physical column name when a field carries @map', () => {
      const declarations = parseSchemaUniqueConstraints(
        [
          'model Thing {',
          '  legacyDate DateTime @unique @map("date")',
          '}',
        ].join('\n'),
      );

      expect(declarations[0].columns).toEqual(['date']);
    });

    it('does not mistake @@index or @@id for a uniqueness declaration', () => {
      const declarations = parseSchemaUniqueConstraints(
        [
          'model Thing {',
          '  tenantId String',
          '  status   String',
          '  @@id([tenantId, status])',
          '  @@index([tenantId, status])',
          '}',
        ].join('\n'),
      );

      expect(declarations).toEqual([]);
    });

    it('ignores a commented-out declaration', () => {
      const declarations = parseSchemaUniqueConstraints(
        ['model Thing {', '  code String', '  // @@unique([code])', '}'].join(
          '\n',
        ),
      );

      expect(declarations).toEqual([]);
    });

    it('keeps declarations from different models apart', () => {
      const declarations = parseSchemaUniqueConstraints(
        [
          'model A {',
          '  code String @unique',
          '}',
          '',
          'model B {',
          '  code String @unique',
          '}',
        ].join('\n'),
      );

      expect(declarations.map((d) => d.impliedName)).toEqual([
        'A_code_key',
        'B_code_key',
      ]);
    });
  });

  describe('parseMigrationUniqueIndexes', () => {
    const migration = (name: string, sql: string) => ({ name, sql });

    it('collects CREATE UNIQUE INDEX', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'CREATE UNIQUE INDEX "Thing_code_key" ON "Thing"("tenantId", "code");',
          ),
        ]),
      ).toEqual([
        {
          name: 'Thing_code_key',
          table: 'Thing',
          columns: ['tenantId', 'code'],
        },
      ]);
    });

    it('collects ADD CONSTRAINT ... UNIQUE', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'ALTER TABLE "Thing" ADD CONSTRAINT "Thing_id_tenantId_key" UNIQUE ("id", "tenantId");',
          ),
        ]),
      ).toEqual([
        {
          name: 'Thing_id_tenantId_key',
          table: 'Thing',
          columns: ['id', 'tenantId'],
        },
      ]);
    });

    it('ignores a non-unique CREATE INDEX', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'CREATE INDEX "Thing_tenantId_idx" ON "Thing"("tenantId");',
          ),
        ]),
      ).toEqual([]);
    });

    it('drops an index a later migration removes', () => {
      // This is the whole reason for replaying rather than grepping: a plain
      // count of CREATE statements would call this constraint present.
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'CREATE UNIQUE INDEX "Thing_code_key" ON "Thing"("code");',
          ),
          migration('20260102000000_b', 'DROP INDEX "Thing_code_key";'),
        ]),
      ).toEqual([]);
    });

    it('drops a constraint a later migration removes', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'ALTER TABLE "Thing" ADD CONSTRAINT "Thing_code_key" UNIQUE ("code");',
          ),
          migration(
            '20260102000000_b',
            'ALTER TABLE "Thing" DROP CONSTRAINT "Thing_code_key";',
          ),
        ]),
      ).toEqual([]);
    });

    it('follows an index through a rename', () => {
      const live = parseMigrationUniqueIndexes([
        migration(
          '20260101000000_a',
          'CREATE UNIQUE INDEX "thing_code_unique" ON "Thing"("code");',
        ),
        migration(
          '20260102000000_b',
          'ALTER INDEX "thing_code_unique" RENAME TO "Thing_code_key";',
        ),
      ]);

      expect(live).toEqual([
        { name: 'Thing_code_key', table: 'Thing', columns: ['code'] },
      ]);
    });

    it('follows an index through a table rename', () => {
      const live = parseMigrationUniqueIndexes([
        migration(
          '20260101000000_a',
          'CREATE UNIQUE INDEX "Old_code_key" ON "Old"("code");',
        ),
        migration('20260102000000_b', 'ALTER TABLE "Old" RENAME TO "New";'),
      ]);

      expect(live[0].table).toBe('New');
    });

    it('forgets the indexes of a dropped table', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            'CREATE UNIQUE INDEX "Thing_code_key" ON "Thing"("code");',
          ),
          migration('20260102000000_b', 'DROP TABLE "Thing";'),
        ]),
      ).toEqual([]);
    });

    it('does not count commented-out DDL as applied', () => {
      expect(
        parseMigrationUniqueIndexes([
          migration(
            '20260101000000_a',
            '-- CREATE UNIQUE INDEX "Thing_code_key" ON "Thing"("code");',
          ),
        ]),
      ).toEqual([]);
    });
  });

  describe('matching is by column set, not by name', () => {
    it('treats a differently-named index on the same columns as present', () => {
      // Roughly 55 indexes in the real chain carry a name Prisma would not have
      // chosen. Matching on names would report every one as missing.
      const missing = findUniqueConstraintsMissingFromMigrations(
        ['model Thing {', '  @@unique([tenantId, code])', '}'].join('\n'),
        [
          {
            name: '20260101000000_a',
            sql: 'CREATE UNIQUE INDEX "thing_tenant_code_uq" ON "Thing"("tenantId", "code");',
          },
        ],
      );

      expect(missing).toEqual([]);
    });

    it('ignores column order', () => {
      const missing = findUniqueConstraintsMissingFromMigrations(
        ['model Thing {', '  @@unique([tenantId, code])', '}'].join('\n'),
        [
          {
            name: '20260101000000_a',
            sql: 'CREATE UNIQUE INDEX "x" ON "Thing"("code", "tenantId");',
          },
        ],
      );

      expect(missing).toEqual([]);
    });

    it('does not accept an index on a different column set', () => {
      // The real HolidayCalendar case: the chain has (tenantId, name, date)
      // where the schema declares (tenantId, name). A wider index does not
      // enforce the narrower guarantee.
      const missing = findUniqueConstraintsMissingFromMigrations(
        ['model Thing {', '  @@unique([tenantId, name])', '}'].join('\n'),
        [
          {
            name: '20260101000000_a',
            sql: 'CREATE UNIQUE INDEX "x" ON "Thing"("tenantId", "name", "date");',
          },
        ],
      );

      expect(missing.map((d) => d.impliedName)).toEqual([
        'Thing_tenantId_name_key',
      ]);
    });

    it('does not accept an index on a different table', () => {
      const missing = findUniqueConstraintsMissingFromMigrations(
        ['model Thing {', '  @@unique([code])', '}'].join('\n'),
        [
          {
            name: '20260101000000_a',
            sql: 'CREATE UNIQUE INDEX "x" ON "Other"("code");',
          },
        ],
      );

      expect(missing.map((d) => d.impliedName)).toEqual(['Thing_code_key']);
    });

    it('builds an order-insensitive key', () => {
      expect(constraintKey('T', ['b', 'a'])).toBe(
        constraintKey('T', ['a', 'b']),
      );
      expect(constraintKey('T', ['a'])).not.toBe(constraintKey('U', ['a']));
    });
  });

  describe('the real schema against the real migration chain', () => {
    const prismaDir = locatePrismaDir([__dirname]);

    it('finds the prisma directory from this file', () => {
      expect(prismaDir).not.toBeNull();
    });

    it('parses a substantial number of declarations and indexes', () => {
      // A guard against the parser silently matching nothing, which would make
      // the assertion below pass for the wrong reason.
      const schema = readFileSync(
        join(prismaDir as string, 'schema.prisma'),
        'utf8',
      );
      const migrations = readMigrationSources(prismaDir as string);

      expect(migrations.length).toBeGreaterThan(200);
      expect(parseSchemaUniqueConstraints(schema).length).toBeGreaterThan(250);
      expect(parseMigrationUniqueIndexes(migrations).length).toBeGreaterThan(
        250,
      );
    });

    it('has exactly the recorded set of unenforced unique constraints', () => {
      const schema = readFileSync(
        join(prismaDir as string, 'schema.prisma'),
        'utf8',
      );
      const missing = findUniqueConstraintsMissingFromMigrations(
        schema,
        readMigrationSources(prismaDir as string),
      );

      // If this fails with MORE entries, a new uniqueness guarantee has been
      // declared that no migration creates — write the migration, do not extend
      // the list. If it fails with FEWER, BUG-0084 has been partly fixed and
      // KNOWN_MISSING_UNIQUE_CONSTRAINTS must shrink in the same commit.
      expect(missing.map((declaration) => declaration.impliedName)).toEqual([
        ...KNOWN_MISSING_UNIQUE_CONSTRAINTS,
      ]);
    });
  });
});
