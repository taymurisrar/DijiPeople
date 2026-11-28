import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Database helpers for the work-hardening journeys (Flow S).
 *
 * Only the facts the product cannot be driven to produce through its own UI are
 * written here: a tenant's plan and feature overrides (to toggle entitlements),
 * leave, holidays and timesheets (the inputs of net capacity and the hours
 * reconciliation), and the daily updates a run consumed (the API has no delete).
 *
 * **Guarded.** The connection is refused unless the database name ends in
 * `_gui` or `_e2e`, the same rule as e2e/electron/seed-dlp-test-policy.cjs. The
 * URL comes only from `E2E_DATABASE_URL`; without it the suites that need this
 * skip loudly rather than guess.
 */

export function guiDatabaseUrl(): string | null {
  const url = process.env.E2E_DATABASE_URL?.trim();
  return url || null;
}

export function assertThrowawayDatabase(url: string): void {
  if (!/\/[^/?]*(_gui|_e2e)(\?|$)/.test(url)) {
    throw new Error(
      'REFUSED: E2E_DATABASE_URL must name a throwaway database whose name ends in _gui or _e2e.',
    );
  }
}

export async function withGuiDb<T>(run: (db: Client) => Promise<T>): Promise<T> {
  const url = guiDatabaseUrl();
  if (!url) throw new Error('E2E_DATABASE_URL is not set');
  assertThrowawayDatabase(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function tenantIdOf(db: Client, slug: string): Promise<string> {
  const row = await db.query('select id from "Tenant" where slug = $1', [slug]);
  if (!row.rows[0]) throw new Error(`no tenant with slug ${slug}`);
  return row.rows[0].id as string;
}

/* ------------------------------------------------------------- entitlements */

export type EntitlementSnapshot = {
  slug: string;
  subscriptions: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
};

/** Everything that decides a tenant's entitlements, so it can be put back exactly. */
export async function snapshotEntitlements(slug: string): Promise<EntitlementSnapshot> {
  return withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, slug);
    const subs = await db.query('select * from "Subscription" where "tenantId" = $1', [tenantId]);
    const feats = await db.query('select * from "TenantFeature" where "tenantId" = $1', [tenantId]);
    return { slug, subscriptions: subs.rows, features: feats.rows };
  });
}

async function insertRow(db: Client, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const values = cols.map((c) => row[c]);
  await db.query(
    `insert into "${table}" (${cols.map((c) => `"${c}"`).join(',')}) values (${cols
      .map((_, i) => `$${i + 1}`)
      .join(',')})`,
    values,
  );
}

export async function restoreEntitlements(snapshot: EntitlementSnapshot): Promise<void> {
  await withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, snapshot.slug);
    await db.query('delete from "TenantFeature" where "tenantId" = $1', [tenantId]);
    await db.query('delete from "Subscription" where "tenantId" = $1', [tenantId]);
    for (const row of snapshot.subscriptions) await insertRow(db, 'Subscription', row);
    for (const row of snapshot.features) await insertRow(db, 'TenantFeature', row);
  });
}

/** Put the tenant on one plan (starter | growth | enterprise), with no feature overrides. */
export async function setTenantPlan(slug: string, planKey: string): Promise<void> {
  await withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, slug);
    const plan = await db.query('select id from "Plan" where key = $1', [planKey]);
    if (!plan.rows[0]) throw new Error(`no plan ${planKey}`);
    await db.query('delete from "TenantFeature" where "tenantId" = $1', [tenantId]);
    const existing = await db.query('select id from "Subscription" where "tenantId" = $1', [tenantId]);
    if (existing.rows[0]) {
      await db.query(
        `update "Subscription" set "planId" = $1, status = 'ACTIVE', "updatedAt" = now() where "tenantId" = $2`,
        [plan.rows[0].id, tenantId],
      );
    } else {
      await db.query(
        `insert into "Subscription" (id, "tenantId", "planId", status, "startDate", "updatedAt")
         values ($1, $2, $3, 'ACTIVE', now(), now())`,
        [randomUUID(), tenantId, plan.rows[0].id],
      );
    }
  });
}

/**
 * A per-tenant feature override on top of whatever plan the tenant is on. An override
 * is capped by the plan (it can switch a plan feature off, not grant one) unless its
 * source is CUSTOM, which is how a tenant is given a feature its plan never sold.
 */
export async function setTenantFeature(
  slug: string,
  key: string,
  isEnabled: boolean | null,
  source: 'MANUAL' | 'CUSTOM' = 'MANUAL',
): Promise<void> {
  await withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, slug);
    await db.query('delete from "TenantFeature" where "tenantId" = $1 and key = $2', [tenantId, key]);
    if (isEnabled === null) return;
    await db.query(
      `insert into "TenantFeature" (id, "tenantId", key, "isEnabled", source, "updatedAt")
       values ($1, $2, $3, $4, $5::"TenantFeatureSource", now())`,
      [randomUUID(), tenantId, key, isEnabled, source],
    );
  });
}

/* ------------------------------------------------------------ daily updates */

/** Remove the daily updates of the named tenant users (the API has no delete). */
export async function clearDailyUpdatesFor(slug: string, emails: string[]): Promise<number> {
  return withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, slug);
    const employees = await db.query(
      `select e.id from "Employee" e join "User" u on u.id = e."userId"
        where e."tenantId" = $1 and u.email = any($2)`,
      [tenantId, emails],
    );
    const ids = employees.rows.map((r) => r.id as string);
    if (!ids.length) return 0;
    // Child rows first: items hang off the update.
    const updates = await db.query(
      'select id from "DailyUpdate" where "tenantId" = $1 and "employeeId" = any($2)',
      [tenantId, ids],
    );
    const updateIds = updates.rows.map((r) => r.id as string);
    if (!updateIds.length) return 0;
    const tables = await db.query(
      `select table_name from information_schema.columns
        where column_name = 'dailyUpdateId' and table_schema = 'public'`,
    );
    for (const t of tables.rows) {
      await db.query(`delete from "${t.table_name}" where "dailyUpdateId" = any($1)`, [updateIds]);
    }
    await db.query('delete from "DailyUpdate" where id = any($1)', [updateIds]);
    return updateIds.length;
  });
}

/* ------------------------------------------------- leave, holidays, hours */

export type CapacityFixture = {
  leaveTypeId: string;
  calendarId: string;
  assignmentId: string;
  leaveRequestIds: string[];
  holidayIds: string[];
  timesheetIds: string[];
};

/**
 * Approved leave days for one employee and holidays for the tenant, in a period
 * far from anything else, through a private calendar assigned as the tenant
 * default for the duration of the run. Returns what to delete afterwards.
 */
export async function seedCapacityFacts(input: {
  slug: string;
  employeeId: string;
  leaveDays: string[];
  holidayDays: string[];
  tag: string;
}): Promise<CapacityFixture> {
  return withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, input.slug);
    const fixture: CapacityFixture = {
      leaveTypeId: randomUUID(),
      calendarId: randomUUID(),
      assignmentId: randomUUID(),
      leaveRequestIds: [],
      holidayIds: [],
      timesheetIds: [],
    };
    await db.query(
      `insert into "LeaveType" (id, "tenantId", name, code, category, "updatedAt")
       values ($1, $2, $3, $4, 'ANNUAL', now())`,
      [fixture.leaveTypeId, tenantId, `E2E leave ${input.tag}`, `E2E-${input.tag}`.slice(0, 20)],
    );
    for (const day of input.leaveDays) {
      const id = randomUUID();
      await db.query(
        `insert into "LeaveRequest" (id, "tenantId", "employeeId", "leaveTypeId", "startDate", "endDate", "totalDays", status, "updatedAt")
         values ($1, $2, $3, $4, $5, $5, 1, 'APPROVED', now())`,
        [id, tenantId, input.employeeId, fixture.leaveTypeId, `${day}T00:00:00.000Z`],
      );
      fixture.leaveRequestIds.push(id);
    }
    await db.query(
      `insert into "HolidayCalendar" (id, "tenantId", name, "updatedAt") values ($1, $2, $3, now())`,
      [fixture.calendarId, tenantId, `E2E calendar ${input.tag}`],
    );
    for (const day of input.holidayDays) {
      const id = randomUUID();
      await db.query(
        `insert into "Holiday" (id, "tenantId", "holidayCalendarId", name, "holidayDate", "updatedAt")
         values ($1, $2, $3, $4, $5, now())`,
        [id, tenantId, fixture.calendarId, `E2E holiday ${day}`, `${day}T00:00:00.000Z`],
      );
      fixture.holidayIds.push(id);
    }
    await db.query(
      `insert into "HolidayCalendarAssignment" (id, "tenantId", "holidayCalendarId", "isDefault", "updatedAt")
       values ($1, $2, $3, true, now())`,
      [fixture.assignmentId, tenantId, fixture.calendarId],
    );
    return fixture;
  });
}

/** An approved timesheet entry of `hours` on a work item, for the hours reconciliation. */
export async function seedTimesheetHours(input: {
  slug: string;
  employeeId: string;
  taskId: string;
  hours: string;
  approvalStatus: 'APPROVED' | 'PENDING' | 'DRAFT';
  day: string;
  month: number;
  year: number;
}): Promise<{ timesheetId: string; entryId: string }> {
  return withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, input.slug);
    const timesheetId = randomUUID();
    const entryId = randomUUID();
    // One transaction: a half-seeded sheet would otherwise block the next run (unique per month).
    await db.query('begin');
    try {
    const first = new Date(Date.UTC(input.year, input.month - 1, 1));
    const last = new Date(Date.UTC(input.year, input.month, 0));
    await db.query(
      `insert into "Timesheet" (id, "tenantId", "employeeId", "periodStart", "periodEnd", month, year, "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [timesheetId, tenantId, input.employeeId, first, last, input.month, input.year],
    );
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
      new Date(`${input.day}T00:00:00.000Z`).getUTCDay()
    ];
    await db.query(
      `insert into "TimesheetEntry" (id, "tenantId", "timesheetId", "employeeId", "taskId", "approvalStatus", date, "dayOfWeek", hours, "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8::"WorkWeekday", $9, now())`,
      [
        entryId,
        tenantId,
        timesheetId,
        input.employeeId,
        input.taskId,
        input.approvalStatus,
        `${input.day}T00:00:00.000Z`,
        weekday,
        input.hours,
      ],
    );
    await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
    return { timesheetId, entryId };
  });
}

export async function removeCapacityFacts(
  fixture: CapacityFixture,
  extra: { timesheetIds?: string[] } = {},
): Promise<void> {
  await withGuiDb(async (db) => {
    const sheets = [...fixture.timesheetIds, ...(extra.timesheetIds ?? [])];
    if (sheets.length) {
      await db.query('delete from "TimesheetEntry" where "timesheetId" = any($1)', [sheets]);
      await db.query('delete from "Timesheet" where id = any($1)', [sheets]);
    }
    await db.query('delete from "HolidayCalendarAssignment" where id = $1', [fixture.assignmentId]);
    await db.query('delete from "Holiday" where "holidayCalendarId" = $1', [fixture.calendarId]);
    await db.query('delete from "HolidayCalendar" where id = $1', [fixture.calendarId]);
    if (fixture.leaveRequestIds.length) {
      await db.query('delete from "LeaveRequest" where id = any($1)', [fixture.leaveRequestIds]);
    }
    await db.query('delete from "LeaveType" where id = $1', [fixture.leaveTypeId]);
  });
}

/* --------------------------------------------------------------- workspaces */

/**
 * The web app resolves a workspace from its host name through a TenantDomain row;
 * a stack whose rows are missing answers "We could not find this company portal"
 * on every <slug>.localhost URL. Inserts the primary system host for each slug
 * that has none (idempotent, never touches an existing row). Opt-in: callers
 * invoke it only when the owner of the throwaway stack has allowed it.
 */
export async function ensureWorkspaceHosts(slugs: string[], rootDomain: string): Promise<string[]> {
  return withGuiDb(async (db) => {
    const added: string[] = [];
    for (const slug of slugs) {
      const tenantId = await tenantIdOf(db, slug);
      const domain = `${slug}.${rootDomain.replace(/:\d+$/, '')}`;
      const have = await db.query('select id from "TenantDomain" where domain = $1', [domain]);
      if (have.rows[0]) continue;
      await db.query(
        `insert into "TenantDomain" (id, "tenantId", domain, type, "isPrimary", "verificationStatus", "verifiedAt", "updatedAt")
         values ($1, $2, $3, 'SYSTEM_SUBDOMAIN', true, 'VERIFIED', now(), now())`,
        [randomUUID(), tenantId, domain],
      );
      added.push(domain);
    }
    return added;
  });
}

/* ------------------------------------------------------ a second tenant */

export type ForeignDuties = {
  tenantId: string;
  templateId: string;
  occurrenceId: string;
  checkId: string;
  handoverId: string;
  cleanup: () => Promise<void>;
};

/**
 * A second, real tenant row in the throwaway database holding one duty template,
 * one occurrence (with its work item and a check) and one open handover, so a
 * cross-tenant journey can prove the API answers 404 for ids it does not own. The
 * GUI stack provisions one tenant only. The handover's sender is a copy of an
 * existing employee row re-homed to the new tenant. `cleanup` removes it all.
 */
export async function seedForeignDuties(tag: string, copyEmployeeId: string): Promise<ForeignDuties> {
  const slug = `e2e-x-${tag}`.toLowerCase();
  const ids = await withGuiDb(async (db) => {
    const customer = await db.query(`select id from "CustomerAccount" limit 1`);
    const tenant = await db.query(
      `insert into "Tenant" (id, "customerAccountId", name, slug, "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, now()) returning id`,
      [customer.rows[0]?.id, `E2E X ${tag}`, slug],
    );
    const tenantId = tenant.rows[0].id as string;
    const employee = await db.query(
      `insert into "Employee"
         select (jsonb_populate_record(null::"Employee", to_jsonb(e)
           || (select jsonb_object_agg(k, null) from jsonb_object_keys(to_jsonb(e)) k where k like '%Id' and k not in ('id', 'tenantId'))
           || jsonb_build_object(
           'id', gen_random_uuid()::text, 'tenantId', $1::text, 'userId', null,
           'employeeCode', 'X-' || $3::text, 'email', null))).*
         from "Employee" e where e.id = $2 returning id`,
      [tenantId, copyEmployeeId, tag],
    );
    const template = await db.query(
      `insert into "DutyTemplate" (id, "tenantId", key, name, weekdays, timezone, "updatedAt")
       values (gen_random_uuid()::text, $1, $2, 'Foreign duty', '{1,2,3,4,5,6,7}', 'UTC', now()) returning id`,
      [tenantId, `foreign-${tag}`.toLowerCase()],
    );
    const item = await db.query(
      `insert into "WorkItem" (id, "tenantId", kind, title, "updatedAt")
       values (gen_random_uuid()::text, $1, 'DUTY_OCCURRENCE', 'Foreign duty occurrence', now()) returning id`,
      [tenantId],
    );
    const occurrence = await db.query(
      `insert into "DutyOccurrence" (id, "tenantId", "dutyTemplateId", "forDate", "workItemId")
       values (gen_random_uuid()::text, $1, $2, current_date, $3) returning id`,
      [tenantId, template.rows[0].id, item.rows[0].id],
    );
    const check = await db.query(
      `insert into "DutyOccurrenceCheck" (id, "tenantId", "occurrenceId", position, label, required)
       values (gen_random_uuid()::text, $1, $2, 0, 'Foreign check', false) returning id`,
      [tenantId, occurrence.rows[0].id],
    );
    const handover = await db.query(
      `insert into "DutyHandover" (id, "tenantId", "fromEmployeeId", "toEmployeeId", note)
       values (gen_random_uuid()::text, $1, $2, $2, 'Foreign handover') returning id`,
      [tenantId, employee.rows[0].id],
    );
    return {
      tenantId,
      templateId: template.rows[0].id as string,
      occurrenceId: occurrence.rows[0].id as string,
      checkId: check.rows[0].id as string,
      handoverId: handover.rows[0].id as string,
    };
  });
  return {
    ...ids,
    cleanup: () =>
      withGuiDb(async (db) => {
        for (const table of ['DutyHandover', 'DutyOccurrenceCheck', 'DutyOccurrence', 'DutyTemplate', 'WorkItem', 'Employee']) {
          await db.query(`delete from "${table}" where "tenantId" = $1`, [ids.tenantId]);
        }
        await db.query(`delete from "Tenant" where id = $1`, [ids.tenantId]);
      }).then(() => undefined),
  };
}

/* ------------------------------------------------- duty test data cleanup */

/**
 * Remove the duty templates a Flow T run created (their keys start `e2e-`), with
 * their occurrences, checks, work items and the handovers the journeys sent. A
 * template has no delete in the product (it is only deactivated, so history
 * stays); in the throwaway database these would otherwise pile up run after run.
 * Scoped to the tenant by slug and to the `e2e-` key prefix and the journeys' own
 * handover notes, so nothing else is touched.
 */
export async function removeE2eDuties(slug: string): Promise<{ templates: number }> {
  return withGuiDb(async (db) => {
    const tenantId = await tenantIdOf(db, slug);
    const templates = await db.query(
      `select id from "DutyTemplate" where "tenantId" = $1 and key like 'e2e-%'`,
      [tenantId],
    );
    const templateIds = templates.rows.map((r) => r.id as string);
    await db.query('begin');
    try {
      if (templateIds.length) {
        const occurrences = await db.query(
          `select id, "workItemId" from "DutyOccurrence" where "tenantId" = $1 and "dutyTemplateId" = any($2::text[])`,
          [tenantId, templateIds],
        );
        const occurrenceIds = occurrences.rows.map((r) => r.id as string);
        const workItemIds = occurrences.rows.map((r) => r.workItemId as string);
        await db.query(`delete from "DutyHandover" where "tenantId" = $1 and "occurrenceId" = any($2::text[])`, [
          tenantId,
          occurrenceIds,
        ]);
        await db.query(`delete from "DutyTemplate" where "tenantId" = $1 and id = any($2::text[])`, [
          tenantId,
          templateIds,
        ]);
        await db.query(`delete from "WorkItem" where "tenantId" = $1 and id = any($2::text[])`, [tenantId, workItemIds]);
      }
      await db.query(
        `delete from "DutyHandover" where "tenantId" = $1 and (note like 'Keys are with security %' or note like 'Team handover %' or note like 'Tenant A handover %')`,
        [tenantId],
      );
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
    return { templates: templateIds.length };
  });
}
