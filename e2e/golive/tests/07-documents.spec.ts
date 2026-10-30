import { test, expect, env } from '../fixtures/test';
import { api, apiToken } from '../fixtures/tenants';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-DOC-*: document upload, retrieval, restrictions and isolation in tenant A. Deleted again in afterAll; failures of
 * cleanup are reported. Storage is a local directory in QA (FILE_STORAGE_DIR) — no R2/S3 is contacted.
 */


let categoryId: string; let typeId: string | undefined;
let owner: string; let employeeId: string; let b: string;
const created: string[] = [];

const upload = (request: APIRequestContext, token: string, file: { name: string; mimeType: string; buffer: Buffer }, fields: Record<string, string> = {}) =>
  request.post(`${env.QA_API_URL}/api/documents/upload`, {
    headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' },
    multipart: { entityType: 'EMPLOYEE', entityId: employeeId, title: 'QA doc', documentCategoryId: categoryId, ...(typeId ? { documentTypeId: typeId } : {}), ...fields, file },
  });

test.beforeAll(async ({ request }) => {
  owner = await apiToken(request, 'A', 'OWNER');
  b = await apiToken(request, 'B', 'OWNER');
  categoryId = (await api(request, owner, 'GET', '/documents/categories')).body[0].id;
  const types = (await api(request, owner, 'GET', '/documents/types')).body;
  typeId = Array.isArray(types) ? types[0]?.id : undefined;
  employeeId = (await api(request, owner, 'GET', '/employees?pageSize=1')).body.items[0].id;
});

test.afterAll(async ({ request }) => {
  const bad: string[] = [];
  for (const id of created) {
    const r = await api(request, owner, 'DELETE', `/documents/${id}`);
    if (![200, 204].includes(r.status)) bad.push(`${id}:${r.status}`);
  }
  expect(bad, 'document cleanup').toEqual([]);
});

test('[DPQA-DOC-001] upload a small text file; metadata and bytes round-trip', async ({ request }) => {
  // Plain .txt is refused ('Uploaded file type is not supported' — a type allowlist exists, which is good). Minimal valid PDF instead.
  const content = Buffer.from(`%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj
trailer<</Root 1 0 R>>
%%EOF ${Date.now()}`);
  const r = await upload(request, owner, { name: 'qa-note.pdf', mimeType: 'application/pdf', buffer: content });
  const body = await r.json();
  expect(r.status(), JSON.stringify(body).slice(0, 300)).toBeLessThan(300);
  created.push(body.id);
  const meta = await api(request, owner, 'GET', `/documents/${body.id}`);
  expect(meta.status).toBe(200);
  const dl = await request.get(`${env.QA_API_URL}/api/documents/${body.id}/download`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
  expect(dl.status()).toBe(200);
  expect((await dl.body()).equals(content)).toBe(true);
  const list = await api(request, owner, 'GET', `/documents/entity/EMPLOYEE/${employeeId}`);
  expect(JSON.stringify(list.body)).toContain(body.id);
});

test('[DPQA-DOC-002] an oversize file (> 10 MB) is rejected and nothing is stored', async ({ request }) => {
  const before = (await api(request, owner, 'GET', '/documents?pageSize=100')).body.meta.total;
  const r = await upload(request, owner, { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 1) });
  expect([400, 413]).toContain(r.status());
  const after = (await api(request, owner, 'GET', '/documents?pageSize=100')).body.meta.total;
  expect(after).toBe(before);
});

test('[DPQA-DOC-003] an upload without a file is rejected', async ({ request }) => {
  const r = await request.post(`${env.QA_API_URL}/api/documents/upload`, {
    headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' },
    multipart: { entityType: 'EMPLOYEE', entityId: employeeId, title: 'no file' },
  });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(r.status()).toBeLessThan(500);
});

for (const [id, name, mime, why] of [
  ['004', 'payload.exe', 'application/x-msdownload', 'executable'],
  ['005', 'page.html', 'text/html', 'active HTML'],
  ['006', 'image.svg', 'image/svg+xml', 'SVG with script'],
] as const) {
  test(`[DPQA-DOC-${id}] ${why} upload is refused or neutralised (DP-QA-009 if accepted and served inline)`, async ({ request }) => {
    const body = name.endsWith('.svg') ? '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' : name.endsWith('.html') ? '<script>alert(1)</script>' : 'MZ-binary';
    const r = await upload(request, owner, { name, mimeType: mime, buffer: Buffer.from(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status() < 300) {
      created.push(j.id);
      // Accepted: it must at minimum never be served inline as active content.
      const view = await request.get(`${env.QA_API_URL}/api/documents/${j.id}/view`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
      const disp = view.headers()['content-disposition'] ?? '';
      const ctype = view.headers()['content-type'] ?? '';
      expect(`${disp}|${ctype}|${view.headers()['x-content-type-options'] ?? ''}`, `${why} accepted: served as ${ctype}`).toMatch(/attachment|nosniff|octet-stream/);
    } else {
      expect(r.status()).toBeLessThan(500);
    }
  });
}

test('[DPQA-DOC-007] a path-traversal filename cannot escape the storage directory', async ({ request }) => {
  const r = await upload(request, owner, { name: '../../../evil.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  const j = await r.json().catch(() => ({}));
  if (r.status() < 300) {
    created.push(j.id);
    expect(JSON.stringify(j)).not.toContain('..');
  } else expect(r.status()).toBeLessThan(500);
});

test('[DPQA-DOC-008] tenant B cannot read, download or delete a tenant A document', async ({ request }) => {
  const id = created[0];
  test.skip(!id, 'depends on DOC-001');
  for (const [m, p] of [['GET', `/documents/${id}`], ['GET', `/documents/${id}/download`], ['DELETE', `/documents/${id}`]] as const) {
    const r = await api(request, b, m, p);
    const outcome = r.status === 200 && m === 'DELETE' ? (r.body?.deletedCount ?? 0) : r.status;
    expect(outcome === 0 || [403, 404].includes(outcome), `${m} ${p} -> ${r.status}`).toBe(true);
  }
  const still = await api(request, owner, 'GET', `/documents/${id}`);
  expect(still.status).toBe(200);
});

test('[DPQA-DOC-009] an unauthenticated download is refused', async ({ request }) => {
  const id = created[0];
  test.skip(!id, 'depends on DOC-001');
  const r = await request.get(`${env.QA_API_URL}/api/documents/${id}/download`);
  expect(r.status()).toBe(401);
});

test('[DPQA-DOC-010] delete removes the document and its bytes are no longer retrievable', async ({ request }) => {
  const id = created.shift();
  test.skip(!id, 'depends on DOC-001');
  const d = await api(request, owner, 'DELETE', `/documents/${id}`);
  expect(d.status).toBeLessThan(300);
  const g = await request.get(`${env.QA_API_URL}/api/documents/${id}/download`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
  expect([404, 410]).toContain(g.status());
});
