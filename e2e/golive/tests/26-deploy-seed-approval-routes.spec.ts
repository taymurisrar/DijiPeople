import { test, expect } from '../fixtures/test';
import { sql } from '../fixtures/mail-db';

/**
 * DPQA-APR-*: after `seed:config` (it runs on every deploy), every ACTIVE role-based approval step of every tenant must have at least one active holder,
 * otherwise leave and timesheet submissions are refused with "approval route has a step nobody can approve" (BUG-1968 policy).
 *
 * RUN-006 finding (DP-QA-036): a tenant created through the real onboarding workflow ends with an owner that holds only `global-admin` and ZERO approval matrices (so the
 * fallback route works). `seed:config` then installs the default matrices, whose active step routes to `system-admin` - a role nobody holds - and the tenant can no longer
 * submit leave or timesheets. `qa-probe` is deliberately left exactly as the workflow leaves it; the other QA tenants had the prescribed administrator remediation applied
 * to them (owner assigned to system-admin) so the rest of the regression could run, which is recorded in the run report.
 */
test('[DPQA-APR-001] every active role-based approval step of every tenant has at least one active holder (no unroutable default route after seed:config)', async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'database-level check: runs once');
  const rows = await sql<{ slug: string; module: string; name: string; role: string; holders: string }>(
    `select t.slug, m."moduleKey"::text as module, m.name, r.key as role,
            (select count(*) from "UserRole" ur join "User" u on u.id = ur."userId" where ur."roleId" = r.id and u.status = 'ACTIVE')::text as holders
       from "ApprovalMatrix" m
       join "Tenant" t on t.id = m."tenantId"
       join "Role" r on r.id = m."approverRoleId"
      where m."isActive" = true and m."approverType" = 'ROLE' and t.slug like 'qa-%'
      order by t.slug, m."moduleKey"`);
  const broken = rows.filter((r) => Number(r.holders) === 0).map((r) => `${r.slug}: ${r.module} -> role ${r.role} has 0 active holders (${r.name})`);
  info.annotations.push({ type: 'checked-steps', description: String(rows.length) });
  expect(broken, 'unroutable active approval steps').toEqual([]);
});

test('[DPQA-APR-002] a tenant created through the real onboarding workflow can route a leave request after seed:config (owner or another user holds the default approver role)', async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'database-level check: runs once');
  const rows = await sql<{ owner_roles: string | null; active_default: string }>(
    `select (select string_agg(r.key, ',' order by r.key) from "UserRole" ur join "Role" r on r.id = ur."roleId" where ur."userId" = t."ownerUserId") as owner_roles,
            (select string_agg(distinct (select r2.key from "Role" r2 where r2.id = m."approverRoleId"), ',') from "ApprovalMatrix" m where m."tenantId" = t.id and m."isActive" and m."moduleKey"::text = 'LEAVE_REQUEST') as active_default
       from "Tenant" t where t.slug = 'qa-probe'`);
  test.skip(rows.length === 0, 'NOT RUN: qa-probe (an untouched onboarded tenant) does not exist');
  const { owner_roles, active_default } = rows[0];
  info.annotations.push({ type: 'observation', description: `owner roles=${owner_roles}; active leave route role=${active_default}` });
  expect(String(owner_roles).split(','), `the owner must hold the approver role of the active default route (${active_default})`).toContain(active_default);
});
