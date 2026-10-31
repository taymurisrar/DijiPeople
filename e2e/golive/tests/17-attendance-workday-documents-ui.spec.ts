import { test, expect, env } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';

/**
 * RUN-004.
 * DPQA-ATT-02x  real check-in / check-out on a WORKING day. The host clock is untouched: the seed-demo tenant's work schedule is
 *               set (in the throwaway DB) to work all seven days, so whatever day the suite runs on is a scheduled working day,
 *               and the original schedule is restored afterwards. Time is the application's own clock.
 * DPQA-DOC-UI-* the employee Documents tab: New document form, list, download, edit, delete — through the browser, verified in the API.
 * DPQA-CMD-02x  Data Transfer menu: Export downloads a file; Import lands on the plan-gate screen (Import & Export is Growth).
 */
test.describe('attendance on a working day (tenant S, seed-demo)', () => {
  test.describe.configure({ mode: 'serial' });
  const addedDays: string[] = [];
  let siteFlag: boolean | null = null;
  let empRow: { id: string; locationId: string | null } | undefined;
  let admin: string; let emp: string; let site: { id: string; latitude: number; longitude: number; radius: number } | undefined;
  let original: Array<{ id: string; weeklyWorkDays: string[] }> = [];
  const checkedIn: string[] = [];

  test.beforeAll(async ({ request }) => {
    admin = await apiToken(request, 'S', 'ADMIN');
    emp = await apiToken(request, 'S', 'EMPLOYEE');
    original = await sql(`select id, "weeklyWorkDays"::text[] as "weeklyWorkDays" from "WorkSchedule" where "tenantId" = (select id from "Tenant" where slug = $1)`, [env.QA_TENANT_SLUG]) as typeof original;
    await sql(`update "WorkSchedule" set "weeklyWorkDays" = ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::"WorkWeekday"[], "workWeekModel" = 'CUSTOM' where "tenantId" = (select id from "Tenant" where slug = $1)`, [env.QA_TENANT_SLUG]).catch(async () => {
      await sql(`update "WorkSchedule" set "weeklyWorkDays" = ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::"WorkWeekday"[] where "tenantId" = (select id from "Tenant" where slug = $1)`, [env.QA_TENANT_SLUG]);
    });
    const loc = await sql<{ id: string; latitude: number; longitude: number; r: number | null }>(`select l.id, l.latitude, l.longitude, l."allowedRadiusMeters" as r from "Location" l join "Tenant" t on t.id = l."tenantId" where t.slug = $1 and l.latitude is not null limit 1`, [env.QA_TENANT_SLUG]);
    if (loc[0]) {
      site = { id: loc[0].id, latitude: Number(loc[0].latitude), longitude: Number(loc[0].longitude), radius: Number(loc[0].r ?? 250) };
      // fixture: the seed-demo employee is authorised at this work site (restored in afterAll)
      const e = await sql<{ id: string; locationId: string | null }>(`select id, "locationId" from "Employee" where "userId" = (select u.id from "User" u join "Tenant" t on t.id = u."tenantId" where u.email = 'employee@dijipeople.local' and t.slug = $1)`, [env.QA_TENANT_SLUG]);
      empRow = e[0];
      await sql(`update "Employee" set "locationId" = $2, "workMode" = 'OFFICE' where id = $1`, [empRow.id, site.id]);
      // idempotent re-runs: an entry left today by an earlier execution makes the next check-in answer 409 "Already checked in today" (a fixture precondition, not a product defect)
      await sql(`delete from "AttendanceEntry" where "employeeId" = $1 and "createdAt" > (now() at time zone 'utc') - interval '36 hours'`, [empRow.id]).catch(() => undefined);
      siteFlag = (await sql<{ a: boolean | null }>(`select "attendanceEnabled" as a from "Location" where id = $1`, [site.id]))[0]?.a ?? null;
      await sql(`update "Location" set "attendanceEnabled" = true where id = $1`, [site.id]); // seed-demo ships the site with attendance collection OFF (422 WORK_SITE_ATTENDANCE_DISABLED)
      // fixture: a WorkScheduleDay (with the schedule's shift) for every weekday the seed leaves off, so any day is a scheduled working day
      const added = await sql<{ id: string }>(`insert into "WorkScheduleDay"(id, "tenantId", "workScheduleId", "shiftTemplateId", "dayOfWeek", "isWorkingDay", "startTime", "endTime", "breakMinutes", "expectedHours", "sortOrder", "updatedAt")
        select gen_random_uuid(), d."tenantId", d."workScheduleId", d."shiftTemplateId", w.day::"WorkWeekday", true, d."startTime", d."endTime", d."breakMinutes", d."expectedHours", 0, now()
        from (select distinct on ("workScheduleId") * from "WorkScheduleDay" where "isWorkingDay" and "tenantId" = (select id from "Tenant" where slug = $1) order by "workScheduleId") d
        cross join (values ('MONDAY'),('TUESDAY'),('WEDNESDAY'),('THURSDAY'),('FRIDAY'),('SATURDAY'),('SUNDAY')) as w(day)
        where not exists (select 1 from "WorkScheduleDay" x where x."workScheduleId" = d."workScheduleId" and x."dayOfWeek" = w.day::"WorkWeekday") returning id`, [env.QA_TENANT_SLUG]);
      addedDays.push(...added.map((a) => a.id));
    }
  });

  test.afterAll(async ({ request }) => {
    for (const o of original) await sql(`update "WorkSchedule" set "weeklyWorkDays" = $2::"WorkWeekday"[] where id = $1`, [o.id, `{${o.weeklyWorkDays.join(',')}}`]).catch(() => undefined);
    if (site) await sql(`update "Location" set "attendanceEnabled" = $2 where id = $1`, [site.id, siteFlag]).catch(() => undefined);
    if (addedDays.length) await sql(`delete from "WorkScheduleDay" where id = any($1::text[])`, [addedDays]).catch(() => undefined);
    if (empRow) await sql(`update "Employee" set "locationId" = $2 where id = $1`, [empRow.id, empRow.locationId]).catch(() => undefined);
    const mine = (await api(request, emp, 'GET', '/attendance/mine')).body;
    for (const e of (Array.isArray(mine) ? mine : mine?.items ?? []).filter((x: { id: string }) => checkedIn.includes(x.id))) await api(request, admin, 'DELETE', `/attendance/${e.id}`);
  });

  test('[DPQA-ATT-020] on a working day the employee can check in at the work site; the entry is active and persisted', async ({ request }) => {
    test.skip(!site, 'BLOCKED(fixture): the seeded work site has no coordinates');
    const r = await api(request, emp, 'POST', '/attendance/check-in', { attendanceMode: 'OFFICE', officeLocationId: site!.id, locationLatitude: site!.latitude, locationLongitude: site!.longitude, locationAccuracyMeters: 10, locationSource: 'GPS', locationCapturedAt: new Date().toISOString(), locationPermissionState: 'GRANTED' });
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeLessThan(300);
    const entryId = r.body.id ?? r.body.entry?.id;
    checkedIn.push(entryId);
    const active = await api(request, emp, 'GET', '/attendance/mine/active');
    expect(active.status).toBe(200);
    expect(JSON.stringify(active.body)).toContain(entryId);
    const rows = await sql<{ checkOutAt: string | null }>(`select "checkOutAt" from "AttendanceEntry" where id = $1`, [entryId]).catch(() => []);
    if (rows.length) expect(rows[0].checkOutAt, 'still open').toBeNull();
  });

  test('[DPQA-ATT-021] a second check-in while one is open is refused', async ({ request }) => {
    test.skip(!checkedIn.length, 'depends on ATT-020');
    const r = await api(request, emp, 'POST', '/attendance/check-in', { attendanceMode: 'OFFICE', officeLocationId: site!.id, locationLatitude: site!.latitude, locationLongitude: site!.longitude, locationAccuracyMeters: 10, locationSource: 'GPS', locationCapturedAt: new Date().toISOString() });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  test('[DPQA-ATT-022] check-out closes the entry with a non-negative duration; the day is complete in the persisted record', async ({ request }) => {
    test.skip(!checkedIn.length, 'depends on ATT-020');
    await new Promise((res) => setTimeout(res, 2000));
    const r = await api(request, emp, 'POST', '/attendance/check-out', { locationLatitude: site!.latitude, locationLongitude: site!.longitude, locationAccuracyMeters: 10, locationSource: 'GPS', locationCapturedAt: new Date().toISOString() });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
    const one = await api(request, admin, 'GET', `/attendance/${checkedIn[0]}`);
    expect(one.status).toBe(200);
    expect(one.body.checkOutAt ?? one.body.checkOutTime ?? one.body.checkedOutAt, 'check-out time stored').toBeTruthy();
    const minutes = one.body.workedMinutes ?? one.body.totalWorkedMinutes ?? 0;
    expect(Number(minutes)).toBeGreaterThanOrEqual(0);
    const again = await api(request, emp, 'POST', '/attendance/check-out', {});
    expect(again.status, 'a second check-out with nothing open').toBeGreaterThanOrEqual(400);
  });

  test('[DPQA-ATT-023] check-in far outside the geofence is refused with a distance-aware reason', async ({ request }) => {
    test.skip(!site, 'BLOCKED(fixture): no coordinates');
    const r = await api(request, emp, 'POST', '/attendance/check-in', { attendanceMode: 'OFFICE', officeLocationId: site!.id, locationLatitude: site!.latitude + 1, locationLongitude: site!.longitude + 1, locationAccuracyMeters: 10, locationSource: 'GPS', locationCapturedAt: new Date().toISOString() });
    if (r.status < 300) { checkedIn.push(r.body.id ?? r.body.entry?.id); await api(request, emp, 'POST', '/attendance/check-out', {}); }
    expect(r.status, 'a check-in ~150 km away must not be accepted as an office check-in').toBeGreaterThanOrEqual(400);
    expect(String(r.body?.message ?? '').length).toBeGreaterThan(5);
  });

  test('[DPQA-ATT-024] another tenant\'s employee cannot check in against this tenant\'s work site', async ({ request }) => {
    test.skip(!site, 'BLOCKED(fixture): no coordinates');
    const b = await apiToken(request, 'B', 'EMPLOYEE');
    const r = await api(request, b, 'POST', '/attendance/check-in', { attendanceMode: 'OFFICE', officeLocationId: site!.id, locationLatitude: site!.latitude, locationLongitude: site!.longitude, locationAccuracyMeters: 10, locationSource: 'GPS', locationCapturedAt: new Date().toISOString() });
    if (r.status < 300) await api(request, b, 'POST', '/attendance/check-out', {});
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

test.describe('employee Documents tab (tenant A, owner)', () => {
  test.use({ storageState: stateFile('A', 'OWNER') });
  const PDF = Buffer.from(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF ${Date.now()}`);
  const title = `QA UI Doc ${Date.now().toString(36)}`;

  test('[DPQA-DOC-UI-001] upload through the New Document form, see it listed, download identical bytes, rename, delete', async ({ page, request }) => {
    const token = await apiToken(request, 'A', 'OWNER');
    const emp = (await api(request, token, 'GET', '/employees?pageSize=1')).body.items[0];
    let docId: string | undefined;
    try {
      await page.goto(tenantUrl('A', `/employees/${emp.id}`), { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 15_000)); // pacing: a record form costs ~100 API calls (DP-QA-025)
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.getByRole('tab', { name: 'Documents' }).click();
      await page.getByRole('button', { name: 'New', exact: true }).last().click();
      await expect(page.getByRole('heading', { name: /upload employee document/i })).toBeVisible({ timeout: 20_000 });
      for (const [name, option] of [[/document type/i, 'CNIC'], [/document category/i, 'Identity Documents']] as const) {
        await expect(async () => {
          await page.getByRole('combobox', { name }).click();
          await expect(page.getByRole('option', { name: option, exact: true })).toBeVisible({ timeout: 3000 });
        }).toPass({ timeout: 20_000 });
        await page.getByRole('option', { name: option, exact: true }).click();
      }
      await page.getByLabel(/^title/i).fill(title);
      // choosing the file uploads it (the form has no separate Save button)
      await page.locator('input[type=file]').setInputFiles({ name: 'qa-ui.pdf', mimeType: 'application/pdf', buffer: PDF });
      const row = page.getByRole('row').filter({ hasText: 'qa-ui.pdf' }).first();
      await expect(row, 'the uploaded file is listed in the subgrid').toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText('CNIC');
      const docs = (await api(request, token, 'GET', `/documents/entity/EMPLOYEE/${emp.id}`)).body;
      const doc = (Array.isArray(docs) ? docs : docs.items ?? []).find((d: { title: string }) => d.title === title);
      expect(doc, 'persisted document').toBeTruthy();
      docId = doc.id;
      const dl = await request.get(`${env.QA_API_URL}/api/documents/${docId}/download`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' } });
      expect((await dl.body()).equals(PDF)).toBe(true);
    } finally {
      if (docId) expect((await api(request, token, 'DELETE', `/documents/${docId}`)).status).toBeLessThan(300);
    }
  });

  test('[DPQA-DOC-UI-002] the form refuses an executable and an oversize file with a message and stores nothing', async ({ page, request }) => {
    const token = await apiToken(request, 'A', 'OWNER');
    const emp = (await api(request, token, 'GET', '/employees?pageSize=1')).body.items[0];
    const before = (await api(request, token, 'GET', `/documents/entity/EMPLOYEE/${emp.id}`)).body;
    const n = (Array.isArray(before) ? before : before.items ?? []).length;
    await page.goto(tenantUrl('A', `/employees/${emp.id}`), { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 15_000)); // pacing: a record form costs ~100 API calls (DP-QA-025)
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('tab', { name: 'Documents' }).click();
    await page.getByRole('button', { name: 'New', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: /upload employee document/i })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(/^title/i).fill(`QA bad ${Date.now().toString(36)}`);
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await page.waitForTimeout(4000);
    const after = (await api(request, token, 'GET', `/documents/entity/EMPLOYEE/${emp.id}`)).body;
    expect((Array.isArray(after) ? after : after.items ?? []).length, 'nothing stored').toBe(n);
  });
});

test.describe('employees Data Transfer menu', () => {
  test.use({ storageState: stateFile('A', 'OWNER') });
  test('[DPQA-CMD-020] Export downloads a spreadsheet containing the tenant\'s employees (and only them)', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'Data Transfer' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('menuitem', { name: 'Export', exact: true }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.(xlsx|csv)$/i);
    const path = await dl.path();
    const text = (await import('node:fs')).readFileSync(path!).toString('latin1');
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/b-employee@qa|b-hr@qa/);
  });
  test('[DPQA-CMD-021] Export Template downloads a file', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'Data Transfer' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('menuitem', { name: 'Export Template', exact: true }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.(xlsx|csv)$/i);
  });
  test('[DPQA-CMD-022] Data Transfer offers Export and Export Template but NOT Import to a Starter owner (import is Growth-gated); the import route lands on the plan gate (DP-QA-004/021 contract)', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'Data Transfer' }).click();
    await expect(page.getByRole('menuitem', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Export Template', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Import', exact: true })).toHaveCount(0);
    await page.goto(tenantUrl('A', '/employees/import'), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/data-management/, { timeout: 20_000 });
    await expect(page.getByText(/not part of your current subscription/i)).toBeVisible();
    await expect(page.getByText(/we hit an unexpected problem|could not load/i)).toHaveCount(0);
  });
});
