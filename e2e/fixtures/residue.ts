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

/** Configuration rows that are switched off (archived) rather than deleted. */
const ACTIVE_TAGGED: Tables = [
  { table: 'WorkSchedule', column: 'name' },
  { table: 'ShiftTemplate', column: 'name' },
  { table: 'EmployeeScheduleAssignment', column: 'reason' },
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
    // Schedules and shifts are archived, never deleted: only a live one is residue.
    for (const { table, column } of ACTIVE_TAGGED) {
      const r = await c.query(
        `select count(*)::int as n from "${table}" where "${column}" like $1 and "isActive" = true`,
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

/**
 * Remove what one employee's web punch left behind, and prove it is gone.
 *
 * A check-in is not one row. Besides the legacy AttendanceEntry the product
 * records a raw event, a session and a day, and queues a reconciliation job that
 * runs a little later. Deleting only the entry (the one route the API offers)
 * leaves the rest, and the reconciler then rebuilds an entry from them: the next
 * run starts with an "open" punch that was never its own. So this waits for the
 * employee's reconciliation to settle, then removes every row the punch created,
 * scoped to that employee and to rows created since `since`, in dependency order.
 *
 * Returns a failure message, or null when nothing is left.
 */
export async function sweepAttendanceSince(
  employeeId: string,
  since: Date,
): Promise<string | null> {
  // withClient treats a null result as "no database", so the verdict is boxed.
  const verdict = await sweepAttendance(employeeId, since);
  return verdict.failure;
}

async function sweepAttendance(
  employeeId: string,
  since: Date,
): Promise<{ failure: string | null }> {
  const order = [
    'AttendanceLocationEvidence',
    'AttendanceException',
    'AttendanceSession',
    'RawAttendanceEvent',
    'AttendanceDay',
    'AttendanceEntry',
    'AttendanceReconciliationJob',
  ];
  return withClient(async (c) => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const busy = await c.query(
        `select count(*)::int as n from "AttendanceReconciliationJob"
          where "employeeId" = $1 and status in ('PENDING','RUNNING')`,
        [employeeId],
      );
      if (busy.rows[0].n === 0) break;
      if (Date.now() > deadline) return { failure: 'attendance reconciliation did not settle within 30s' };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const left: string[] = [];
    for (const table of order) {
      const cols = await c.query(
        `select column_name from information_schema.columns where table_name = $1`,
        [table],
      );
      const names = cols.rows.map((r) => r.column_name as string);
      if (!names.includes('employeeId') || !names.includes('createdAt')) continue;
      // Prisma stores UTC in timestamp-without-zone columns; a bare Date parameter
      // would be sent in the test host's local zone and compared as if it were UTC.
      const where = `"employeeId" = $1 and "createdAt" >= ($2::timestamptz at time zone 'UTC')`;
      await c.query(`delete from "${table}" where ${where}`, [employeeId, since.toISOString()]);
      const r = await c.query(`select count(*)::int as n from "${table}" where ${where}`, [
        employeeId,
        since.toISOString(),
      ]);
      if (r.rows[0].n > 0) left.push(`${table}=${r.rows[0].n}`);
    }
    return { failure: left.length ? `attendance rows left behind: ${left.join(', ')}` : null };
  });
}
