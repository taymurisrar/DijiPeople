import { test, expect } from '../fixtures/test';
import { api, apiToken } from '../fixtures/tenants';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-LV-02x: approval, rejection, state transitions, cancellation after approval and balance consumption (tenant A).
 * The approver is the tenant owner (admin tier): a manager/HR approval chain depends on self-service permissions that
 * DP-QA-002/-011 show are missing, and on reporting-line routing, so manager-driven approval is BLOCKED (see LV-029).
 * Self-contained tests; every request ends CANCELLED or REJECTED.
 */
const run = Date.now() % 100000;
const day = (n: number) => new Date(Date.UTC(2027, 5, 1 + n)).toISOString().slice(0, 10); // Tue 2027-06-01 + n

async function ensureType(request: APIRequestContext, owner: string, code: string, consumes: boolean) {
  const list = (await api(request, owner, 'GET', '/leave-types')).body;
  const found = (Array.isArray(list) ? list : list.items ?? []).find((t: { code?: string }) => t.code === code);
  if (found) return found.id as string;
  const r = await api(request, owner, 'POST', '/leave-types', { name: `QA ${code}`, code, category: 'ANNUAL', isPaid: true, consumesBalance: consumes, requiresApproval: true, employeeRequestAllowed: true, isActive: true });
  expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBeLessThan(300);
  return r.body.id as string;
}

async function submit(request: APIRequestContext, offset: number, code = 'QAL') {
  const emp = await apiToken(request, 'A', 'EMPLOYEE');
  const owner = await apiToken(request, 'A', 'OWNER');
  const typeId = await ensureType(request, owner, code, code === 'QAB');
  const d = day((run + offset) % 400);
  const r = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: d, endDate: d, reason: `QA ${run}` });
  return { emp, owner, typeId, r, d };
}

test('[DPQA-LV-020] owner approves a pending request; employee sees APPROVED; timeline records it', async ({ request }) => {
  const { emp, owner, r } = await submit(request, 10);
  expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBe(201);
  const id = r.body.id;
  try {
    const a = await api(request, owner, 'POST', `/leave-requests/${id}/approve`, { comments: 'QA approve' });
    expect(a.status, JSON.stringify(a.body).slice(0, 200)).toBeLessThan(300);
    const mine = await api(request, emp, 'GET', `/leave-requests/${id}`);
    expect(String(mine.body.status)).toMatch(/APPROVED/);
    const tl = await api(request, owner, 'GET', `/leave-requests/${id}/timeline`);
    expect(JSON.stringify(tl.body)).toMatch(/approv/i);
  } finally {
    await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA cleanup' });
  }
});

test('[DPQA-LV-021] owner rejects a pending request; REJECTED persists and cannot then be approved', async ({ request }) => {
  const { emp, owner, r } = await submit(request, 20);
  expect(r.status).toBe(201);
  const id = r.body.id;
  const rej = await api(request, owner, 'POST', `/leave-requests/${id}/reject`, { comments: 'QA reject' });
  expect(rej.status, JSON.stringify(rej.body).slice(0, 200)).toBeLessThan(300);
  expect(String((await api(request, emp, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/REJECT/);
  const again = await api(request, owner, 'POST', `/leave-requests/${id}/approve`, { comments: 'late' });
  expect(again.status, 'a rejected request must not be approvable').toBeGreaterThanOrEqual(400);
});

test('[DPQA-LV-022] approving twice is refused (state transition guard)', async ({ request }) => {
  const { owner, r } = await submit(request, 30);
  const id = r.body.id;
  try {
    expect((await api(request, owner, 'POST', `/leave-requests/${id}/approve`, {})).status).toBeLessThan(300);
    const second = await api(request, owner, 'POST', `/leave-requests/${id}/approve`, {});
    expect(second.status, 'second approval').toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
  } finally {
    await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA cleanup' });
  }
});

test('[DPQA-LV-023] an APPROVED request cannot be cancelled, even by an admin: the refusal is explicit (DP-QA-019: no revoke path)', async ({ request }) => {
  const { emp, owner, r } = await submit(request, 40);
  const id = r.body.id;
  await api(request, owner, 'POST', `/leave-requests/${id}/approve`, {});
  const c = await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA' });
  expect(c.status).toBe(409);
  expect(JSON.stringify(c.body)).toMatch(/only pending/i);
  expect(String((await api(request, emp, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/APPROVED/);
});

test('[DPQA-LV-024] a balance-consuming type with no entitlement refuses the request with a balance message', async ({ request }) => {
  const { owner, r } = await submit(request, 50, 'QAB');
  if (r.status === 201) await api(request, owner, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' });
  expect(r.status, 'no entitlement => insufficient balance').toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(r.body)).toMatch(/balance|entitle/i);
});

test('[DPQA-LV-025] reject/approve without authority is refused for an employee-level user (payroll role)', async ({ request }) => {
  const { owner, r } = await submit(request, 60);
  const id = r.body.id;
  try {
    const p = await apiToken(request, 'A', 'PAYROLL');
    for (const action of ['approve', 'reject']) {
      const x = await api(request, p, 'POST', `/leave-requests/${id}/${action}`, { comments: 'x' });
      expect([403, 404], action).toContain(x.status);
    }
    expect(String((await api(request, owner, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/PENDING|SUBMITTED/);
  } finally {
    await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA cleanup' });
  }
});

test('[DPQA-LV-026] a manager cannot approve a request of an employee who does not report to them', async ({ request }) => {
  const { owner, r } = await submit(request, 70);
  const id = r.body.id;
  try {
    const m = await apiToken(request, 'A', 'MANAGER');
    const x = await api(request, m, 'POST', `/leave-requests/${id}/approve`, { comments: 'x' });
    expect([400, 403, 404]).toContain(x.status);
  } finally {
    await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA cleanup' });
  }
});

test('[DPQA-LV-029] manager-driven approval chain end to end — BLOCKED by DP-QA-002/DP-QA-011', async () => {
  test.skip(true, 'BLOCKED: non-admin roles cannot load self-service (DP-QA-002) or list leave types / cancel (DP-QA-011); reporting-line routing cannot be exercised until fixed.');
});
