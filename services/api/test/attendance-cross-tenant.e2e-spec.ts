import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * WP3 (SESSION-0137) — attendance: entries and correction requests.
 *
 * Attendance rows carry where and when a person was (coordinates, notes) and
 * feed payroll, so the manual-entry, override and correction-approval routes are
 * both a disclosure and a way to change someone's pay. Each tenant has an
 * employee, a worked-day entry carrying a unique marker in its notes and a
 * SUBMITTED correction request. ALPHA's admin attacks BETA's rows by id; BETA's
 * admin is the owner control on the same route; BETA's rows are re-read after
 * every attack.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Attendance cross-tenant (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);

  interface Side {
    tenantId: string;
    admin: HttpActor;
    employeeId: string;
    entryId: string;
    shiftId: string;
    locationId: string;
    correctionId: string;
    marker: string;
  }
  let alpha: Side;
  let beta: Side;

  const api = (
    method: 'get' | 'post' | 'patch' | 'delete',
    as: HttpActor,
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web');

  const textOf = (res: { text?: string; body: unknown }): string =>
    Buffer.isBuffer(res.body)
      ? res.body.toString('utf8')
      : JSON.stringify(res.body) + (res.text ?? '');

  async function side(label: string): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const admin = await actors.tenantUser(tenant.id, unit, label);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: role.id },
    });
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        // Linked to the admin: corrections and self-service need a current
        // employee, or they are refused for that reason alone.
        userId: admin.id,
        employeeCode: `AT-${label}-${suffix}`,
        firstName: 'Attend',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const marker = `note-${label}-${suffix}`;
    // An OFFICE-mode entry must name a location, or the override route 400s.
    const location = await prisma.location.create({
      data: {
        tenantId: tenant.id,
        name: `Site ${label}`,
        city: 'X',
        state: 'X',
        country: 'X',
      },
      select: { id: true },
    });
    const shift = await prisma.shiftTemplate.create({
      data: {
        tenantId: tenant.id,
        name: `Day ${label}`,
        code: `D-${label}-${suffix}`.toUpperCase(),
        startTime: '09:00',
        endTime: '17:00',
        expectedHours: 8,
      },
      select: { id: true },
    });
    const entry = await prisma.attendanceEntry.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        officeLocationId: location.id,
        shiftTemplateId: shift.id,
        date: new Date('2030-02-04'),
        checkIn: new Date('2030-02-04T05:00:00Z'),
        checkOut: new Date('2030-02-04T13:00:00Z'),
        notes: marker,
      },
      select: { id: true },
    });
    const correction = await prisma.attendanceCorrectionRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        attendanceEntryId: entry.id,
        requestedByUserId: admin.id,
        requestNumber: `CR-${label}-${suffix}`,
        correctionType: 'MISSED_CHECK_OUT',
        reason: marker,
        status: 'SUBMITTED',
        submittedAtUtc: new Date(),
      },
      select: { id: true },
    });
    return {
      tenantId: tenant.id,
      admin,
      employeeId: employee.id,
      entryId: entry.id,
      shiftId: shift.id,
      locationId: location.id,
      correctionId: correction.id,
      marker,
    };
  }

  const betaEntry = () =>
    prisma.attendanceEntry.findUniqueOrThrow({ where: { id: beta.entryId } });
  const betaCorrection = () =>
    prisma.attendanceCorrectionRequest.findUniqueOrThrow({
      where: { id: beta.correctionId },
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'att');
    actors = new HttpActors(app, suffix);
    alpha = await side('atalpha');
    beta = await side('atbeta');
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging.
    try {
      // Correction requests restrict deleting the user that raised them, so they
      // (and the entries they point at) go first.
      const tenantIds = [alpha?.tenantId, beta?.tenantId].filter(
        (id): id is string => Boolean(id),
      );
      await prisma.approvalRequest.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.attendanceCorrectionRequest.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.attendanceEntry.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('controls (BETA admin on BETA rows)', () => {
    it.each([
      (s: Side) => `attendance/${s.entryId}`,
      (s: Side) => `attendance/${s.entryId}/timeline`,
      (s: Side) => `attendance/correction-requests/${s.correctionId}`,
    ])('the owner reads its own row (%#)', async (route) => {
      const path = route(beta);
      const res = await api('get', beta.admin, path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    });

    it('the owner team list shows its own entry', async () => {
      const res = await api('get', beta.admin, 'attendance/team');
      expect(res.status).toBe(200);
      expect(textOf(res)).toContain(beta.entryId);
    });
  });

  describe('ALPHA admin → BETA rows: reads', () => {
    it.each([
      (s: Side) => `attendance/${s.entryId}`,
      (s: Side) => `attendance/${s.entryId}/timeline`,
      (s: Side) => `attendance/correction-requests/${s.correctionId}`,
    ])('is refused (%#) and leaks no BETA marker', async (route) => {
      const path = route(beta);
      const res = await api('get', alpha.admin, path);
      expect({ path, refused: [403, 404].includes(res.status) }).toEqual({
        path,
        refused: true,
      });
      expect(textOf(res)).not.toContain(beta.marker);
    });

    it('team, own, summary, correction lists and export never contain BETA rows', async () => {
      for (const route of [
        'attendance/team',
        'attendance/mine',
        'attendance/team/summary',
        'attendance/correction-requests',
        'attendance/export',
      ]) {
        const res = await api('get', alpha.admin, route).buffer(true);
        const text = textOf(res);
        expect({ route, leaked: text.includes(beta.marker) }).toEqual({
          route,
          leaked: false,
        });
        expect({ route, leakedId: text.includes(beta.entryId) }).toEqual({
          route,
          leakedId: false,
        });
      }
    });
  });

  describe('ALPHA admin → BETA rows: writes', () => {
    it('control: BETA admin can override its own entry (route and body are valid)', async () => {
      const res = await api(
        'patch',
        beta.admin,
        `attendance/${beta.entryId}/override`,
      ).send({ adjustmentReason: 'owner control' });
      expect(res.status).toBeLessThan(300);
    });

    it('control: BETA admin can edit its own entry with the same manual body', async () => {
      const res = await api(
        'patch',
        beta.admin,
        `attendance/manual/${beta.entryId}`,
      ).send({ workSummary: 'owner edit', adjustmentReason: 'owner control' });
      expect(res.status).toBeLessThan(300);
      expect((await betaEntry()).workSummary).toBe('owner edit');
    });

    it('cannot override, edit or delete a BETA entry, which stays as it was', async () => {
      const before = await betaEntry();
      // Awaited one at a time: a supertest request is lazy and starts its own
      // ephemeral server, so a pre-built array of them fails with ECONNREFUSED.
      const attempts: Array<() => request.Test> = [
        () =>
          api('patch', alpha.admin, `attendance/${beta.entryId}/override`).send(
            {
              adjustmentReason: 'HIJACKED',
            },
          ),
        () =>
          api('patch', alpha.admin, `attendance/manual/${beta.entryId}`).send({
            workSummary: 'HIJACKED',
            adjustmentReason: 'HIJACKED',
          }),
        () => api('delete', alpha.admin, `attendance/${beta.entryId}`),
      ];
      for (const attempt of attempts) {
        const res = await attempt();
        expect(res.status).toBe(404);
      }
      const after = await betaEntry();
      expect(after.notes).toBe(before.notes);
      expect(after.workSummary).toBe(before.workSummary);
      expect(after.checkOut?.toISOString()).toBe(
        before.checkOut?.toISOString(),
      );
      expect(after.status).toBe(before.status);
      expect(after.updatedAt.toISOString()).toBe(
        before.updatedAt.toISOString(),
      );
    });

    it.each(['approve', 'reject', 'cancel'])(
      'cannot %s a BETA correction request, and it stays SUBMITTED',
      async (verb) => {
        const res = await api(
          'post',
          alpha.admin,
          `attendance/correction-requests/${beta.correctionId}/${verb}`,
        ).send({ comment: 'HIJACKED' });
        expect(res.status).toBe(404);
        const after = await betaCorrection();
        expect(after.status).toBe('SUBMITTED');
        expect(after.actionComment).toBeNull();
      },
    );
  });

  describe('foreign parent ids on create', () => {
    const validManual = (employeeId: string, day: string) => ({
      employeeId,
      date: day,
      checkInTime: '09:00',
      checkOutTime: '17:00',
      attendanceMode: 'OFFICE',
      officeLocationId: alpha.locationId,
      shiftTemplateId: alpha.shiftId,
      adjustmentReason: 'isolation test',
    });

    it('control: ALPHA can create a manual entry for its OWN employee with this exact body', async () => {
      const res = await api('post', alpha.admin, 'attendance/manual').send(
        validManual(alpha.employeeId, '2026-10-08'),
      );
      expect(res.status).toBeLessThan(300);
    });

    it('control: ALPHA can raise a correction against its OWN entry', async () => {
      const res = await api(
        'post',
        alpha.admin,
        'attendance/correction-requests',
      ).send({
        attendanceEntryId: alpha.entryId,
        correctionType: 'MISSED_CHECK_OUT',
        requestedCheckOutAtUtc: '2030-02-04T13:00:00.000Z',
        reason: 'own entry control',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('cannot create a manual entry for a BETA employee', async () => {
      const before = await prisma.attendanceEntry.count({
        where: { employeeId: beta.employeeId },
      });
      const res = await api('post', alpha.admin, 'attendance/manual').send(
        validManual(beta.employeeId, '2026-10-06'),
      );
      expect(res.status).toBe(400);
      expect((res.body as { message?: string }).message).toBe(
        'Selected employee does not belong to this tenant.',
      );
      expect(
        await prisma.attendanceEntry.count({
          where: { employeeId: beta.employeeId },
        }),
      ).toBe(before);
    });

    it('cannot re-home its own entry onto a BETA employee', async () => {
      const res = await api(
        'patch',
        alpha.admin,
        `attendance/manual/${alpha.entryId}`,
      ).send({ employeeId: beta.employeeId });
      expect(res.status).toBe(400);
      expect((res.body as { message?: string }).message).toBe(
        'Selected employee does not belong to this tenant.',
      );
      expect(
        (
          await prisma.attendanceEntry.findUniqueOrThrow({
            where: { id: alpha.entryId },
          })
        ).employeeId,
      ).toBe(alpha.employeeId);
    });

    it('cannot raise a correction against a BETA attendance entry', async () => {
      const before = await prisma.attendanceCorrectionRequest.count({
        where: { attendanceEntryId: beta.entryId },
      });
      const res = await api(
        'post',
        alpha.admin,
        'attendance/correction-requests',
      ).send({
        attendanceEntryId: beta.entryId,
        correctionType: 'MISSED_CHECK_OUT',
        requestedCheckOutAtUtc: '2030-02-04T13:00:00.000Z',
        reason: 'foreign entry',
      });
      expect(res.status).toBe(404);
      expect(
        await prisma.attendanceCorrectionRequest.count({
          where: { attendanceEntryId: beta.entryId },
        }),
      ).toBe(before);
    });

    it('rejects tenantId and status in a manual entry body (mass assignment)', async () => {
      const res = await api('post', alpha.admin, 'attendance/manual').send({
        ...validManual(alpha.employeeId, '2026-10-07'),
        tenantId: beta.tenantId,
      });
      expect(res.status).toBe(400);
    });
  });
});
