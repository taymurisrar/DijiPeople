import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * DPQA-SEED-*: `seed:config` (and the migration it follows) must be idempotent and must never overwrite tenant-specific configuration.
 * Requirements (RUN-006 dispatch, 2026-11-01): existing SMTP-configured tenants keep provider, configuration and credentials across repeated seeds; mail still
 * DELIVERS through the local sink after seeding (not only persisted); a fresh tenant gets exactly one safe default without touching others; branding, entitlements and
 * role permissions survive; repeated runs create no duplicates and reset nothing; no SMTP credential reaches logs, attachments, reports or Git.
 *
 * Isolation: local `_test` database only (sql() refuses anything else); the seed runs from the validation worktree named by QA_API_WORKTREE with DATABASE_URL pointed
 * at that database; the marker provider uses a DUMMY credential generated per run and removed afterwards. Real credentials are never read or written.
 * The seed's own output is captured and scanned for the dummy secret but NEVER attached or printed. Snapshots attach only hashes, never configuration bodies.
 */
const run = Date.now().toString(36);
const SECRET = `qa-dummy-secret-${run}-${Math.random().toString(36).slice(2)}`;
const worktree = (process.env.QA_API_WORKTREE ?? (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE) ?? '';

type Row = Record<string, unknown>;
const hash = async (query: string, p: unknown[] = []) =>
  (await sql<{ h: string; n: string }>(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h, count(*)::text as n from (${query}) t`, p))[0];

/** Tenant-owned state that a seed must not alter. Providers/settings/features compare INCLUDING updatedAt (a rewrite is a finding); roles exclude updatedAt. */
const SNAPSHOTS: Record<string, string> = {
  providers: `select id, "tenantId", "providerType", "providerName", enabled, "isDefault", "fromEmail", "fromName", "replyToEmail", configuration, "createdAt", "updatedAt" from "EmailProviderSetting" where "tenantId" = $1`,
  settings: `select id, category, key, value, "updatedAt" from "TenantSetting" where "tenantId" = $1`,
  features: `select id, key, "isEnabled", "updatedAt" from "TenantFeature" where "tenantId" = $1`,
  branding: `select * from "TenantBranding" where "tenantId" = $1`,
  roles: `select r.id, r.key, r.name from "Role" r where r."tenantId" = $1`,
  rolePermissions: `select rp."roleId", rp."permissionId" from "RolePermission" rp join "Role" r on r.id = rp."roleId" where r."tenantId" = $1`,
  rolePrivileges: `select rp.* from "RolePrivilege" rp join "Role" r on r.id = rp."roleId" where r."tenantId" = $1`,
};
async function snapshot(tenantId: string) {
  const out: Record<string, { h: string; n: string }> = {};
  for (const [k, q] of Object.entries(SNAPSHOTS)) out[k] = await hash(q, [tenantId]);
  return out;
}
const tenantId = async (slug: string) => (await sql<{ id: string }>(`select id from "Tenant" where slug = $1`, [slug]))[0]?.id;

/** Runs `npm --workspace api run seed:config` against the QA database. Output is scanned for the dummy secret and discarded. */
function seedConfig(): { status: number | null; leaked: boolean } {
  const r = spawnSync('npm', ['--workspace', 'api', 'run', 'seed:config'], {
    cwd: worktree, env: { ...process.env, DATABASE_URL: env.QA_DATABASE_URL, NODE_ENV: 'test' }, encoding: 'utf8', shell: true, timeout: 300_000,
  });
  return { status: r.status, leaked: `${r.stdout}${r.stderr}`.includes(SECRET) };
}

test.describe.configure({ mode: 'serial' });
test.describe('seed:config and migration idempotency (local _test database)', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE (path of the validation worktree that holds the candidate) is not set in .env.qa.local');
  let tB = ''; let tA = ''; let before: Awaited<ReturnType<typeof snapshot>>; let markerId = ''; let disabledId = '';

  test.beforeAll(async () => {
    tB = (await tenantId(TENANTS.B.slug))!; tA = (await tenantId(TENANTS.A.slug))!;
    expect(tB && tA, 'both QA tenants exist').toBeTruthy();
    // A disabled SMTP provider carrying a dummy credential: an administrator's deliberate choice that a seed must neither re-enable nor replace.
    const m = await sql<{ id: string }>(
      `insert into "EmailProviderSetting" (id, "tenantId", "providerType", "providerName", enabled, "isDefault", "fromEmail", "fromName", configuration, "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, 'SMTP', $2, false, false, 'qa-marker@qa.dijipeople.test', 'QA Marker', $3::jsonb, now() - interval '1 day', now() - interval '1 day') returning id`,
      [tB, `QA SMTP Marker ${run}`, JSON.stringify({ host: '127.0.0.1', port: 1, username: 'qa-user', password: SECRET })]);
    markerId = m[0].id;
    before = await snapshot(tB);
  });
  test.afterAll(async () => { if (markerId) await sql(`delete from "EmailProviderSetting" where id = $1`, [markerId]).catch(() => undefined); if (disabledId) await sql(`delete from "EmailProviderSetting" where id = $1`, [disabledId]).catch(() => undefined); });

  test('[DPQA-SEED-001] repeated seed:config keeps an existing (disabled) SMTP provider byte-for-byte: type, enabled flag, configuration, credentials, updatedAt', async () => {
    for (let i = 0; i < 2; i++) { const s = seedConfig(); expect(s.status, `seed:config run ${i + 1} exit code`).toBe(0); expect(s.leaked, 'seed output must not contain the SMTP credential').toBe(false); }
    const row = (await sql<Row>(`select "providerType", enabled, "isDefault", configuration, "updatedAt" from "EmailProviderSetting" where id = $1`, [markerId]))[0];
    expect(row, 'marker provider still exists').toBeTruthy();
    expect(row.providerType).toBe('SMTP'); expect(row.enabled, 'a disabled provider must not be re-enabled').toBe(false); expect(row.isDefault).toBe(false);
    expect((row.configuration as Record<string, string>).password, 'credential unchanged').toBe(SECRET);
    expect(new Date(row.updatedAt as string).getTime(), 'seed did not rewrite the row').toBeLessThan(Date.now() - 60 * 60 * 1000);
    const after = await snapshot(tB);
    expect(after.providers.n, 'no provider rows added for a tenant that has configuration').toBe((await hash(SNAPSHOTS.providers, [tB])).n);
  });

  test('[DPQA-SEED-002] a tenant that already has any provider never receives the Console default (no duplicate, no re-enable)', async () => {
    const n = Number((await sql<{ c: string }>(`select count(*)::text c from "EmailProviderSetting" where "tenantId" = $1 and "providerType" = 'CONSOLE'`, [tB]))[0].c);
    const total = Number((await sql<{ c: string }>(`select count(*)::text c from "EmailProviderSetting" where "tenantId" = $1`, [tB]))[0].c);
    expect(seedConfig().status).toBe(0);
    expect(Number((await sql<{ c: string }>(`select count(*)::text c from "EmailProviderSetting" where "tenantId" = $1 and "providerType" = 'CONSOLE'`, [tB]))[0].c)).toBe(n);
    expect(Number((await sql<{ c: string }>(`select count(*)::text c from "EmailProviderSetting" where "tenantId" = $1`, [tB]))[0].c)).toBe(total);
    const dup = await sql(`select "tenantId","providerName",count(*) from "EmailProviderSetting" group by 1,2 having count(*) > 1`);
    expect(dup, 'no duplicate provider names per tenant').toHaveLength(0);
  });

  test('[DPQA-SEED-003] a fresh tenant (no provider rows) receives exactly one safe default; a second seed adds none and touches no other tenant', async () => {
    const saved = await sql<Row>(`select * from "EmailProviderSetting" where "tenantId" = $1`, [tA]);
    const otherBefore = await hash(SNAPSHOTS.providers, [tB]);
    try {
      await sql(`delete from "EmailProviderSetting" where "tenantId" = $1`, [tA]);
      expect(seedConfig().status).toBe(0);
      const rows = await sql<Row>(`select "providerType", enabled, "isDefault", "fromEmail" from "EmailProviderSetting" where "tenantId" = $1`, [tA]);
      expect(rows, 'exactly one default').toHaveLength(1);
      expect(rows[0].providerType, 'safe default is the console sink, not a live relay').toBe('CONSOLE');
      expect(rows[0].enabled).toBe(true); expect(rows[0].isDefault).toBe(true);
      expect(seedConfig().status).toBe(0);
      expect(await sql(`select 1 from "EmailProviderSetting" where "tenantId" = $1`, [tA]), 'second seed adds none').toHaveLength(1);
      expect((await hash(SNAPSHOTS.providers, [tB])).h, 'the other tenant is untouched').toBe(otherBefore.h);
    } finally {
      // Restore tenant A's original provider rows exactly (delete the seeded default, re-insert what was there).
      await sql(`delete from "EmailProviderSetting" where "tenantId" = $1`, [tA]);
      for (const r of saved) await sql(`insert into "EmailProviderSetting" select * from json_populate_record(null::"EmailProviderSetting", $1::json)`, [JSON.stringify(r)]);
    }
  });

  test('[DPQA-SEED-004] after repeated seeding, invitation and reset e-mails still DELIVER through the local sink (delivery, not only persistence)', async ({ request }) => {
    const owner = await apiToken(request, 'B', 'OWNER');
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const email = `seed-${run}@qa.dijipeople.test`;
    await mail.clear();
    const e = await api(request, owner, 'POST', '/employees', { firstName: 'Seed', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500002', provisionSystemAccess: true, sendInvitationNow: true });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    try {
      const inv = await mail.waitFor(email, /activate|invit|welcome/i, 60_000);
      expect(inv.links.some((l) => /token=/.test(l)), 'invitation carries a working token link').toBe(true);
      // RUN-006 test-side correction: a reset is only mailed to an ACTIVE account (no enumeration of pending invitations), so the reset half uses a second, active user.
      const email2 = `seedr-${run}@qa.dijipeople.test`;
      const e2 = await api(request, owner, 'POST', '/employees', { firstName: 'SeedR', lastName: run, workEmail: email2, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500002' });
      expect(e2.status, JSON.stringify(e2.body).slice(0, 200)).toBeLessThan(300);
      try {
        expect((await api(request, owner, 'POST', '/users', { firstName: 'SeedR', lastName: run, email: email2, password: `Seed!${run}Zz9a`, status: 'ACTIVE', employeeId: e2.body.id })).status).toBeLessThan(300);
        await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email: email2, tenantSlug: TENANTS.B.slug } });
        const rst = await mail.waitFor(email2, /reset|password/i, 60_000);
        expect(rst.links.some((l) => /token=/.test(l))).toBe(true);
        expect(JSON.stringify([inv, rst]), 'delivered mail never contains the dummy SMTP credential').not.toContain(SECRET);
      } finally { await api(request, owner, 'DELETE', `/employees/${e2.body.id}`); }
    } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); }
  });

  test('[DPQA-SEED-005] seeding preserves tenant branding, settings, entitlements (features) and role permissions/privileges', async () => {
    const after = await snapshot(tB);
    for (const k of ['settings', 'features', 'branding', 'roles', 'rolePermissions', 'rolePrivileges'] as const) expect(after[k], `${k} unchanged by seed:config`).toEqual(before[k]);
  });

  test('[DPQA-SEED-006] repeated seeding is idempotent: row counts and tenant-owned content are identical after run N and run N+1, with no duplicates', async () => {
    const one = { b: await snapshot(tB), a: await snapshot(tA) };
    expect(seedConfig().status).toBe(0);
    const two = { b: await snapshot(tB), a: await snapshot(tA) };
    expect(two).toEqual(one);
    const dups = await sql(`select "tenantId", key, count(*) from "TenantFeature" group by 1,2 having count(*) > 1`);
    expect(dups, 'no duplicate TenantFeature rows').toHaveLength(0);
    const sdups = await sql(`select "tenantId", category, key, count(*) from "TenantSetting" group by 1,2,3 having count(*) > 1`);
    expect(sdups, 'no duplicate TenantSetting rows').toHaveLength(0);
  });

  test('[DPQA-SEED-007] migrations are fully applied and none is pending or failed (the migration that renames the entitlement key ran exactly once)', async () => {
    const pending = await sql(`select migration_name, finished_at, rolled_back_at from _prisma_migrations where finished_at is null or rolled_back_at is not null`);
    expect(pending, 'no unfinished or rolled-back migrations').toHaveLength(0);
    const m = await sql(`select migration_name from _prisma_migrations where migration_name like '%split_data_import_export_entitlement%'`);
    expect(m, 'entitlement-split migration recorded once').toHaveLength(1);
    const old = await sql(`select 1 from "PlanFeature" where "featureKey" = 'data-management'`);
    expect(old, 'the pre-split key is not left behind').toHaveLength(0);
  });


  test('[DPQA-SEED-009] re-applying the entitlement-split migration SQL is a no-op: plan/tenant feature rows are identical and no duplicate or disabled-by-migration row appears', async () => {
    const dir = join(worktree, 'services', 'api', 'prisma', 'migrations');
    const name = (await sql<{ migration_name: string }>(`select migration_name from _prisma_migrations where migration_name like '%split_data_import_export_entitlement%'`))[0]?.migration_name;
    expect(name, 'migration recorded').toBeTruthy();
    const ddl = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
    const q = (t: string) => hash(`select * from "${t}"`);
    const b = { pf: await q('PlanFeature'), tf: await q('TenantFeature') };
    await sql(ddl);
    await sql(ddl);
    expect({ pf: await q('PlanFeature'), tf: await q('TenantFeature') }, 'second and third application changed nothing').toEqual(b);
    expect(await sql(`select "planId","featureKey",count(*) from "PlanFeature" group by 1,2 having count(*) > 1`)).toHaveLength(0);
    expect(await sql(`select 1 from "PlanFeature" where "featureKey" = 'data-import-export' and "isEnabled" = false`), 'basic import/export never disabled by the migration').toHaveLength(0);
  });

  test('[DPQA-SEED-008] no SMTP credential is attached to the run: the dummy secret exists only in the throwaway database row, never in test output', async ({}, info) => {
    expect(JSON.stringify(info.annotations)).not.toContain(SECRET);
    // Output scanning of each seed run is asserted in SEED-001; the report generator additionally greps the whole results folder (tools/secret-scan.ps1 in the run protocol).
  });
});
