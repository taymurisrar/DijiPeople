import { test, expect } from '../fixtures/test';
import { api, apiToken, credentials } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-LV-02x: approval, rejection, state transitions, cancellation after approval and balance consumption (tenant A).
 * The approver is the tenant owner (admin tier): a manager/HR approval chain depends on self-service permissions that
 * DP-QA-002/-011 show are missing, and on reporting-line routing, so manager-driven approval is BLOCKED (see LV-029).
 * Self-contained tests; every request ends CANCELLED or REJECTED.
 */
const run = Date.now() % 100000;
const day = (n: number) => new Date(Date.UTC(2040, 5, 1 + n)).toISOString().slice(0, 10); // far future, clear of earlier approved fixtures

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
  const d = day((run * 11 + offset * 17) % 3000);
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

test('[DPQA-LV-023] an APPROVED future request can be cancelled through the approved workflow: it ends CANCELLED, a second cancel is refused, and it stays cancelled (DP-QA-019 contract change: cancellation allowed)', async ({ request }) => {
  const { emp, owner, r } = await submit(request, 40);
  const id = r.body.id;
  expect((await api(request, owner, 'POST', `/leave-requests/${id}/approve`, {})).status).toBeLessThan(300);
  const c = await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA approved-cancel workflow' });
  expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
  expect(String((await api(request, emp, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/CANCEL/);
  const again = await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA second cancel' });
  expect(again.status, 'cancelling twice is refused, never a 5xx').toBeGreaterThanOrEqual(400);
  expect(again.status).toBeLessThan(500);
  expect(String((await api(request, emp, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/CANCEL/);
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

test('[DPQA-LV-029] manager-driven approval chain: refused outside the reporting line, allowed once the employee reports to the manager, employee sees APPROVED, state persisted (DP-QA-018 positive path)', async ({ request }) => {
  const { emp, owner, r } = await submit(request, 80);
  expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBe(201);
  const id = r.body.id;
  const idOf = async (email: string) => (await sql<{ id: string }>(`select e.id from "Employee" e join "User" u on u.id = e."userId" where u.email = $1`, [email]))[0].id;
  const empId = await idOf(credentials('A', 'EMPLOYEE').email);
  const mgrId = await idOf(credentials('A', 'MANAGER').email);
  const before = (await sql<{ managerEmployeeId: string | null }>(`select "managerEmployeeId" from "Employee" where id = $1`, [empId]))[0].managerEmployeeId;
  const mgr = await apiToken(request, 'A', 'MANAGER');
  try {
    await api(request, owner, 'PATCH', `/employees/${empId}/reporting-manager`, { reportingManagerEmployeeId: null });
    const outside = await api(request, mgr, 'POST', `/leave-requests/${id}/approve`, { comments: 'outside the line' });
    expect([400, 403, 404], 'outside the reporting line').toContain(outside.status);
    const assign = await api(request, owner, 'PATCH', `/employees/${empId}/reporting-manager`, { reportingManagerEmployeeId: mgrId });
    expect(assign.status, JSON.stringify(assign.body).slice(0, 200)).toBeLessThan(300);
    const approve = await api(request, mgr, 'POST', `/leave-requests/${id}/approve`, { comments: 'in my line' });
    expect(approve.status, JSON.stringify(approve.body).slice(0, 200)).toBeLessThan(300);
    expect(String((await api(request, emp, 'GET', `/leave-requests/${id}`)).body.status)).toMatch(/APPROVED/);
    const rows = await sql<{ status: string }>(`select status::text as status from "LeaveRequest" where id = $1`, [id]);
    expect(rows[0]?.status, 'persisted status').toMatch(/APPROVED/);
  } finally {
    await api(request, owner, 'POST', `/leave-requests/${id}/cancel`, { reason: 'QA cleanup' });
    await api(request, owner, 'PATCH', `/employees/${empId}/reporting-manager`, { reportingManagerEmployeeId: before });
  }
});
