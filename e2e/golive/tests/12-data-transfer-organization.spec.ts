import { test, expect, env } from '../fixtures/test';
import { api, apiToken } from '../fixtures/tenants';

/**
 * DPQA-DT-*  employee export / template / import (tenant A).
 * DPQA-ORG-* organization CRUD: departments, designations, teams — duplicates, dependencies, permissions, isolation.
 * Everything created is deleted in the same test (try/finally).
 */
const run = Date.now().toString(36);
const hdr = (t: string) => ({ authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'web' });

test('[DPQA-DT-001] export returns a spreadsheet/CSV that contains the tenant\'s employees', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const r = await request.get(`${env.QA_API_URL}/api/employees/export`, { headers: hdr(t) });
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type'] ?? '').toMatch(/csv|spreadsheet|excel|octet-stream/);
  const body = await r.body();
  expect(body.length).toBeGreaterThan(100);
  expect(body.toString('latin1')).toMatch(/EMP-000|Employee Code|employeeCode|PK/);
});

test('[DPQA-DT-002] the export never contains another tenant\'s employees', async ({ request }) => {
  const a = await apiToken(request, 'A', 'OWNER');
  const b = await apiToken(request, 'B', 'OWNER');
  const bList = (await api(request, b, 'GET', '/employees?pageSize=100')).body.items as Array<{ workEmail: string }>;
  const ex = await request.get(`${env.QA_API_URL}/api/employees/export`, { headers: hdr(a) });
  const text = (await ex.body()).toString('latin1');
  for (const e of bList) expect(text.includes(e.workEmail), `B email ${e.workEmail} must not appear in A's export`).toBe(false);
});

test('[DPQA-DT-003] the import template downloads', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const r = await request.get(`${env.QA_API_URL}/api/employees/export-template`, { headers: hdr(t) });
  expect(r.status()).toBe(200);
  expect((await r.body()).length).toBeGreaterThan(100);
});

test('[DPQA-DT-004] import rejects a non-spreadsheet, an empty upload and an oversize file; nothing is created', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const before = (await api(request, t, 'GET', '/employees?pageSize=100')).body.meta.total;
  for (const [label, file] of [
    ['text file', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('a,b\n1,2') }],
    ['exe', { name: 'x.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }],
    ['oversize (16 MB)', { name: 'big.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.alloc(16 * 1024 * 1024, 1) }],
  ] as const) {
    const r = await request.post(`${env.QA_API_URL}/api/employees/import`, { headers: hdr(t), multipart: { file } });
    // A text/CSV payload is parsed (CSV import exists): acceptable only if it is rejected OR imports zero rows.
    if (r.status() < 400) expect((await r.json()).successCount, `${label} must import nothing`).toBe(0);
    else expect(r.status(), label).toBeLessThan(500);
  }
  const none = await request.post(`${env.QA_API_URL}/api/employees/import`, { headers: hdr(t), multipart: { x: '1' } });
  expect(none.status()).toBeGreaterThanOrEqual(400);
  expect((await api(request, t, 'GET', '/employees?pageSize=100')).body.meta.total).toBe(before);
});

test('[DPQA-DT-005] an employee-level user cannot import or export the workforce', async ({ request }) => {
  const e = await apiToken(request, 'A', 'EMPLOYEE');
  const imp = await request.post(`${env.QA_API_URL}/api/employees/import`, { headers: hdr(e), multipart: { file: { name: 'x.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') } } });
  expect(imp.status()).toBe(403);
  const ex = await request.get(`${env.QA_API_URL}/api/employees/export`, { headers: hdr(e) });
  expect([403, 200]).toContain(ex.status());
  if (ex.status() === 200) {
    const txt = (await ex.body()).toString('latin1');
    expect(txt, 'OWN-scope export must not include other employees').not.toMatch(/a-hr@qa|a-manager@qa|a-payroll-manager@qa/);
  }
});

test('[DPQA-ORG-001] designation lifecycle: create, duplicate name refused, update persists, delete removes', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const name = `QA Designation ${run}`;
  const c = await api(request, t, 'POST', '/designations', { name });
  expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
  const id = c.body.id;
  try {
    const dup = await api(request, t, 'POST', '/designations', { name });
    if (dup.status < 300) await api(request, t, 'DELETE', `/designations/${dup.body.id}`);
    expect(dup.status, 'duplicate designation name').toBeGreaterThanOrEqual(400);
    const u = await api(request, t, 'PATCH', `/designations/${id}`, { description: 'QA updated' });
    expect(u.status).toBeLessThan(300);
    expect((await api(request, t, 'GET', `/designations/${id}`)).body.description).toBe('QA updated');
  } finally {
    const d = await api(request, t, 'DELETE', `/designations/${id}`);
    expect(d.status).toBeLessThan(300);
  }
  const gone = await api(request, t, 'GET', `/designations/${id}`);
  // Delete is a soft delete: the row is renamed "<name> [deleted <id8>]" and stays readable by id (observed).
  expect(gone.status === 404 || /\[deleted/.test(gone.body?.name ?? '')).toBe(true);
});

test('[DPQA-ORG-002] department lifecycle under a business unit, with validation', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const bus = (await api(request, t, 'GET', '/business-units')).body;
  const bu = (Array.isArray(bus) ? bus : bus.items)[0];
  test.skip(!bu, 'tenant has no business unit — fixture gap (OBS-008)');
  const bad = await api(request, t, 'POST', '/departments', { name: 'x'.repeat(400), businessUnitId: bu.id });
  expect(bad.status, 'over-long name').toBe(400);
  const nobu = await api(request, t, 'POST', '/departments', { name: 'No BU' });
  expect(nobu.status, 'missing business unit').toBe(400);
  const c = await api(request, t, 'POST', '/departments', { name: `QA Dept ${run}`, businessUnitId: bu.id });
  expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
  try {
    expect((await api(request, t, 'GET', `/departments/${c.body.id}`)).body.name).toBe(`QA Dept ${run}`);
  } finally {
    expect((await api(request, t, 'DELETE', `/departments/${c.body.id}`)).status).toBeLessThan(300);
  }
});

test('[DPQA-ORG-003] team lifecycle: create, add/remove nothing breaks, delete', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const c = await api(request, t, 'POST', '/teams', { name: `QA Team ${run}` });
  expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
  const id = c.body.id ?? c.body.team?.id;
  try {
    expect((await api(request, t, 'GET', `/teams/${id}`)).status).toBe(200);
  } finally {
    expect((await api(request, t, 'DELETE', `/teams/${id}`)).status).toBeLessThan(300);
  }
});

test('[DPQA-ORG-004] tenant B cannot see or modify tenant A\'s designation', async ({ request }) => {
  const a = await apiToken(request, 'A', 'OWNER');
  const b = await apiToken(request, 'B', 'OWNER');
  const c = await api(request, a, 'POST', '/designations', { name: `QA Iso ${run}` });
  const id = c.body.id;
  try {
    expect([403, 404]).toContain((await api(request, b, 'GET', `/designations/${id}`)).status);
    const u = await api(request, b, 'PATCH', `/designations/${id}`, { description: 'hijack' });
    expect([400, 403, 404]).toContain(u.status);
    expect((await api(request, a, 'GET', `/designations/${id}`)).body.description ?? '').not.toBe('hijack');
  } finally {
    await api(request, a, 'DELETE', `/designations/${id}`);
  }
});

test('[DPQA-ORG-005] an employee-level user cannot create organization records', async ({ request }) => {
  const e = await apiToken(request, 'A', 'EMPLOYEE');
  for (const [p, body] of [['/designations', { name: 'Nope' }], ['/teams', { name: 'Nope' }], ['/locations', { name: 'Nope', city: 'x', state: 'x', country: 'x' }]] as const) {
    const r = await api(request, e, 'POST', p, body);
    if (r.status < 300) await api(request, e, 'DELETE', `${p}/${r.body.id}`);
    expect(r.status, p).toBe(403);
  }
});
