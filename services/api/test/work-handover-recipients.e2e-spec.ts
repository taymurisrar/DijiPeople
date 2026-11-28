/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { TENANT_FEATURE_KEYS } from '../src/common/constants/tenant-features';
import { REQUIRED_ENTITLEMENTS_KEY } from '../src/common/decorators/require-entitlement.decorator';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WorkDutiesController } from '../src/modules/work-items/work-duties.controller';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { scopedActor } from './helpers/scoped-actors';

/**
 * GET /work-duties/handover-recipients: the colleagues a handover may go to, for
 * someone whose employee reach is only themselves. It is tenant-scoped, never
 * lists the caller, returns exactly id / fullName / employeeCode and at most 20.
 */
describeWithDatabase()('Handover recipients (e2e)', () => {
  jest.setTimeout(300_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let otherTenantId: string;
  let ana: HttpActor; // SELF reach
  let outsider: HttpActor;
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);
  const keys = ['work-items.read', 'work-items.write'];
  const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];

  const get = (actor: HttpActor, path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${actor.token}`)
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
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'wdrec');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('wdrec');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    const unit = await fixtures.createBusinessUnit(tenantId, org);
    const mk = async (label: string) => {
      const made = await scopedActor(prisma, actors, {
        tenantId,
        unit,
        label,
        suffix,
        keys,
        level: SecurityAccessLevel.SELF,
        privileges: rw,
      });
      emp[label] = made.employeeId;
      return made.actor;
    };
    ana = await mk('ana');
    await mk('bo');
    await mk('cy');
    const other = await fixtures.createTenant('wdrecx');
    otherTenantId = other.id;
    const orgX = await fixtures.createOrganization(other.id);
    const unitX = await fixtures.createBusinessUnit(other.id, orgX);
    const made = await scopedActor(prisma, actors, {
      tenantId: other.id,
      unit: unitX,
      label: 'outsider',
      suffix,
      keys,
      level: SecurityAccessLevel.SELF,
      privileges: rw,
    });
    outsider = made.actor;
    emp.outsider = made.employeeId;
  });

  afterAll(async () => {
    try {
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        await prisma.employee.deleteMany({ where: { tenantId: id } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('a SELF-reach employee gets their colleagues, never themselves, with only id, fullName and employeeCode', async () => {
    const res = await get(ana, '/work-duties/handover-recipients');
    expect(res.status).toBe(200);
    const items = res.body.items as Array<Record<string, unknown>>;
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([emp.bo, emp.cy]));
    expect(ids).not.toContain(emp.ana);
    for (const item of items) {
      // nothing beyond what a handover needs: no email, phone, salary, national id
      expect(Object.keys(item).sort()).toEqual([
        'employeeCode',
        'fullName',
        'id',
      ]);
    }
    expect(Object.keys(res.body)).toEqual(['items']);
  });

  it('is tenant-scoped: the other tenant is never listed, and cannot see this tenant', async () => {
    const mine = await get(ana, '/work-duties/handover-recipients');
    expect(
      (mine.body.items as Array<{ id: string }>).map((i) => i.id),
    ).not.toContain(emp.outsider);
    const theirs = await get(outsider, '/work-duties/handover-recipients');
    expect(theirs.status).toBe(200);
    const theirIds = (theirs.body.items as Array<{ id: string }>).map(
      (i) => i.id,
    );
    expect(theirIds).not.toEqual(
      expect.arrayContaining([emp.ana, emp.bo, emp.cy]),
    );
    expect(theirIds).not.toContain(emp.ana);
  });

  it('searches by name and code, and a person who is terminated or deleted is not offered', async () => {
    const found = await get(ana, '/work-duties/handover-recipients?search=cy');
    expect(found.status).toBe(200);
    const foundIds = (found.body.items as Array<{ id: string }>).map(
      (i) => i.id,
    );
    expect(foundIds).toContain(emp.cy);
    expect(foundIds).not.toContain(emp.bo);

    await prisma.employee.update({
      where: { id: emp.cy },
      data: { employmentStatus: 'TERMINATED' },
    });
    const after = await get(ana, '/work-duties/handover-recipients');
    expect(
      (after.body.items as Array<{ id: string }>).map((i) => i.id),
    ).not.toContain(emp.cy);
    await prisma.employee.update({
      where: { id: emp.cy },
      data: { employmentStatus: 'ACTIVE', isDeleted: true },
    });
    const gone = await get(ana, '/work-duties/handover-recipients');
    expect(
      (gone.body.items as Array<{ id: string }>).map((i) => i.id),
    ).not.toContain(emp.cy);
    await prisma.employee.update({
      where: { id: emp.cy },
      data: { isDeleted: false },
    });
  });

  it('returns at most 20 people', async () => {
    const base = await prisma.employee.findUniqueOrThrow({
      where: { id: emp.bo },
    });
    await prisma.employee.createMany({
      data: Array.from({ length: 25 }, (_, n) => ({
        ...base,
        id: randomUUID(),
        userId: null,
        employeeCode: `REC-${suffix}-${n}`,
        firstName: `Rec${n}`,
        email: `rec-${suffix}-${n}@example.invalid`,
      })),
    });
    expect(
      await prisma.employee.count({
        where: { tenantId, employeeCode: { startsWith: `REC-${suffix}-` } },
      }),
    ).toBe(25);
    const res = await get(ana, '/work-duties/handover-recipients');
    expect(res.status).toBe(200);
    expect((res.body.items as unknown[]).length).toBeLessThanOrEqual(20);
  });

  it('lives in the work-management gated controller, and rejects a bad search', async () => {
    expect(
      Reflect.getMetadata(REQUIRED_ENTITLEMENTS_KEY, WorkDutiesController),
    ).toEqual([TENANT_FEATURE_KEYS.WORK_MANAGEMENT]);
    const tooLong = await get(
      ana,
      `/work-duties/handover-recipients?search=${'x'.repeat(101)}`,
    );
    expect(tooLong.status).toBe(400);
    const noToken = await request(app.getHttpServer()).get(
      '/work-duties/handover-recipients',
    );
    expect(noToken.status).toBe(401);
  });
});
