/**
 * Guards for specs that must run against an isolated, correctly encoded database.
 *
 * Two different failures this exists to make loud instead of mysterious:
 *
 *   1. A spec that writes or mutates GLOBAL state (a platform setting, a shared
 *      catalog) pointed at a shared or production-like database by a stray
 *      DATABASE_URL. The database name is the only thing a test can check cheaply,
 *      so the convention is that an isolated test database carries `_e2e`, `_gui`
 *      or `_utf8` in its name (see docs/development/test-databases.md).
 *   2. A spec with non-ASCII fixtures (Arabic, accented, CJK names) run against a
 *      SQL_ASCII or LATIN1 cluster. PostgreSQL then either rejects the insert with
 *      a message a Windows client cannot even render, or silently stores mangled
 *      text; both read as a product defect and are neither.
 *
 * `assertIsolatedUtf8Database` takes anything with `$queryRaw`, so a spec can pass
 * its own PrismaService and the opt-in `describeWithDatabase({ requireUtf8 })` can
 * pass a short-lived client.
 */

export const ISOLATED_DATABASE_NAME = /(_e2e|_gui|_utf8)/;

type RawQuery = {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

export type IsolatedDatabaseReport = {
  database: string;
  encoding: string;
};

export async function assertIsolatedUtf8Database(
  prisma: RawQuery,
  options: { requireUtf8?: boolean } = {},
): Promise<IsolatedDatabaseReport> {
  const [named] =
    (await prisma.$queryRaw`SELECT current_database() AS name`) as {
      name: string;
    }[];
  const [encoded] = (await prisma.$queryRaw`SHOW server_encoding`) as {
    server_encoding: string;
  }[];
  const database = named.name;
  const encoding = encoded.server_encoding;

  if (!ISOLATED_DATABASE_NAME.test(database)) {
    throw new Error(
      `Refusing to run: database "${database}" is not an isolated test database. ` +
        `Its name must contain _e2e, _gui or _utf8. Point DATABASE_URL at a throwaway database ` +
        `(docs/development/test-databases.md).`,
    );
  }

  if (options.requireUtf8 && encoding.toUpperCase() !== 'UTF8') {
    throw new Error(
      `This spec needs a UTF-8 database but "${database}" has server_encoding ${encoding}. ` +
        `Create one with: CREATE DATABASE <name>_utf8 ENCODING 'UTF8' TEMPLATE template0; ` +
        `and point DATABASE_URL at it (docs/development/test-databases.md).`,
    );
  }

  return { database, encoding };
}
