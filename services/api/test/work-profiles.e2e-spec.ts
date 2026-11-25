/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON; assertions read them directly. */
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
 * DP-MASTER WP-35.S1 against a real database, real guard and real HTTP.
 * Acceptance: an administrator configures nurse duties, BPO transactions and
 * developer deliverables with no code; incompatible units and invalid standards
 * are rejected; history is unchanged by later edits; nothing crosses tenants.
 */
describeWithDatabase()('Work profiles (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantA: string;
  let tenantB: string;
  let adminA: HttpActor;
  let adminB: HttpActor;
  let plainA: HttpActor;
  let employeeA: string;
  const suffix = randomUUID().slice(0, 6);

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/work-profiles${path}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };

  const nurse = {
    workTypes: [
      {
        key: 'ward-round',
        name: 'Ward round',
        kind: 'DUTY',
        unitKey: 'duty',
        measurementMode: 'COMPLETION',
        standardEffortMinutes: 45,
      },
      {
        key: 'med-admin',
        name: 'Medication administration',
        kind: 'TRANSACTION',
        unitKey: 'each',
        measurementMode: 'QUANTITY',
        standardEffortMinutes: 4,
      },
    ],
  };

  async function tenantWithAdmin(label: string) {
    const tenant = await fixtures.createTenant(label);
    const org = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, org);
    const admin = await actors.tenantUser(tenant.id, unit, `${label}-admin`);
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
    return { tenant, unit, admin };
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
    fixtures = new DbFixtures(prisma, 'wprof');
    actors = new HttpActors(app, suffix);

    const a = await tenantWithAdmin('wpa');
    const b = await tenantWithAdmin('wpb');
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = a.admin;
    adminB = b.admin;
    plainA = await actors.tenantUser(tenantA, a.unit, 'wpa-plain');
    employeeA = (
      await prisma.employee.create({
        data: {
          tenantId: tenantA,
          employeeCode: `WP-${suffix}`,
          firstName: 'Nora',
          lastName: 'Nurse',
          phone: '0',
          hireDate: new Date('2024-01-01'),
          businessUnitId: a.unit,
        },
        select: { id: true },
      })
    ).id;

    for (const unit of [
      { key: 'duty', name: 'Duty', kind: 'DUTY_COMPLETION' },
      { key: 'each', name: 'Each', kind: 'COUNT' },
      { key: 'hours', name: 'Hours', kind: 'DURATION' },
    ]) {
      expect((await call(adminA, 'post', '/units', unit)).status).toBeLessThan(
        300,
      );
    }
  });

  afterAll(async () => {
    try {
      await prisma.employeeWorkProfileAssignment.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      await prisma.workProfileVersion.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      await prisma.workProfile.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      await prisma.workUnit.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      await prisma.employee.deleteMany({ where: { tenantId: tenantA } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('refuses a user without the permission (403) and an unauthenticated caller (401)', async () => {
    expect((await call(plainA, 'get', '')).status).toBe(403);
    expect(
      (
        await call(plainA, 'post', '', {
          key: 'x1',
          name: 'X',
          definition: nurse,
        })
      ).status,
    ).toBe(403);
    const anon = await request(app.getHttpServer())
      .get('/work-profiles')
      .set('X-DijiPeople-App', 'web');
    expect(anon.status).toBe(401);
  });

  it('configures a nurse profile with no code: create, publish, and read back the version in force', async () => {
    const created = await call(adminA, 'post', '', {
      key: 'nurse',
      name: 'Nurse',
      definition: nurse,
    });
    expect(created.status).toBeLessThan(300);
    const profile = created.body;
    expect(profile.versions).toHaveLength(1);
    expect(profile.versions[0]).toMatchObject({ version: 1, status: 'DRAFT' });

    const published = await call(
      adminA,
      'post',
      `/${profile.id}/versions/${profile.versions[0].id}/publish`,
      {},
    );
    expect(published.status).toBeLessThan(300);
    expect(published.body.versions[0]).toMatchObject({
      version: 1,
      status: 'PUBLISHED',
    });

    const list = await call(adminA, 'get', '');
    const row = list.body.find((p: { key: string }) => p.key === 'nurse');
    expect(row.currentVersion).toMatchObject({ version: 1 });
  });

  it('rejects incompatible units, a standard on timed work and a duplicate key', async () => {
    const timedInCount = {
      workTypes: [
        {
          key: 'dev',
          name: 'Dev',
          kind: 'TASK',
          unitKey: 'each',
          measurementMode: 'TIMED',
        },
      ],
    };
    const profile = await call(adminA, 'post', '', {
      key: 'dev-bad',
      name: 'Dev bad',
      definition: timedInCount,
    });
    expect(profile.status).toBeLessThan(300); // structurally valid, so it saves as a draft
    const publish = await call(
      adminA,
      'post',
      `/${profile.body.id}/versions/${profile.body.versions[0].id}/publish`,
      {},
    );
    expect(publish.status).toBe(400);
    expect(publish.body.message).toContain(
      'TIMED work cannot be measured in a COUNT unit',
    );

    const standardOnTimed = {
      workTypes: [
        {
          key: 'dev',
          name: 'Dev',
          kind: 'TASK',
          unitKey: 'hours',
          measurementMode: 'TIMED',
          standardEffortMinutes: 5,
        },
      ],
    };
    const bad = await call(adminA, 'post', '', {
      key: 'dev-std',
      name: 'Dev std',
      definition: standardOnTimed,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('timed work has no standard effort');

    const dup = await call(adminA, 'post', '', {
      key: 'nurse',
      name: 'Nurse again',
      definition: nurse,
    });
    expect(dup.status).toBe(409);
  });

  it('keeps history: a published version cannot be edited, a new version replaces it, and the old window closes', async () => {
    const profile = (await call(adminA, 'get', '')).body.find(
      (p: { key: string }) => p.key === 'nurse',
    );
    const detail = (await call(adminA, 'get', `/${profile.id}`)).body;
    const v1 = detail.versions[0];

    const edit = await call(
      adminA,
      'patch',
      `/${profile.id}/versions/${v1.id}`,
      { definition: nurse },
    );
    expect(edit.status).toBe(409);
    expect(edit.body.code ?? edit.body.errorCode).toBe(
      'WORK_PROFILE_VERSION_IMMUTABLE',
    );

    const draft = await call(adminA, 'post', `/${profile.id}/versions`);
    expect(draft.status).toBeLessThan(300);
    const second = await call(adminA, 'post', `/${profile.id}/versions`);
    expect(second.status).toBe(409); // one draft at a time

    const v2 = draft.body.versions[0];
    expect(v2).toMatchObject({ version: 2, status: 'DRAFT' });
    const changed = {
      workTypes: [
        ...nurse.workTypes,
        {
          key: 'handover',
          name: 'Shift handover',
          kind: 'DUTY',
          unitKey: 'duty',
          measurementMode: 'COMPLETION',
        },
      ],
    };
    expect(
      (
        await call(adminA, 'patch', `/${profile.id}/versions/${v2.id}`, {
          definition: changed,
        })
      ).status,
    ).toBeLessThan(300);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const published = await call(
      adminA,
      'post',
      `/${profile.id}/versions/${v2.id}/publish`,
      { effectiveFrom: future },
    );
    expect(published.status).toBeLessThan(300);

    const after = (await call(adminA, 'get', `/${profile.id}`)).body;
    const old = after.versions.find(
      (v: { version: number }) => v.version === 1,
    );
    const next = after.versions.find(
      (v: { version: number }) => v.version === 2,
    );
    // The old version is byte-for-byte what it was, and its window now ends where the new one starts.
    expect(old.definition).toEqual(nurse);
    expect(new Date(old.effectiveTo).toISOString()).toBe(future);
    expect(new Date(next.effectiveFrom).toISOString()).toBe(future);

    // Publishing a version that starts before the one it replaces is refused.
    const third = await call(adminA, 'post', `/${profile.id}/versions`);
    const v3 = third.body.versions[0];
    const early = await call(
      adminA,
      'post',
      `/${profile.id}/versions/${v3.id}/publish`,
      {
        effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
      },
    );
    expect(early.status).toBe(400);
  });

  it('assigns a profile over time, refuses an overlap, and only ends (never edits or deletes) an assignment', async () => {
    const profile = (await call(adminA, 'get', '')).body.find(
      (p: { key: string }) => p.key === 'nurse',
    );
    const from = new Date('2026-01-01').toISOString();
    const first = await call(adminA, 'post', '/assignments', {
      employeeId: employeeA,
      profileId: profile.id,
      effectiveFrom: from,
    });
    expect(first.status).toBeLessThan(300);

    const overlap = await call(adminA, 'post', '/assignments', {
      employeeId: employeeA,
      profileId: profile.id,
      effectiveFrom: new Date('2026-06-01').toISOString(),
    });
    expect(overlap.status).toBe(409);

    const ended = await call(
      adminA,
      'patch',
      `/assignments/${first.body.id}/end`,
      { effectiveTo: new Date('2026-03-01').toISOString() },
    );
    expect(ended.status).toBeLessThan(300);
    const extend = await call(
      adminA,
      'patch',
      `/assignments/${first.body.id}/end`,
      { effectiveTo: new Date('2027-01-01').toISOString() },
    );
    expect(extend.status).toBe(400);

    const next = await call(adminA, 'post', '/assignments', {
      employeeId: employeeA,
      profileId: profile.id,
      effectiveFrom: new Date('2026-03-01').toISOString(),
    });
    expect(next.status).toBeLessThan(300); // back-to-back windows are fine
  });

  it("never crosses tenants: B cannot read, edit, publish or assign A, and cannot assign A's employee", async () => {
    const profile = (await call(adminA, 'get', '')).body.find(
      (p: { key: string }) => p.key === 'nurse',
    );
    expect((await call(adminB, 'get', `/${profile.id}`)).status).toBe(404);
    expect(
      (await call(adminB, 'patch', `/${profile.id}`, { name: 'hijack' }))
        .status,
    ).toBe(404);
    expect((await call(adminB, 'post', `/${profile.id}/versions`)).status).toBe(
      404,
    );
    expect((await call(adminB, 'get', '')).body).toEqual([]);
    expect((await call(adminB, 'get', '/units')).body).toEqual([]);
    const cross = await call(adminB, 'post', '/assignments', {
      employeeId: employeeA,
      profileId: profile.id,
      effectiveFrom: new Date('2026-01-01').toISOString(),
    });
    expect(cross.status).toBe(404);
    // Unchanged.
    expect(
      (
        await prisma.workProfile.findUniqueOrThrow({
          where: { id: profile.id },
        })
      ).name,
    ).toBe('Nurse');
    // B's own unit key space is independent of A's.
    expect(
      (
        await call(adminB, 'post', '/units', {
          key: 'each',
          name: 'Each',
          kind: 'COUNT',
        })
      ).status,
    ).toBeLessThan(300);
  });

  it('refuses unknown fields and a client-supplied tenant (400)', async () => {
    const res = await call(adminA, 'post', '/units', {
      key: 'extra',
      name: 'Extra',
      kind: 'COUNT',
      tenantId: tenantB,
    });
    expect(res.status).toBe(400);
  });

  it('exports a published profile as a .djpkg and imports it into another tenant, idempotently', async () => {
    // A profile of its own: earlier cases leave drafts on the shared one.
    const made = await call(adminA, 'post', '', {
      key: 'portable-nurse',
      name: 'Portable nurse',
      definition: nurse,
    });
    expect(made.status).toBeLessThan(300);
    const profile = (
      await call(
        adminA,
        'post',
        `/${made.body.id}/versions/${made.body.versions[0].id}/publish`,
        { effectiveFrom: new Date('2026-01-01').toISOString() },
      )
    ).body;
    const exported = await call(adminA, 'get', `/${profile.id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.body.fileName).toMatch(/\.djpkg$/);

    // Read access alone cannot export; B cannot export A's profile.
    expect((await call(plainA, 'get', `/${profile.id}/export`)).status).toBe(
      403,
    );
    expect((await call(adminB, 'get', `/${profile.id}/export`)).status).toBe(
      404,
    );

    const dry = await call(adminB, 'post', '/import', {
      content: exported.body.content,
      dryRun: true,
    });
    expect(dry.status).toBeLessThan(300);
    expect(
      dry.body.items.find(
        (i: { key: string }) => i.key === 'workProfile:portable-nurse',
      ),
    ).toMatchObject({ action: 'create' });
    expect((await call(adminB, 'get', '')).body).toEqual([]); // dry run wrote nothing

    const first = await call(adminB, 'post', '/import', {
      content: exported.body.content,
    });
    expect(first.status).toBeLessThan(300);
    const imported = (await call(adminB, 'get', '')).body.find(
      (p: { key: string }) => p.key === 'portable-nurse',
    );
    expect(imported.currentVersion).toMatchObject({
      version: 1,
      status: 'PUBLISHED',
    });
    // Landed in B's tenant, never A's.
    expect(
      (
        await prisma.workProfile.findUniqueOrThrow({
          where: { id: imported.id },
        })
      ).tenantId,
    ).toBe(tenantB);

    const again = await call(adminB, 'post', '/import', {
      content: exported.body.content,
    });
    expect(again.status).toBeLessThan(300);
    expect(
      again.body.items.every(
        (i: { action: string }) => i.action === 'unchanged',
      ),
    ).toBe(true);
    const detail = await call(adminB, 'get', `/${imported.id}`);
    expect(detail.body.versions).toHaveLength(1);

    // A changed definition publishes the next version, never rewrites history.
    const draft = await call(adminA, 'post', `/${profile.id}/versions`);
    const draftId = draft.body.versions.find(
      (v: { status: string }) => v.status === 'DRAFT',
    ).id;
    await call(adminA, 'patch', `/${profile.id}/versions/${draftId}`, {
      definition: {
        workTypes: [
          { ...nurse.workTypes[0], standardEffortMinutes: 50 },
          nurse.workTypes[1],
        ],
      },
    });
    const published = await call(
      adminA,
      'post',
      `/${profile.id}/versions/${draftId}/publish`,
      {
        effectiveFrom: new Date(Date.now() + 1000).toISOString(),
      },
    );
    expect(published.status).toBeLessThan(300);
    const second = await call(adminA, 'get', `/${profile.id}/export`);
    const next = await call(adminB, 'post', '/import', {
      content: second.body.content,
    });
    expect(next.status).toBeLessThan(300);
    expect(
      (await call(adminB, 'get', `/${imported.id}`)).body.versions,
    ).toHaveLength(2);

    // A hand-edited package is refused outright.
    const doc = JSON.parse(second.body.content as string);
    doc.components[doc.components.length - 1].definition.name = 'Hacked';
    const bad = await call(adminB, 'post', '/import', {
      content: JSON.stringify(doc),
    });
    expect(bad.status).toBe(400);
  });
});
