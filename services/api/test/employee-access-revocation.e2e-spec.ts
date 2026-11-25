import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash, randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { getClientAccessTokenSecret } from '../src/common/config/auth.config';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AccessRevocationSweeperWorker } from '../src/modules/employees/access-revocation-sweeper.worker';
import {
  lockEmployee,
  revokeAccessIfDue,
} from '../src/modules/employees/employee-access-revocation';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * DP-MASTER WP-08 (BUG-4774, OD-TERMINATE-ACCESS).
 *
 * EVIDENCE CLASS: database-backed HTTP integration. Real guard, real PostgreSQL,
 * real row locks. Nothing about the revocation is mocked: the assertions read the
 * rows back and replay the old token against the API.
 */
describeWithDatabase()('Employee termination ends access (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let audit: AuditService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let sweeper: AccessRevocationSweeperWorker;
  let tenantId: string;
  let businessUnitId: string;
  let admin: HttpActor;
  const suffix = randomUUID().slice(0, 6);
  const employeeIds: string[] = [];
  const deviceIds: string[] = [];
  let seq = 0;

  const as = (actor: HttpActor, path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');

  const terminate = (employeeId: string, terminationDate?: Date) =>
    request(app.getHttpServer())
      .post(`/employees/${employeeId}/terminate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-DijiPeople-App', 'web')
      .send(
        terminationDate
          ? { terminationDate: terminationDate.toISOString() }
          : {},
      );

  /** A tenant user linked to an employee, with a live web session and a live agent session. */
  async function staff(inTenant = tenantId, unit = businessUnitId) {
    seq += 1;
    const actor = await actors.tenantUser(inTenant, unit, `staff-${seq}`);
    const employee = await prisma.employee.create({
      data: {
        tenantId: inTenant,
        userId: actor.id,
        employeeCode: `E-${suffix}-${seq}`,
        firstName: 'Staff',
        lastName: String(seq),
        phone: '0000000',
        hireDate: new Date('2024-01-01'),
        businessUnitId: unit,
      },
      select: { id: true },
    });
    employeeIds.push(employee.id);
    const device = await prisma.employeeDevice.create({
      data: {
        tenantId: inTenant,
        employeeId: employee.id,
        userId: actor.id,
        deviceFingerprint: `fp-${suffix}-${seq}`,
        deviceName: 'e2e',
        os: 'Windows',
        platform: 'win32',
        agentVersion: '1.0.0',
      },
      select: { id: true },
    });
    deviceIds.push(device.id);
    const agentSessionId = randomUUID();
    await prisma.agentRefreshToken.create({
      data: {
        tenantId: inTenant,
        userId: actor.id,
        employeeId: employee.id,
        deviceId: device.id,
        sessionId: agentSessionId,
        tokenHash: createHash('sha256')
          .update(`agent-${suffix}-${seq}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return {
      actor,
      employeeId: employee.id,
      deviceId: device.id,
      agentSessionId,
    };
  }

  /** An agent-desktop access token for the session staff() created. */
  const agentToken = (
    userId: string,
    email: string,
    tenant: string,
    sessionId: string,
    deviceId: string,
  ) =>
    app.get(JwtService).signAsync(
      {
        sub: userId,
        tenantId: tenant,
        email,
        sessionId,
        deviceId,
        tokenVersion: 1,
        type: 'access',
        tokenUse: 'access',
        appClientId: 'agent-desktop',
        aud: 'agent-desktop',
      },
      {
        secret: getClientAccessTokenSecret(
          app.get(ConfigService),
          'agent-desktop',
        ),
        expiresIn: '1h',
      },
    );

  const asAgent = (token: string, path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-DijiPeople-App', 'agent-desktop');

  const state = async (userId: string, employeeId: string) => ({
    user: (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .status,
    employee: await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { employmentStatus: true, terminationDate: true },
    }),
    liveWeb: await prisma.refreshToken.count({
      where: { userId, revokedAt: null },
    }),
    liveAgent: await prisma.agentRefreshToken.count({
      where: { userId, revokedAt: null },
    }),
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
    audit = app.get(AuditService);
    sweeper = app.get(AccessRevocationSweeperWorker, { strict: false });
    fixtures = new DbFixtures(prisma, 'revocation');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('rev');
    tenantId = tenant.id;
    const organizationId = await fixtures.createOrganization(tenantId);
    businessUnitId = await fixtures.createBusinessUnit(
      tenantId,
      organizationId,
    );
    admin = await actors.tenantUser(tenantId, businessUnitId, 'rev-admin');
    const role = await prisma.role.create({
      data: { tenantId, key: ROLE_KEYS.GLOBAL_ADMIN, name: 'Admin rev' },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId, userId: admin.id, roleId: role.id },
    });
    // The admin is the tenant owner, so it can never be locked out by the tests below.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { ownerUserId: admin.id },
    });
  });

  afterAll(async () => {
    try {
      await prisma.agentRefreshToken.deleteMany({ where: { tenantId } });
      await prisma.employeeDevice.deleteMany({
        where: { id: { in: deviceIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('control: a staff member with a live session reaches the API (403 = authenticated, no role)', async () => {
    const { actor } = await staff();
    expect((await as(actor, 'roles')).status).toBe(403);
  });

  it('immediate exit: status, user, web and agent tokens and the audit row change together; the old token is refused', async () => {
    const { actor, employeeId } = await staff();
    const res = await terminate(employeeId);
    expect(res.status).toBeLessThan(300);

    const after = await state(actor.id, employeeId);
    expect(after).toMatchObject({ user: 'DISABLED', liveWeb: 0, liveAgent: 0 });
    expect(after.employee.employmentStatus).toBe('TERMINATED');
    expect((await as(actor, 'roles')).status).toBe(401);

    const rows = await prisma.auditLog.findMany({
      where: { tenantId, entityId: employeeId, action: 'EMPLOYEE_TERMINATED' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].afterSnapshot).toMatchObject({
      accessRevoked: true,
      accessRevocationNote: 'USER_DISABLED_SESSIONS_REVOKED',
    });
  });

  it('terminating again is idempotent and says nothing was left to revoke', async () => {
    const { actor, employeeId } = await staff();
    await terminate(employeeId);
    const again = await terminate(employeeId);
    expect(again.status).toBeLessThan(300);
    const last = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, entityId: employeeId, action: 'EMPLOYEE_TERMINATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.afterSnapshot).toMatchObject({
      accessRevocationNote: 'ALREADY_REVOKED',
    });
    expect((await state(actor.id, employeeId)).user).toBe('DISABLED');
  });

  it('is atomic: when the audit write fails nothing else is changed', async () => {
    const { actor, employeeId } = await staff();
    const spy = jest
      .spyOn(audit, 'log')
      .mockRejectedValueOnce(new Error('audit down'));
    try {
      const res = await terminate(employeeId);
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const after = await state(actor.id, employeeId);
    expect(after.user).toBe('ACTIVE');
    expect(after.employee.employmentStatus).toBe('ACTIVE');
    expect(after).toMatchObject({ liveWeb: 1, liveAgent: 1 });
    expect((await as(actor, 'roles')).status).toBe(403);
  });

  it('future-dated exit keeps access until the date, then auth refuses the token BEFORE any sweep, and the sweeper then disables the user', async () => {
    const { actor, employeeId } = await staff();
    const res = await terminate(employeeId, new Date(Date.now() + 86_400_000));
    expect(res.status).toBeLessThan(300);
    expect(await state(actor.id, employeeId)).toMatchObject({
      user: 'ACTIVE',
      liveWeb: 1,
      liveAgent: 1,
    });
    expect((await as(actor, 'roles')).status).toBe(403);

    // The date arrives. The sweeper has not run and the user is still ACTIVE.
    // Auth itself refuses the token on the date, on the entry points (/auth/me,
    // login and refresh) AND on ordinary endpoints: the guard's session lookup
    // carries the employee's exit state in the same joined statement.
    await prisma.employee.update({
      where: { id: employeeId },
      data: { terminationDate: new Date(Date.now() - 60_000) },
    });
    expect((await state(actor.id, employeeId)).user).toBe('ACTIVE');
    expect((await as(actor, 'auth/me')).status).toBe(401);
    expect((await as(actor, 'roles')).status).toBe(401);

    await sweeper.tick();
    expect(await state(actor.id, employeeId)).toMatchObject({
      user: 'DISABLED',
      liveWeb: 0,
      liveAgent: 0,
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId,
        entityId: employeeId,
        action: 'EMPLOYEE_ACCESS_REVOKED',
      },
    });
    expect(row.actorUserId).toBeNull();
  });

  it('an agent access token is refused on the effective date, before any sweep (same single-statement lookup as the web path)', async () => {
    const { actor, employeeId, deviceId, agentSessionId } = await staff();
    const token = await agentToken(
      actor.id,
      actor.email,
      tenantId,
      agentSessionId,
      deviceId,
    );
    const control = await asAgent(token, 'agent/me');
    expect(control.status).not.toBe(401);

    const res = await terminate(employeeId, new Date(Date.now() + 86_400_000));
    expect(res.status).toBeLessThan(300);
    expect((await asAgent(token, 'agent/me')).status).not.toBe(401);

    await prisma.employee.update({
      where: { id: employeeId },
      data: { terminationDate: new Date(Date.now() - 60_000) },
    });
    expect((await state(actor.id, employeeId)).user).toBe('ACTIVE');
    expect((await asAgent(token, 'agent/me')).status).toBe(401);
  });

  it('a concurrent rehire wins: the sweeper waits on the row lock, re-reads ACTIVE and revokes nothing', async () => {
    const { actor, employeeId } = await staff();
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: 'TERMINATED',
        terminationDate: new Date(Date.now() - 60_000),
      },
    });

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    const rehire = prisma.$transaction(async (tx) => {
      await lockEmployee(tx, tenantId, employeeId);
      locked();
      await held; // the rehire is in flight, holding the lock
      await tx.employee.update({
        where: { id: employeeId },
        data: { employmentStatus: 'ACTIVE', terminationDate: null },
      });
    });
    await hasLock;
    const sweep = revokeAccessIfDue(prisma, audit, { tenantId, employeeId });
    await new Promise((r) => setTimeout(r, 300)); // sweeper is blocked on the lock
    release();
    await rehire;

    await expect(sweep).resolves.toMatchObject({
      revoked: false,
      note: 'NOT_TERMINATED',
    });
    expect(await state(actor.id, employeeId)).toMatchObject({
      user: 'ACTIVE',
      liveWeb: 1,
      liveAgent: 1,
    });
  });

  it('a concurrent reschedule to a later date wins the same way', async () => {
    const { actor, employeeId } = await staff();
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: 'TERMINATED',
        terminationDate: new Date(Date.now() - 60_000),
      },
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    const reschedule = prisma.$transaction(async (tx) => {
      await lockEmployee(tx, tenantId, employeeId);
      locked();
      await held;
      await tx.employee.update({
        where: { id: employeeId },
        data: { terminationDate: new Date(Date.now() + 7 * 86_400_000) },
      });
    });
    await hasLock;
    const sweep = revokeAccessIfDue(prisma, audit, { tenantId, employeeId });
    await new Promise((r) => setTimeout(r, 300));
    release();
    await reschedule;
    await expect(sweep).resolves.toMatchObject({
      revoked: false,
      note: 'NOT_DUE',
    });
    expect((await state(actor.id, employeeId)).user).toBe('ACTIVE');
  });

  it('never disables the tenant owner, in the terminate command or in the sweep, and auth lets the owner through', async () => {
    // The admin actor IS the owner. Link an employee to it and terminate in the past.
    const ownerEmployee = await prisma.employee.create({
      data: {
        tenantId,
        userId: admin.id,
        employeeCode: `E-${suffix}-owner`,
        firstName: 'Owner',
        lastName: 'Person',
        phone: '0000000',
        hireDate: new Date('2024-01-01'),
        businessUnitId,
        employmentStatus: 'TERMINATED',
        terminationDate: new Date(Date.now() - 60_000),
      },
      select: { id: true },
    });
    employeeIds.push(ownerEmployee.id);
    await sweeper.tick();
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(owner.status).toBe('ACTIVE');
    expect((await as(admin, 'roles')).status).toBe(200);
  });

  it('recovers a DISABLED user who still holds live tokens', async () => {
    const { actor, employeeId } = await staff();
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: 'TERMINATED',
        terminationDate: new Date(Date.now() - 60_000),
      },
    });
    // The user was disabled by an older build, but the tokens were left behind.
    await prisma.user.update({
      where: { id: actor.id },
      data: { status: 'DISABLED' },
    });
    expect(await state(actor.id, employeeId)).toMatchObject({
      liveWeb: 1,
      liveAgent: 1,
    });

    await sweeper.tick();
    expect(await state(actor.id, employeeId)).toMatchObject({
      user: 'DISABLED',
      liveWeb: 0,
      liveAgent: 0,
    });
  });

  it('does not starve: unrevokable rows ahead of an eligible one cannot block it across ticks', async () => {
    // Four extra tenants whose owner has a due termination: eligible by the query,
    // never revocable. With a page of 2 and one page per tick, a "first N" query
    // would return the same two rows forever.
    for (let i = 0; i < 4; i += 1) {
      const t = await fixtures.createTenant(`own${i}`);
      const org = await fixtures.createOrganization(t.id);
      const unit = await fixtures.createBusinessUnit(t.id, org);
      const owner = await staff(t.id, unit);
      await prisma.tenant.update({
        where: { id: t.id },
        data: { ownerUserId: owner.actor.id },
      });
      await prisma.employee.update({
        where: { id: owner.employeeId },
        data: {
          employmentStatus: 'TERMINATED',
          terminationDate: new Date(Date.now() - 60_000),
        },
      });
    }
    const target = await staff();
    await prisma.employee.update({
      where: { id: target.employeeId },
      data: {
        employmentStatus: 'TERMINATED',
        terminationDate: new Date(Date.now() - 60_000),
      },
    });

    sweeper.batchSize = 2;
    sweeper.maxPagesPerTick = 1;
    try {
      for (let tick = 0; tick < 12; tick += 1) {
        await sweeper.tick();
        if (
          (await state(target.actor.id, target.employeeId)).user === 'DISABLED'
        )
          break;
      }
    } finally {
      sweeper.batchSize = 200;
      sweeper.maxPagesPerTick = 25;
    }
    expect((await state(target.actor.id, target.employeeId)).user).toBe(
      'DISABLED',
    );
  });

  it('the sweeper is ON unless explicitly disabled', () => {
    const config = app.get(ConfigService);
    expect(config.get('ACCESS_REVOCATION_SWEEPER_ENABLED')).not.toBe('false');
    expect(sweeper.isEnabled()).toBe(true);
  });
});
