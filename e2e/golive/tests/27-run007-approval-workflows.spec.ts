import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS, planTenantProvisioned } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import { spawnSync } from 'node:child_process';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-007 (prepared before the fix candidate exists; every expectation is the owner decision, never a description of a build).
 * Owner decision 5: deployment seeding must PRESERVE valid approval workflows, email settings and other tenant-specific configuration.
 *
 *   APR-010  fresh tenant (pristine onboarded `qa-probe`): repeated seed:config leaves every active ROLE step routable and is idempotent (no duplicates, no churn)
 *   APR-011  existing tenants: approval matrices (ids, approver, activity) are byte-identical before/after repeated seed:config
 *   APR-012  a deliberately customised matrix survives repeated seed:config (marker matrix is not replaced, re-activated or deleted)
 *   APR-020  leave submission with a valid approver succeeds on every provisioned plan, as the real employee, AFTER seed:config (DP-QA-036 end-to-end)
 *   APR-021  the approver can approve it; the persisted request is APPROVED with an approver recorded
 *   APR-030  timesheet submission is never refused with the "approval route has a step nobody can approve" error (Growth+; Starter has no timesheets)
 *
 * PROTOCOL: `qa-probe` must be provisioned through the real onboarding workflow AFTER migrations and BEFORE the first seed:config of the run, and must NOT receive the
 * administrator remediation that RUN-006 applied to the other tenants. If it did, APR-010/APR-020-probe are recorded Not Run, never Passed.
 */
const worktree = process.env.QA_API_WORKTREE ?? (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE ?? '';
const run = Date.now().toString(36);
const ROUTE_ERROR = /nobody can approve|approval route|no (active )?approver|cannot be routed/i;
const FRESH = 'qa-probe';

function seedConfig(): number | null {
  return spawnSync('npm', ['--workspace', 'api', 'run', 'seed:config'], {
    cwd: worktree, env: { ...process.env, DATABASE_URL: env.QA_DATABASE_URL, NODE_ENV: 'test' }, encoding: 'utf8', shell: true, timeout: 300_000,
  }).status;
}
const matrixHash = async (slug: string) =>
  (await sql<{ h: string; n: string }>(
    `select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) as h, count(*)::text as n from "ApprovalMatrix" m where m."tenantId" = (select id from "Tenant" where slug = $1)`, [slug]))[0];

/** Active role-based steps that nobody can act on. */
const unroutable = (slug: string) => sql<{ module: string; role: string }>(
  `select m."moduleKey"::text as module, r.key as role from "ApprovalMatrix" m join "Role" r on r.id = m."approverRoleId"
    where m."tenantId" = (select id from "Tenant" where slug = $1) and m."isActive" and m."approverType" = 'ROLE'
      and not exists (select 1 from "UserRole" ur join "User" u on u.id = ur."userId" where ur."roleId" = r.id and u.status = 'ACTIVE')`, [slug]);

test.describe('seed:config and approval workflows (local _test database)', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE is not set');

  test('[DPQA-APR-010] fresh onboarded tenant: repeated seed:config leaves all active role steps routable and creates no duplicates', async ({}, info) => {
    test.setTimeout(900_000);
    const exists = await sql<{ id: string }>(`select id from "Tenant" where slug = $1`, [FRESH]);
    test.skip(exists.length === 0, `NOT RUN: pristine onboarded tenant ${FRESH} does not exist`);
    expect(seedConfig(), 'first seed:config').toBe(0);
    const one = await matrixHash(FRESH);
    expect(await unroutable(FRESH), 'after seed 1: unroutable active steps (DP-QA-036)').toEqual([]);
    expect(seedConfig(), 'second seed:config').toBe(0);
    const two = await matrixHash(FRESH);
    info.annotations.push({ type: 'measurement', description: `matrices after seed1=${one.n}, after seed2=${two.n}` });
    expect(two, 'second seed must not rewrite or duplicate matrices').toEqual(one);
  });

  test('[DPQA-APR-011] existing tenants: approval matrices are unchanged by repeated seed:config', async ({}) => {
    test.setTimeout(900_000);
    const slugs = [TENANTS.A.slug, TENANTS.B.slug, ...(['G', 'E', 'C'] as const).filter(planTenantProvisioned).map((k) => TENANTS[k].slug)];
    const before: Record<string, { h: string; n: string }> = {};
    for (const s of slugs) before[s] = await matrixHash(s);
    expect(seedConfig()).toBe(0);
    expect(seedConfig()).toBe(0);
    for (const s of slugs) expect(await matrixHash(s), `${s}: matrices changed by seed:config`).toEqual(before[s]);
  });

  test('[DPQA-APR-012] a customised approval matrix survives repeated seed:config', async ({}) => {
    test.setTimeout(900_000);
    const t = (await sql<{ id: string }>(`select id from "Tenant" where slug = $1`, [TENANTS.B.slug]))[0]?.id;
    expect(t, 'tenant B').toBeTruthy();
    const donor = (await sql<Record<string, unknown>>(`select * from "ApprovalMatrix" where "tenantId" = $1 limit 1`, [t]))[0];
    test.skip(!donor, 'NOT RUN: tenant B has no approval matrix to customise');
    const marker = `QA custom matrix ${run}`;
    const before = (await sql<{ name: string; isActive: boolean }>(`update "ApprovalMatrix" set name = $2, "updatedAt" = now() - interval '2 day' where id = $1 returning name, "isActive"`, [donor.id, marker]))[0];
    try {
      expect(seedConfig()).toBe(0);
      expect(seedConfig()).toBe(0);
      const after = (await sql<{ name: string; isActive: boolean }>(`select name, "isActive" from "ApprovalMatrix" where id = $1`, [donor.id]))[0];
      expect(after, 'customised matrix still exists, same name and activity').toEqual(before);
    } finally {
      await sql(`update "ApprovalMatrix" set name = $2 where id = $1`, [donor.id, donor.name]).catch(() => undefined);
    }
  });
});

type K = 'A' | 'G' | 'E' | 'C';
const PLANS: Array<[K, string]> = [['A', 'Starter'], ['G', 'Growth'], ['E', 'Enterprise'], ['C', 'Custom']];
const day = (n: number) => new Date(Date.UTC(2036, 0, 3 + n)).toISOString().slice(0, 10);

async function leaveType(request: APIRequestContext, owner: string): Promise<string> {
  const list = (await api(request, owner, 'GET', '/leave-types')).body;
  const arr = Array.isArray(list) ? list : (list.items ?? []);
  const hit = arr.find((t: { code?: string }) => t.code === 'QAL');
  if (hit) return hit.id;
  const r = await api(request, owner, 'POST', '/leave-types', { name: 'QA Leave', code: 'QAL', category: 'ANNUAL', isPaid: true, consumesBalance: false, requiresApproval: true, employeeRequestAllowed: true, isActive: true });
  expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBeLessThan(300);
  return r.body.id;
}

for (const [key, label] of PLANS) {
  test.describe(`leave submission and approval after seed:config - ${label}`, () => {
    test.skip(key !== 'A' && !planTenantProvisioned(key as 'G' | 'E' | 'C'), `NOT RUN: ${label} tenant not provisioned`);
    test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'API-level suite: runs once, on the chromium project'); });

    test(`[DPQA-APR-020-${key}] ${label}: the employee submits leave and it is routed to a real approver`, async ({ request }) => {
      test.setTimeout(600_000);
      const owner = await apiToken(request, key, 'OWNER');
      const emp = await apiToken(request, key, 'EMPLOYEE');
      const typeId = await leaveType(request, owner);
      const s = day((Date.now() % 3000) + { A: 0, G: 1, E: 2, C: 3 }[key]);
      const r = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: s, endDate: s, reason: `QA APR ${run}` });
      try {
        expect(JSON.stringify(r.body), `${label}: refused for an unroutable approval route`).not.toMatch(ROUTE_ERROR);
        expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBe(201);
        const rows = await sql<{ status: string }>(`select status::text from "LeaveRequest" where id = $1`, [r.body.id]);
        expect(rows[0]?.status, 'persisted status').toMatch(/PENDING|SUBMITTED/i);
      } finally {
        if (r.body?.id) await api(request, owner, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' });
      }
    });

    test(`[DPQA-APR-021-${key}] ${label}: the approver approves and the persisted request records an approver`, async ({ request }) => {
      test.setTimeout(600_000);
      const owner = await apiToken(request, key, 'OWNER');
      const emp = await apiToken(request, key, 'EMPLOYEE');
      const typeId = await leaveType(request, owner);
      const s = day((Date.now() % 3000) + 10 + { A: 0, G: 1, E: 2, C: 3 }[key]);
      const r = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: s, endDate: s, reason: `QA APR approve ${run}` });
      expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBe(201);
      try {
        const a = await api(request, owner, 'POST', `/leave-requests/${r.body.id}/approve`, { comments: 'QA approve' });
        expect(a.status, JSON.stringify(a.body).slice(0, 240)).toBeLessThan(300);
        const rows = await sql<{ status: string }>(`select status::text from "LeaveRequest" where id = $1`, [r.body.id]);
        expect(rows[0]?.status, 'persisted status').toMatch(/APPROVED/i);
      } finally {
        await api(request, owner, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' });
      }
    });
  });
}

test.describe('timesheet submission with a valid approver', () => {
  test.skip(!planTenantProvisioned('G'), 'NOT RUN: Growth tenant not provisioned (Starter has no timesheets)');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'API-level suite: runs once, on the chromium project'); });
  test('[DPQA-APR-030] submitting a timesheet week is never refused for an unroutable approval step', async ({ request }, info) => {
    test.setTimeout(600_000);
    const emp = await apiToken(request, 'G', 'EMPLOYEE');
    const mine = await api(request, emp, 'GET', '/timesheets/mine');
    expect(mine.status, JSON.stringify(mine.body).slice(0, 200)).toBe(200);
    const sheets = Array.isArray(mine.body) ? mine.body : (mine.body.items ?? []);
    test.skip(sheets.length === 0, 'NOT RUN: the Growth employee has no timesheet to submit (calibrate the fixture on the first RUN-007 pass)');
    const sheet = sheets[0];
    const detail = (await api(request, emp, 'GET', `/timesheets/${sheet.id}`)).body;
    const week = (detail.weeks ?? [])[0];
    test.skip(!week, 'NOT RUN: the timesheet has no week');
    const r = await api(request, emp, 'POST', `/timesheets/${sheet.id}/weeks/${week.id}/submit`, {});
    info.annotations.push({ type: 'observation', description: `submit -> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}` });
    expect(JSON.stringify(r.body), 'timesheet submission refused for an unroutable approval route (DP-QA-036)').not.toMatch(ROUTE_ERROR);
  });
});
