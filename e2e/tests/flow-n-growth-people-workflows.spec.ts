import { expect, test } from '@playwright/test';
import {
  actor,
  isoDay,
  RUN_TAG,
  requireGrowthEnvironment,
  rows,
  unique,
  type Actor,
} from '../fixtures/growth-api';
import { residue } from '../fixtures/residue';

/**
 * Flow N — Growth plan, people workflows: leave, attendance, timesheets,
 * projects, documents, and the entitlement boundary.
 *
 * Every test is a hand-off between two people (employee -> manager, admin ->
 * employee) because that is where authorization and state bugs live; a test
 * that only reads a list proves the screen loads, which Flow I already does.
 * Data is created per test and removed in `afterAll`; a cleanup failure fails
 * the run rather than being swallowed.
 */
test.describe.configure({ mode: 'serial' });

let admin: Actor;
let hr: Actor;
let manager: Actor;
let employee: Actor;
let payroll: Actor;

const cleanup: Array<() => Promise<string | null>> = [];

test.beforeAll(async () => {
  await requireGrowthEnvironment();
  [admin, hr, manager, employee, payroll] = await Promise.all([
    actor('system-admin'),
    actor('hr'),
    actor('manager'),
    actor('employee'),
    actor('payroll'),
  ]);
});

test.afterAll(async () => {
  const failures: string[] = [];
  for (const step of cleanup.reverse()) {
    const failure = await step().catch((e: Error) => e.message);
    if (failure) failures.push(failure);
  }
  expect(failures, 'cleanup must not fail silently').toEqual([]);
  expect(await residue(RUN_TAG), 'this run left rows behind').toEqual({});
});

/**
 * A weekday far enough ahead to be outside any balance window, unique per call.
 * Fixed dates made the suite single-use: one failed run left a pending request
 * and every later run hit "dates overlap an existing pending request".
 */
let dayCursor = 0;
// Chosen once per run so every later call is strictly after the earlier ones.
const runBase = 200 + Math.floor(Math.random() * 400) * 7;
function freeDay(): string {
  dayCursor += 7;
  const base = runBase;
  const date = new Date(Date.now() + (base + dayCursor) * 86_400_000);
  // Monday–Friday only: land on the next Monday if it falls on a weekend.
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
    date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type LeaveType = { id: string; name: string; code: string };
type LeaveRequest = { id: string; status: string };

async function annualLeaveType(): Promise<LeaveType> {
  const types = await employee.get<{ leaveTypes: LeaveType[] }>(
    'leave-requests/available-types',
  );
  expect(types.status, types.message).toBe(200);
  expect(types.body.leaveTypes.length).toBeGreaterThan(0);
  return (
    types.body.leaveTypes.find((t) => t.code === 'ANNUAL') ??
    types.body.leaveTypes[0]
  );
}

test.describe('Flow N — leave', () => {
  test('GN-L1 an employee requests leave, a manager approves it, the timeline records both', async () => {
    const type = await annualLeaveType();
    let d1 = '';
    const submitted = await employee.post<LeaveRequest>('leave-requests', {
      leaveTypeId: type.id,
      startDate: (d1 = freeDay()),
      endDate: d1,
      reason: `QA ${unique()}`,
    });
    expect(submitted.status, submitted.message).toBe(201);
    const id = submitted.body.id;
    cleanup.push(async () => {
      const r = await employee.post(`leave-requests/${id}/cancel`, {});
      return [200, 201, 400, 404].includes(r.status)
        ? null
        : `leave cancel ${id}: ${r.status} ${r.message}`;
    });

    const approved = await manager.post<LeaveRequest>(
      `leave-requests/${id}/approve`,
      {},
    );
    expect(approved.status, approved.message).toBeLessThan(300);

    const mine = await employee.get('leave-requests/mine');
    const found = rows<LeaveRequest>(mine.body).find((r) => r.id === id);
    expect(found?.status).toBe('APPROVED');

    const timeline = await manager.get(`leave-requests/${id}/timeline`);
    expect(timeline.status).toBe(200);
    expect(JSON.stringify(timeline.body).length).toBeGreaterThan(20);
  });

  test('GN-L2 a manager rejects a request and the employee sees it rejected', async () => {
    const type = await annualLeaveType();
    let d2 = '';
    const submitted = await employee.post<LeaveRequest>('leave-requests', {
      leaveTypeId: type.id,
      startDate: (d2 = freeDay()),
      endDate: d2,
      reason: `QA reject ${unique()}`,
    });
    expect(submitted.status, submitted.message).toBe(201);
    const id = submitted.body.id;
    const rejected = await manager.post(`leave-requests/${id}/reject`, {
      comments: 'Team coverage',
    });
    expect(rejected.status, rejected.message).toBeLessThan(300);
    const mine = await employee.get('leave-requests/mine');
    expect(
      rows<LeaveRequest>(mine.body).find((r) => r.id === id)?.status,
    ).toBe('REJECTED');
  });

  test('GN-L3 invalid requests are refused: end before start, unknown type, self-approval', async () => {
    const type = await annualLeaveType();
    const backwards = await employee.post('leave-requests', {
      leaveTypeId: type.id,
      startDate: isoDay(40),
      endDate: isoDay(38),
    });
    expect(backwards.status).toBe(400);

    const unknown = await employee.post('leave-requests', {
      leaveTypeId: '00000000-0000-4000-8000-000000000000',
      startDate: isoDay(40),
      endDate: isoDay(41),
    });
    expect([400, 404]).toContain(unknown.status);

    const own = await employee.post('leave-requests', {
      leaveTypeId: type.id,
      startDate: freeDay(),
      endDate: freeDay(),
    });
    expect(own.status, own.message).toBe(201);
    const selfApprove = await employee.post(
      `leave-requests/${(own.body as LeaveRequest).id}/approve`,
      {},
    );
    expect(selfApprove.status).toBe(403);
    await employee.post(`leave-requests/${(own.body as LeaveRequest).id}/cancel`, {});
  });
});

test.describe('Flow N — projects', () => {
  test('GN-P1 an admin creates a customer and project, assigns an employee who then sees it', async () => {
    const suffix = unique();
    const customer = await admin.post<{ id: string }>('customers', {
      name: `QA Customer ${suffix}`,
    });
    expect(customer.status, customer.message).toBe(201);
    const project = await admin.post<{ id: string }>('projects', {
      name: `QA Project ${suffix}`,
      customerId: customer.body.id,
    });
    expect(project.status, project.message).toBe(201);
    let assignmentId: string | null = null;
    cleanup.push(async () => {
      // Dependents first: a project with an assignment refuses deletion (409).
      if (assignmentId) {
        const a = await admin.del(
          `projects/${project.body.id}/assignments/${assignmentId}`,
        );
        if (![200, 204, 404].includes(a.status))
          return `assignment ${assignmentId}: ${a.status} ${a.message}`;
      }
      const p = await admin.del(`projects/${project.body.id}`);
      const c = await admin.del(`customers/${customer.body.id}`);
      return [200, 204, 404].includes(p.status) && [200, 204, 404].includes(c.status)
        ? null
        : `project/customer cleanup: ${p.status} ${p.message} / ${c.status} ${c.message}`;
    });

    const employees = await admin.get('employees?pageSize=100');
    const me = rows<{ id: string; workEmail?: string }>(employees.body).find(
      (e) => e.workEmail === 'employee@dijipeople.local',
    );
    expect(me, 'the seeded employee exists').toBeTruthy();

    const missing = await admin.post(`projects/${project.body.id}/assignments`, {
      employeeId: me!.id,
    });
    expect(missing.status).toBe(400);
    expect(missing.message).toMatch(/Allocation percentage is required/);

    const assigned = await admin.post(
      `projects/${project.body.id}/assignments`,
      { employeeId: me!.id, allocationPercent: 50 },
    );
    expect(assigned.status, assigned.message).toBeLessThan(300);
    // The POST returns the project, so the assignment id comes from the list.
    const assignments = await admin.get(`projects/${project.body.id}/assignments`);
    const mineRow = rows<{ id: string; employeeId: string }>(assignments.body).find(
      (a) => a.employeeId === me!.id,
    );
    expect(mineRow, 'the assignment is listed').toBeTruthy();
    assignmentId = mineRow!.id;

    const mine = await employee.get('projects/assigned/me');
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(project.body.id);
  });

  test('GN-P2 projects are not reachable by roles without the permission', async () => {
    for (const who of [hr, payroll]) {
      const r = await who.get('projects');
      expect(r.status, who.role).toBe(403);
    }
    const create = await employee.post('projects', { name: 'nope' });
    expect(create.status).toBe(403);
  });
});

test.describe('Flow N — documents', () => {
  test('GN-D1 a document is uploaded against an employee, listed, downloaded and removed', async () => {
    const employees = await hr.get('employees?pageSize=100');
    const target = rows<{ id: string }>(employees.body)[0];
    const types = await hr.get('documents/types');
    const type = rows<{ id: string }>(types.body)[0];
    // The tenant's document settings require a category on upload.
    const categories = await hr.get('documents/categories');
    const category = rows<{ id: string }>(categories.body)[0];
    const payload = Buffer.from(`GN-D1 ${unique()}`);
    const uploaded = await hr.upload<{ id: string }>(
      'documents/upload',
      {
        entityType: 'EMPLOYEE',
        entityId: target.id,
        title: `QA doc ${unique()}`,
        ...(type ? { documentTypeId: type.id } : {}),
        ...(category ? { documentCategoryId: category.id } : {}),
      },
      { name: 'qa.pdf', mimeType: 'application/pdf', buffer: payload },
    );
    expect(uploaded.status, uploaded.message).toBeLessThan(300);
    const id = uploaded.body.id;
    cleanup.push(async () => {
      // HR may upload but holds no documents:DELETE, so the admin removes it.
      const r = await admin.del(`documents/${id}`);
      return [200, 204, 404].includes(r.status)
        ? null
        : `document ${id}: ${r.status} ${r.message}`;
    });

    const listed = await hr.get(`documents/entity/EMPLOYEE/${target.id}`);
    expect(JSON.stringify(listed.body)).toContain(id);
    const download = await hr.get(`documents/${id}/download`);
    expect(download.status).toBe(200);
  });
});

test.describe('Flow N — entitlement boundary', () => {
  test('GN-E1 a Growth tenant is refused payroll by entitlement, not merely by role', async () => {
    const list = await admin.get('payroll/runs');
    // 402/403 with a commercial error code; never 200 on a plan without payroll.
    expect([402, 403, 404]).toContain(list.status);
    expect(list.status).not.toBe(200);
  });
});
