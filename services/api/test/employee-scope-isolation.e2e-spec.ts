import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * Row-level scoping and tenant isolation on the employee list and by-id read,
 * against real PostgreSQL, with two tenants and three access levels.
 *
 * Why this exists (SESSION-0136, independent security review): the per-request
 * business-unit context that `BusinessUnitAccessMiddleware` used to build is
 * consumed only by a Prisma `$use` hook that does not exist on Prisma 7, so
 * scoping rests entirely on each service applying the caller's access level.
 * This pins that behaviour end to end, and it is run against BOTH the old and
 * the new middleware: the outcome matrix must be identical.
 *
 * Fixture: tenant A has two business units (BU1, BU2); tenant B has one.
 *   viewers (all in A/BU1, each with a linked employee in BU1):
 *     SELF           sees only their own record
 *     BUSINESS_UNIT  sees BU1 records, never BU2
 *     TENANT         sees every record in A, never B
 */
describeWithDatabase()(
  'Employee row scope and tenant isolation (e2e, HTTP)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    const suffix = randomUUID().slice(0, 6);
    const roleIds: string[] = [];
    const employeeIds: string[] = [];

    let tenantA = '';
    let viewers: Record<'SELF' | 'BUSINESS_UNIT' | 'TENANT', HttpActor>;
    const code: Record<string, string> = {};
    const idOf: Record<string, string> = {};

    async function employee(
      tenantId: string,
      businessUnitId: string,
      key: string,
      userId?: string,
    ) {
      const c = `SC-${key}-${suffix}`;
      const e = await prisma.employee.create({
        data: {
          tenantId,
          businessUnitId,
          ...(userId ? { userId } : {}),
          employeeCode: c,
          firstName: 'Scope',
          lastName: key,
          phone: '000',
          hireDate: new Date('2024-01-01'),
        },
        select: { id: true },
      });
      employeeIds.push(e.id);
      code[key] = c;
      idOf[key] = e.id;
    }

    async function viewer(
      level: 'SELF' | 'BUSINESS_UNIT' | 'TENANT',
      businessUnitId: string,
    ) {
      const actor = await actors.tenantUser(
        tenantA,
        businessUnitId,
        level.toLowerCase(),
      );
      const role = await prisma.role.create({
        data: {
          tenantId: tenantA,
          key: `scope-${level.toLowerCase()}-${suffix}`,
          name: `Scope ${level}`,
        },
        select: { id: true },
      });
      roleIds.push(role.id);
      // The list needs employees.read; the by-id route also needs dashboard.view.
      const permissions = await prisma.permission.findMany({
        where: { key: { in: ['employees.read', 'dashboard.view'] } },
        select: { id: true },
      });
      expect(permissions).toHaveLength(2);
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          tenantId: tenantA,
          roleId: role.id,
          permissionId: p.id,
        })),
      });
      await prisma.rolePrivilege.create({
        data: {
          tenantId: tenantA,
          roleId: role.id,
          entityKey: ENTITY_KEYS.EMPLOYEES,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel[level],
        },
      });
      await prisma.userRole.create({
        data: { tenantId: tenantA, userId: actor.id, roleId: role.id },
      });
      await employee(tenantA, businessUnitId, `own-${level}`, actor.id);
      return actor;
    }

    const get = (a: HttpActor, path: string) =>
      request(app.getHttpServer())
        .get(`/${path}`)
        .set('Authorization', `Bearer ${a.token}`)
        .set('X-DijiPeople-App', 'web');

    async function visibleCodes(a: HttpActor): Promise<string[]> {
      const res = await get(a, 'employees?pageSize=100');
      expect(res.status).toBe(200);
      const body = res.body as
        | {
            items?: Array<{ employeeCode: string }>;
            data?: Array<{ employeeCode: string }>;
          }
        | Array<{ employeeCode: string }>;
      const rows = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
      return rows
        .map((r) => r.employeeCode)
        .filter((c) => c.endsWith(`-${suffix}`))
        .sort();
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
      fixtures = new DbFixtures(prisma, 'scope-iso');
      actors = new HttpActors(app, suffix);

      const a = await fixtures.createTenant('sca');
      tenantA = a.id;
      const orgA = await fixtures.createOrganization(a.id);
      const bu1 = await fixtures.createBusinessUnit(a.id, orgA, 'bu1');
      const bu2 = await fixtures.createBusinessUnit(a.id, orgA, 'bu2');
      const b = await fixtures.createTenant('scb');
      const orgB = await fixtures.createOrganization(b.id);
      const buB = await fixtures.createBusinessUnit(b.id, orgB, 'bub');

      await employee(a.id, bu1, 'a1');
      await employee(a.id, bu2, 'a2');
      await employee(b.id, buB, 'b1');
      viewers = {
        SELF: await viewer('SELF', bu1),
        BUSINESS_UNIT: await viewer('BUSINESS_UNIT', bu1),
        TENANT: await viewer('TENANT', bu1),
      };
    });

    afterAll(async () => {
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
      await prisma.rolePrivilege.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await actors.cleanup();
      await fixtures.cleanup();
      await app.close();
    });

    const names = (codes: string[]) =>
      codes
        .map((c) => Object.keys(code).find((k) => code[k] === c) ?? c)
        .sort();

    it('SELF sees only their own record', async () => {
      expect(names(await visibleCodes(viewers.SELF))).toEqual(['own-SELF']);
    });

    it('BUSINESS_UNIT sees every BU1 record and nothing from BU2 or tenant B', async () => {
      expect(names(await visibleCodes(viewers.BUSINESS_UNIT))).toEqual(
        ['a1', 'own-BUSINESS_UNIT', 'own-SELF', 'own-TENANT'].sort(),
      );
    });

    it('TENANT sees the whole of tenant A and nothing from tenant B', async () => {
      expect(names(await visibleCodes(viewers.TENANT))).toEqual(
        ['a1', 'a2', 'own-BUSINESS_UNIT', 'own-SELF', 'own-TENANT'].sort(),
      );
    });

    it('by-id reads are refused outside the caller’s scope and tenant', async () => {
      // Out of BU scope (BU2 record, BUSINESS_UNIT viewer) and out of tenant.
      for (const [who, key] of [
        ['BUSINESS_UNIT', 'a2'],
        ['SELF', 'a1'],
        ['SELF', 'a2'],
        ['BUSINESS_UNIT', 'b1'],
        ['TENANT', 'b1'],
      ] as const) {
        const res = await get(viewers[who], `employees/${idOf[key]}`);
        expect({ who, key, refused: [403, 404].includes(res.status) }).toEqual({
          who,
          key,
          refused: true,
        });
      }
      // In scope: allowed.
      for (const [who, key] of [
        ['SELF', 'own-SELF'],
        ['BUSINESS_UNIT', 'a1'],
        ['TENANT', 'a2'],
      ] as const) {
        const res = await get(viewers[who], `employees/${idOf[key]}`);
        expect({ who, key, status: res.status }).toEqual({
          who,
          key,
          status: 200,
        });
      }
    });

    it('prints the outcome matrix for the old/new middleware comparison', async () => {
      const matrix = {
        SELF: names(await visibleCodes(viewers.SELF)),
        BUSINESS_UNIT: names(await visibleCodes(viewers.BUSINESS_UNIT)),
        TENANT: names(await visibleCodes(viewers.TENANT)),
      };
      console.log(`SCOPE_MATRIX=${JSON.stringify(matrix)}`);
    });
  },
);
