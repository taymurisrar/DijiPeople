import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from '../src/common/constants/rbac-matrix';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { assertIsolatedUtf8Database } from './helpers/test-database';

/**
 * ITEM-0248 / ADR-0032 decision 2026-11-28: the System Customizer configures work
 * profiles and queues through customization privileges and has NO employee data
 * access. The actor below holds exactly what provisioning grants the shipped role
 * (its real matrix privileges and its real legacy keys), over real HTTP.
 */
describeWithDatabase()('System Customizer isolation (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let customizer: HttpActor;
  const suffix = randomUUID().slice(0, 6);

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${customizer.token}`)
      .set('X-DijiPeople-App', 'web');

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
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedUtf8Database(prisma);
    fixtures = new DbFixtures(prisma, 'scust');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('scust');
    const org = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, org);
    customizer = await actors.tenantUser(tenant.id, unit, 'scust');

    const matrix = SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.SYSTEM_CUSTOMIZER];
    const grants = Object.entries(matrix).filter(
      ([, level]) => level !== SecurityAccessLevel.NONE,
    );
    const keys = new Set<string>([
      ...(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.SYSTEM_CUSTOMIZER] ?? []),
      ...grants.map(([k]) => {
        const [entityKey, privilege] = k.split(':');
        return matrixPrivilegeToPermissionKey(entityKey, privilege as never);
      }),
    ]);
    // A non-elevated role key, so the guard is really evaluated.
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: `scust-${suffix}`,
        name: 'Real customizer grants',
      },
      select: { id: true },
    });
    for (const key of keys) {
      const permission = await prisma.permission.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key } },
        update: {},
        create: { tenantId: tenant.id, key, name: `${key} (${suffix})` },
        select: { id: true },
      });
      await prisma.rolePermission.create({
        data: {
          tenantId: tenant.id,
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
    await prisma.rolePrivilege.createMany({
      data: grants.map(([k, accessLevel]) => {
        const [entityKey, privilege] = k.split(':');
        return {
          tenantId: tenant.id,
          roleId: role.id,
          entityKey,
          privilege: privilege as SecurityPrivilege,
          accessLevel,
        };
      }),
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: customizer.id, roleId: role.id },
    });
  });

  afterAll(async () => {
    try {
      await actors?.cleanup();
      await fixtures?.cleanup();
    } finally {
      await app?.close();
    }
  });

  it('reaches the work profile and queue configuration reads', async () => {
    for (const path of [
      '/work-profiles',
      '/work-profiles/units',
      '/work-queues',
    ]) {
      const res = await get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it('cannot list or read employees', async () => {
    for (const path of [
      '/employees',
      `/employees/${randomUUID()}`,
    ]) {
      const res = await get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it('cannot read employees through the entity data API', async () => {
    const res = await get('/data/employees');
    expect(res.status).not.toBe(200);
    expect([401, 403, 404]).toContain(res.status);
  });
});
