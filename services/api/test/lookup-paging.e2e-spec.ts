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
 * BUG-3800 — the generic lookups ask a list endpoint for `?pageSize=50` and the
 * typed `search`. /business-units refused both with 400 under the global
 * ValidationPipe (configured here exactly as `main.ts` configures it), so the
 * Business Unit dropdown on every generic form loaded nothing.
 *
 * The contract the fix keeps: without paging the answer is the bare array its
 * other callers read; with paging, the `{items, meta}` envelope.
 */
describeWithDatabase()(
  'List endpoints accept the lookup query (BUG-3800, e2e, HTTP)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let admin: HttpActor;
    let roleId: string;
    const suffix = randomUUID().slice(0, 6);

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
      fixtures = new DbFixtures(prisma, 'lookup-paging');
      actors = new HttpActors(app, suffix);

      const tenant = await fixtures.createTenant('lookups');
      const organizationId = await fixtures.createOrganization(tenant.id);
      const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
      admin = await actors.tenantUser(tenant.id, unit, 'lookups');
      const role = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          key: ROLE_KEYS.GLOBAL_ADMIN,
          name: `Admin ${suffix}`,
        },
        select: { id: true },
      });
      roleId = role.id;
      await prisma.userRole.create({
        data: { tenantId: tenant.id, userId: admin.id, roleId },
      });
      await prisma.businessUnit.createMany({
        data: [
          'Northern Sales',
          'Southern Sales',
          'Finance Shared Services',
        ].map((name) => ({
          tenantId: tenant.id,
          organizationId,
          name: `${name} ${suffix}`,
        })),
      });
    });

    afterAll(async () => {
      await prisma.userRole.deleteMany({ where: { roleId } });
      await prisma.role.deleteMany({ where: { id: roleId } });
      await actors.cleanup();
      await fixtures.cleanup();
      await app.close();
    });

    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/${path}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set('X-DijiPeople-App', 'web');

    type Unit = { name: string };

    it('still answers the bare array to a caller that does not page', async () => {
      const response = await get('business-units');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts the lookup query and answers a page', async () => {
      const response = await get('business-units?pageSize=50');
      expect(response.status).toBe(200);
      const body = response.body as {
        items: Unit[];
        meta: { pageSize: number; total: number };
      };
      expect(body.meta).toMatchObject({ pageSize: 50 });
      expect(body.items.length).toBe(body.meta.total);
    });

    it('applies the typed search, which was whitelisted and ignored', async () => {
      const response = await get(
        `business-units?pageSize=50&search=${encodeURIComponent('sales ' + suffix)}`,
      );
      expect(response.status).toBe(200);
      const names = (response.body as { items: Unit[] }).items
        .map((unit) => unit.name)
        .sort();
      expect(names).toEqual([
        `Northern Sales ${suffix}`,
        `Southern Sales ${suffix}`,
      ]);
    });

    it('still refuses a page size beyond the bound', async () => {
      const response = await get('business-units?pageSize=1000');
      expect(response.status).toBe(400);
    });
  },
);
