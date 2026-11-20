import { withDatabase } from './environment';

/**
 * Proof that a flow left nothing behind, and a backstop for what the API cannot
 * delete (a job opening has no DELETE route).
 *
 * Every row a flow creates carries its run tag in a name or reason. This counts
 * the survivors by tag, so "cleanup worked" is a measurement and not a belief.
 * Only ever called after `requireGrowthEnvironment`, which has already proved
 * the database is a disposable local one; it deletes by tag and nothing else.
 */
type Tables = { table: string; column: string }[];

const TAGGED: Tables = [
  { table: 'Candidate', column: 'lastName' },
  { table: 'Employee', column: 'lastName' },
  { table: 'JobOpening', column: 'title' },
  { table: 'Customer', column: 'name' },
  { table: 'Project', column: 'name' },
  { table: 'Document', column: 'title' },
  { table: 'LeaveRequest', column: 'reason' },
  { table: 'TimesheetEntry', column: 'note' },
];

async function withClient<T>(
  fn: (c: Parameters<Parameters<typeof withDatabase>[0]>[0]) => Promise<T>,
): Promise<T> {
  const result = await withDatabase(fn);
  if (result === null) throw new Error('E2E_DATABASE_URL is unset');
  return result;
}

/**
 * Rows still carrying `tag` that are still *live*.
 *
 * "Live" matters: a leave request can only be cancelled (there is no delete
 * route) and some tables soft-delete, so a cancelled request or an `isDeleted`
 * row is a correct end state, not residue. Counting them would make a clean run
 * look dirty and teach people to ignore the check.
 */
export async function residue(tag: string): Promise<Record<string, number>> {
  return withClient(async (c) => {
    const left: Record<string, number> = {};
    for (const { table, column } of TAGGED) {
      const cols = await c.query(
        `select column_name from information_schema.columns where table_name = $1`,
        [table],
      );
      const has = (name: string) =>
        cols.rows.some((r) => r.column_name === name);
      const live = [
        has('isDeleted') ? `"isDeleted" = false` : '',
        // Documents are removed by archiving; that is the correct end state.
        has('isArchived') ? `"isArchived" = false` : '',
        table === 'LeaveRequest' ? `status not in ('CANCELLED','REJECTED')` : '',
      ]
        .filter(Boolean)
        .join(' and ');
      const r = await c.query(
        `select count(*)::int as n from "${table}" where "${column}" like $1${live ? ` and ${live}` : ''}`,
        [`%${tag}%`],
      );
      const n = r.rows[0].n as number;
      if (n > 0) left[table] = n;
    }
    return left;
  });
}

/** Remove tagged job openings (no API route exists) and nothing else. */
export async function deleteTaggedJobOpenings(tag: string): Promise<number> {
  return withClient(async (c) => {
    await c.query(
      `delete from "Application" where "jobOpeningId" in (select id from "JobOpening" where title like $1)`,
      [`%${tag}%`],
    );
    const r = await c.query(`delete from "JobOpening" where title like $1`, [
      `%${tag}%`,
    ]);
    return r.rowCount ?? 0;
  });
}

/**
 * Remove the timesheets that carry a tagged entry. A timesheet has no delete
 * route and is created lazily the first time an employee opens the month, so
 * it is regenerable; deleting it cascades its weeks, days and entries.
 */
export async function deleteTaggedTimesheets(tag: string): Promise<number> {
  return withClient(async (c) => {
    const r = await c.query(
      `delete from "Timesheet" where id in (select "timesheetId" from "TimesheetEntry" where note like $1)`,
      [`%${tag}%`],
    );
    return r.rowCount ?? 0;
  });
}
