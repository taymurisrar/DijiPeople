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
 * WP3 (SESSION-0137) — child-id IDOR, found missing by the independent QA
 * review of the first isolation suites.
 *
 * The attack: the caller owns the PARENT (their own user, team or employee), so
 * the parent lookup passes, and supplies a CHILD id that belongs to the other
 * tenant. Only the child-level filter can stop that. Each case therefore pairs:
 *
 *   control  the same verb on ALPHA's OWN child as ALPHA's admin succeeds (2xx),
 *            proving the route, DTO and permission are right, so the refusal
 *            below is not a wrong URL or a validation error; and
 *   attack   ALPHA's parent + BETA's child id must be exactly 404, and BETA's
 *            child row must be unchanged.
 *
 * EVIDENCE CLASS: database-backed HTTP integration.
 */
describeWithDatabase()('Child-id IDOR (e2e, HTTP)', () => {
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
    memberUserId: string;
    teamId: string;
    teamMemberId: string;
    teamRoleId: string;
    userRoleId: string;
    employeeId: string;
    educationId: string;
    previousEmploymentId: string;
  }
  let alpha: Side;
  let beta: Side;

  async function side(label: string): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const admin = await actors.tenantUser(tenant.id, unit, label);
    const adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: adminRole.id },
    });
    const member = await actors.tenantUser(tenant.id, unit, `${label}-member`);
    const extraRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: `extra-${label}-${suffix}`,
        name: `Extra ${label}`,
      },
      select: { id: true },
    });
    const userRole = await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: member.id, roleId: extraRole.id },
      select: { id: true },
    });
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: `Team ${label} ${suffix}`,
        key: `team-${label}-${suffix}`,
      },
      select: { id: true },
    });
    const teamMember = await prisma.teamMember.create({
      data: { tenantId: tenant.id, teamId: team.id, userId: member.id },
      select: { id: true },
    });
    const teamRole = await prisma.teamRole.create({
      data: { tenantId: tenant.id, teamId: team.id, roleId: extraRole.id },
      select: { id: true },
    });
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `IDOR-${label}-${suffix}`,
        firstName: 'Idor',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const education = await prisma.employeeEducation.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        institutionName: `Original ${label}`,
        degreeTitle: 'BSc',
      },
      select: { id: true },
    });
    const previous = await prisma.employeePreviousEmployment.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        companyName: `Original ${label}`,
        jobTitle: 'Analyst',
      },
      select: { id: true },
    });
    return {
      tenantId: tenant.id,
      admin,
      memberUserId: member.id,
      teamId: team.id,
      teamMemberId: teamMember.id,
      teamRoleId: teamRole.id,
      userRoleId: userRole.id,
      employeeId: employee.id,
      educationId: education.id,
      previousEmploymentId: previous.id,
    };
  }

  const call = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    as: HttpActor,
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };

  const betaChildren = async () =>
    JSON.parse(
      JSON.stringify({
        userRole: await prisma.userRole.findUnique({
          where: { id: beta.userRoleId },
        }),
        teamMember: await prisma.teamMember.findUnique({
          where: { id: beta.teamMemberId },
        }),
        teamRole: await prisma.teamRole.findUnique({
          where: { id: beta.teamRoleId },
        }),
        education: await prisma.employeeEducation.findUnique({
          where: { id: beta.educationId },
        }),
        previous: await prisma.employeePreviousEmployment.findUnique({
          where: { id: beta.previousEmploymentId },
        }),
      }),
    ) as unknown;

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
    fixtures = new DbFixtures(prisma, 'idor');
    actors = new HttpActors(app, suffix);
    alpha = await side('alpha');
    beta = await side('beta');
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      await prisma.employee.deleteMany({
        where: { tenantId: { in: [alpha.tenantId, beta.tenantId] } },
      });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  /**
   * One case = the same request shape twice: against ALPHA's own child (control,
   * must be 2xx) and against BETA's child under ALPHA's parent (attack, must be
   * exactly 404).
   */
  interface Case {
    name: string;
    method: 'patch' | 'delete';
    own: (s: Side) => string;
    foreign: (s: Side, other: Side) => string;
    body?: object;
  }
  const cases: Case[] = [
    {
      name: 'PATCH teams/:team/members/:member',
      method: 'patch',
      own: (a) => `teams/${a.teamId}/members/${a.teamMemberId}`,
      foreign: (a, b) => `teams/${a.teamId}/members/${b.teamMemberId}`,
      body: { isOwner: true },
    },
    {
      name: 'PATCH employees/:id/education/:education',
      method: 'patch',
      own: (a) => `employees/${a.employeeId}/education/${a.educationId}`,
      foreign: (a, b) => `employees/${a.employeeId}/education/${b.educationId}`,
      body: { institutionName: 'HIJACKED' },
    },
    {
      name: 'PATCH employees/:id/previous-employments/:id',
      method: 'patch',
      own: (a) =>
        `employees/${a.employeeId}/previous-employments/${a.previousEmploymentId}`,
      foreign: (a, b) =>
        `employees/${a.employeeId}/previous-employments/${b.previousEmploymentId}`,
      body: { companyName: 'HIJACKED' },
    },
    {
      name: 'DELETE users/:user/roles/:userRole',
      method: 'delete',
      own: (a) => `users/${a.memberUserId}/roles/${a.userRoleId}`,
      foreign: (a, b) => `users/${a.memberUserId}/roles/${b.userRoleId}`,
    },
    {
      name: 'DELETE teams/:team/roles/:assignment',
      method: 'delete',
      own: (a) => `teams/${a.teamId}/roles/${a.teamRoleId}`,
      foreign: (a, b) => `teams/${a.teamId}/roles/${b.teamRoleId}`,
    },
    {
      name: 'DELETE employees/:id/education/:education',
      method: 'delete',
      own: (a) => `employees/${a.employeeId}/education/${a.educationId}`,
      foreign: (a, b) => `employees/${a.employeeId}/education/${b.educationId}`,
    },
    {
      name: 'DELETE employees/:id/previous-employments/:id',
      method: 'delete',
      own: (a) =>
        `employees/${a.employeeId}/previous-employments/${a.previousEmploymentId}`,
      foreign: (a, b) =>
        `employees/${a.employeeId}/previous-employments/${b.previousEmploymentId}`,
    },
    {
      name: 'DELETE teams/:team/members/:member',
      method: 'delete',
      own: (a) => `teams/${a.teamId}/members/${a.teamMemberId}`,
      foreign: (a, b) => `teams/${a.teamId}/members/${b.teamMemberId}`,
    },
  ];

  describe.each(cases)('$name', (c) => {
    it('control: ALPHA acts on its own child (2xx)', async () => {
      const res = await call(c.method, alpha.admin, c.own(alpha), c.body);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('attack: ALPHA parent + BETA child id is exactly 404 and BETA is unchanged', async () => {
      const before = await betaChildren();
      const res = await call(
        c.method,
        alpha.admin,
        c.foreign(alpha, beta),
        c.body,
      );
      expect(res.status).toBe(404);
      expect(await betaChildren()).toEqual(before);
    });
  });
});
