import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * WP3 (SESSION-0137) — a still-valid access token must stop working the moment
 * the account, its tenant or its session stops being live.
 *
 * EVIDENCE CLASS: database-backed HTTP integration (real guard, real
 * PostgreSQL). The token below is cryptographically valid throughout; only the
 * database state changes, which is exactly the situation after an operator
 * suspends a tenant or disables a user while a browser still holds a token.
 */
describeWithDatabase()('Tenant lifecycle gates access (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let admin: HttpActor;
  let plain: HttpActor;
  const suffix = randomUUID().slice(0, 6);

  const get = (as: HttpActor, path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web');

  const setTenantStatus = (status: TenantStatus) =>
    prisma.tenant.update({ where: { id: tenantId }, data: { status } });

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
    fixtures = new DbFixtures(prisma, 'lifecycle');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('life');
    tenantId = tenant.id;
    const organizationId = await fixtures.createOrganization(tenantId);
    const unit = await fixtures.createBusinessUnit(tenantId, organizationId);
    admin = await actors.tenantUser(tenantId, unit, 'life-admin');
    plain = await actors.tenantUser(tenantId, unit, 'life-plain');
    const role = await prisma.role.create({
      data: {
        tenantId,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: 'Admin life',
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId, userId: admin.id, roleId: role.id },
    });
    await setTenantStatus(TenantStatus.ACTIVE);
  });

  afterAll(async () => {
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  it('control: an ACTIVE tenant, active user and live session reach the API', async () => {
    expect((await get(admin, 'roles')).status).toBe(200);
  });

  it('control: a user holding no role is refused, so 200 above is RBAC working, not an open door', async () => {
    expect([401, 403]).toContain((await get(plain, 'roles')).status);
  });

  const blocked = Object.values(TenantStatus).filter(
    (status) => status !== TenantStatus.ACTIVE,
  );
  it.each(blocked)(
    'a tenant in %s refuses a still-valid token (401)',
    async (status) => {
      await setTenantStatus(status);
      try {
        expect((await get(admin, 'roles')).status).toBe(401);
      } finally {
        await setTenantStatus(TenantStatus.ACTIVE);
      }
    },
  );

  it('reactivating the tenant restores access, proving the 401s were the gate', async () => {
    expect((await get(admin, 'roles')).status).toBe(200);
  });

  it('a DISABLED user is refused with a valid token', async () => {
    await prisma.user.update({
      where: { id: admin.id },
      data: { status: 'DISABLED' },
    });
    try {
      expect((await get(admin, 'roles')).status).toBe(401);
    } finally {
      await prisma.user.update({
        where: { id: admin.id },
        data: { status: 'ACTIVE' },
      });
    }
  });

  it('a revoked session is refused with a valid token', async () => {
    await prisma.refreshToken.updateMany({
      where: { userId: admin.id },
      data: { revokedAt: new Date() },
    });
    try {
      expect((await get(admin, 'roles')).status).toBe(401);
    } finally {
      await prisma.refreshToken.updateMany({
        where: { userId: admin.id },
        data: { revokedAt: null },
      });
    }
  });

  it('a tenant token cannot be replayed on the platform admin client', async () => {
    const res = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-DijiPeople-App', 'admin');
    expect([401, 403]).toContain(res.status);
  });
});
