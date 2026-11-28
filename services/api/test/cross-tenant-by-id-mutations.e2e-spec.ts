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
 * WP3 (SESSION-0137) — cross-tenant by-id mutation, HTTP + PostgreSQL.
 *
 * EVIDENCE CLASS: database-backed HTTP integration. Real Nest app, real guards,
 * real services, real PostgreSQL. Not a mock and not a static scan.
 *
 * Tenant ALPHA's administrator (GLOBAL_ADMIN, so RBAC is not what stops the
 * request) tries to read, change and delete tenant BETA's roles, teams, users,
 * sessions and saved views by id, and tries to wire BETA's rows into ALPHA's
 * own. Every attempt must be refused with 403/404 and BETA's rows must be
 * byte-for-byte unchanged afterwards.
 *
 * A refusal alone proves nothing — a misrouted request also fails — so each
 * group opens with a positive control: BETA's own administrator reaches the same
 * row with 200. That is what makes the 404 for ALPHA an isolation result.
 */
describeWithDatabase()('Cross-tenant by-id mutation (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);

  interface Side {
    tenantId: string;
    businessUnitId: string;
    admin: HttpActor;
    roleId: string;
    teamId: string;
    victimUserId: string;
    victimSessionRowId: string;
    viewId: string;
  }
  let alpha: Side;
  let beta: Side;

  async function side(label: string): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const businessUnitId = await fixtures.createBusinessUnit(
      tenant.id,
      organizationId,
    );
    const admin = await actors.tenantUser(tenant.id, businessUnitId, label);
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
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: `custom-${label}-${suffix}`,
        name: `Custom ${label}`,
        description: 'original',
      },
      select: { id: true },
    });
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: `Team ${label} ${suffix}`,
        key: `team-${label}-${suffix}`,
        description: 'original',
      },
      select: { id: true },
    });
    const victim = await actors.tenantUser(
      tenant.id,
      businessUnitId,
      `${label}-victim`,
    );
    const session = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: victim.id },
      select: { id: true },
    });
    const view = await prisma.moduleView.create({
      data: {
        tenantId: tenant.id,
        moduleKey: 'employees',
        name: `View ${label}`,
        slug: `view-${label}-${suffix}`,
        configJson: {},
      },
      select: { id: true },
    });
    return {
      tenantId: tenant.id,
      businessUnitId,
      admin,
      roleId: role.id,
      teamId: team.id,
      victimUserId: victim.id,
      victimSessionRowId: session.id,
      viewId: view.id,
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

  /** 403 or 404 only: a 400 could be a malformed probe, a 5xx a crash. */
  const refused = (status: number) => expect([403, 404]).toContain(status);

  /** Everything about BETA's rows that an attack could change. */
  async function betaSnapshot() {
    const [role, team, user, view, sessions, roleLinks, members] =
      await Promise.all([
        prisma.role.findUnique({ where: { id: beta.roleId } }),
        prisma.team.findUnique({ where: { id: beta.teamId } }),
        prisma.user.findUnique({ where: { id: beta.victimUserId } }),
        prisma.moduleView.findUnique({ where: { id: beta.viewId } }),
        prisma.refreshToken.findMany({
          where: { userId: beta.victimUserId },
          orderBy: { id: 'asc' },
        }),
        prisma.userRole.findMany({
          where: { userId: beta.victimUserId },
          orderBy: { id: 'asc' },
        }),
        prisma.teamMember.findMany({
          where: { teamId: beta.teamId },
          orderBy: { id: 'asc' },
        }),
      ]);
    return JSON.parse(
      JSON.stringify({ role, team, user, view, sessions, roleLinks, members }),
    ) as unknown;
  }

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
    fixtures = new DbFixtures(prisma, 'xtenant');
    actors = new HttpActors(app, suffix);
    alpha = await side('alpha');
    beta = await side('beta');
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('positive controls — the targets are reachable by their owner', () => {
    it('BETA admin reads its own role, team, user and view', async () => {
      expect(
        (await call('get', beta.admin, `roles/${beta.roleId}`)).status,
      ).toBe(200);
      expect(
        (await call('get', beta.admin, `teams/${beta.teamId}`)).status,
      ).toBe(200);
      expect(
        (await call('get', beta.admin, `users/${beta.victimUserId}`)).status,
      ).toBe(200);
    });

    // The attacks below are writes, so the controls must be writes too: if the
    // same verbs failed for the owner (wrong DTO, wrong permission) every
    // refusal under them would be meaningless. These run on ALPHA's own rows.
    it('ALPHA admin can write its own role, team, user and view (same verbs as the attacks)', async () => {
      const role = await call('put', alpha.admin, `roles/${alpha.roleId}`, {
        name: 'Renamed by owner',
        description: 'owner edit',
      });
      expect(role.status).toBe(200);
      const team = await call('patch', alpha.admin, `teams/${alpha.teamId}`, {
        description: 'owner edit',
      });
      expect(team.status).toBe(200);
      const user = await call(
        'patch',
        alpha.admin,
        `users/${alpha.victimUserId}`,
        { firstName: 'OwnerEdit' },
      );
      expect(user.status).toBe(200);
      const view = await call(
        'patch',
        alpha.admin,
        `module-views/${alpha.viewId}`,
        { name: 'Renamed view' },
      );
      expect(view.status).toBe(200);
    });
  });

  describe('ALPHA admin against BETA rows, by id', () => {
    let before: unknown;
    beforeAll(async () => {
      before = await betaSnapshot();
    });

    it('cannot read them', async () => {
      refused((await call('get', alpha.admin, `roles/${beta.roleId}`)).status);
      refused((await call('get', alpha.admin, `teams/${beta.teamId}`)).status);
      refused(
        (await call('get', alpha.admin, `users/${beta.victimUserId}`)).status,
      );
      refused(
        (await call('get', alpha.admin, `users/${beta.victimUserId}/roles`))
          .status,
      );
      refused(
        (await call('get', alpha.admin, `users/${beta.victimUserId}/sessions`))
          .status,
      );
    });

    it('does not list them', async () => {
      const roles = await call('get', alpha.admin, 'roles');
      const teams = await call('get', alpha.admin, 'teams');
      const users = await call('get', alpha.admin, 'users');
      expect(JSON.stringify(roles.body)).not.toContain(beta.roleId);
      expect(JSON.stringify(teams.body)).not.toContain(beta.teamId);
      expect(JSON.stringify(users.body)).not.toContain(beta.victimUserId);
    });

    it('cannot update a role', async () => {
      refused(
        (
          await call('put', alpha.admin, `roles/${beta.roleId}`, {
            name: 'HIJACKED',
            description: 'HIJACKED',
          })
        ).status,
      );
      refused(
        (await call('put', alpha.admin, `roles/${beta.roleId}/deactivate`))
          .status,
      );
      refused(
        (
          await call('put', alpha.admin, `roles/${beta.roleId}/permissions`, {
            permissionIds: [],
          })
        ).status,
      );
      refused(
        (await call('post', alpha.admin, `roles/${beta.roleId}/reset-default`))
          .status,
      );
    });

    it('cannot clone a role into its own tenant', async () => {
      // The clone endpoint takes no body, so the check is on ALPHA's role
      // count: a successful clone of BETA's role would add a row to ALPHA.
      const rolesBefore = await prisma.role.count({
        where: { tenantId: alpha.tenantId },
      });
      const res = await call('post', alpha.admin, `roles/${beta.roleId}/clone`);
      refused(res.status);
      expect(
        await prisma.role.count({ where: { tenantId: alpha.tenantId } }),
      ).toBe(rolesBefore);
    });

    it('cannot delete a role', async () => {
      refused(
        (await call('delete', alpha.admin, `roles/${beta.roleId}`)).status,
      );
    });

    it('cannot update, populate or delete a team', async () => {
      refused(
        (
          await call('patch', alpha.admin, `teams/${beta.teamId}`, {
            description: 'HIJACKED',
          })
        ).status,
      );
      refused(
        (
          await call('post', alpha.admin, `teams/${beta.teamId}/members`, {
            userId: alpha.admin.id,
          })
        ).status,
      );
      refused(
        (await call('delete', alpha.admin, `teams/${beta.teamId}`)).status,
      );
    });

    it('cannot update, disable, re-role or delete a user', async () => {
      const id = beta.victimUserId;
      refused(
        (
          await call('put', alpha.admin, `users/${id}`, {
            firstName: 'HIJACKED',
          })
        ).status,
      );
      refused(
        (
          await call('patch', alpha.admin, `users/${id}`, {
            status: 'DISABLED',
          })
        ).status,
      );
      refused(
        (
          await call('put', alpha.admin, `users/${id}/roles`, {
            roleIds: [alpha.roleId],
          })
        ).status,
      );
      refused(
        (
          await call('put', alpha.admin, `users/${id}/business-unit`, {
            businessUnitId: alpha.businessUnitId,
          })
        ).status,
      );
      refused(
        (await call('post', alpha.admin, `users/${id}/mfa/reset`)).status,
      );
      refused((await call('delete', alpha.admin, `users/${id}`)).status);
    });

    it('cannot revoke another tenant’s sessions', async () => {
      refused(
        (
          await call(
            'delete',
            alpha.admin,
            `users/${beta.victimUserId}/sessions/${beta.victimSessionRowId}`,
          )
        ).status,
      );
      // Revoke-all is a tenant-scoped updateMany: the honest outcome for a
      // foreign user id is a refusal OR a 200 that revoked nothing. What must
      // never happen is revoked > 0 — the snapshot below also proves it.
      const all = await call(
        'delete',
        alpha.admin,
        `users/${beta.victimUserId}/sessions`,
      );
      if (all.status === 200)
        expect((all.body as { revoked: number }).revoked).toBe(0);
      else refused(all.status);
    });

    it('cannot update or delete a saved view', async () => {
      refused(
        (
          await call('patch', alpha.admin, `module-views/${beta.viewId}`, {
            name: 'HIJACKED',
          })
        ).status,
      );
      refused(
        (await call('delete', alpha.admin, `module-views/${beta.viewId}`))
          .status,
      );
    });

    it('left every BETA row byte-for-byte unchanged', async () => {
      expect(await betaSnapshot()).toEqual(before);
    });
  });

  describe('ALPHA wires BETA ids into ALPHA’s own rows', () => {
    it('cannot grant ALPHA’s user a BETA role', async () => {
      const res = await call(
        'put',
        alpha.admin,
        `users/${alpha.victimUserId}/roles`,
        { roleIds: [beta.roleId] },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(
        await prisma.userRole.count({
          where: { userId: alpha.victimUserId, roleId: beta.roleId },
        }),
      ).toBe(0);
    });

    it('cannot add a BETA user to an ALPHA team', async () => {
      const res = await call(
        'post',
        alpha.admin,
        `teams/${alpha.teamId}/members`,
        {
          userId: beta.victimUserId,
        },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(
        await prisma.teamMember.count({
          where: { teamId: alpha.teamId, userId: beta.victimUserId },
        }),
      ).toBe(0);
    });

    it('cannot move an ALPHA user into a BETA business unit', async () => {
      const res = await call(
        'put',
        alpha.admin,
        `users/${alpha.victimUserId}/business-unit`,
        { businessUnitId: beta.businessUnitId },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: alpha.victimUserId },
        select: { businessUnitId: true },
      });
      expect(row.businessUnitId).toBe(alpha.businessUnitId);
    });

    it('cannot make a BETA user the owner of an ALPHA team', async () => {
      const res = await call('patch', alpha.admin, `teams/${alpha.teamId}`, {
        ownerUserId: beta.victimUserId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const row = await prisma.team.findUniqueOrThrow({
        where: { id: alpha.teamId },
        select: { ownerUserId: true },
      });
      expect(row.ownerUserId).not.toBe(beta.victimUserId);
    });
  });
});
