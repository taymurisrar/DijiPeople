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
 * TASK-0036 — document types gain an edit route and a settings screen; and
 * BUG-3809 — a tenant route honoured `isGlobal` and wrote types and categories
 * with no tenant, which every tenant then saw. Full app over HTTP, pipe as in
 * `main.ts`.
 */
describeWithDatabase()('Document types (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let alpha: HttpActor;
  let beta: HttpActor;
  const roleIds: string[] = [];
  const globalTypeIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);

  async function adminOf(label: string) {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const actor = await actors.tenantUser(tenant.id, unit, label);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: actor.id, roleId: role.id },
    });
    return actor;
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
    fixtures = new DbFixtures(prisma, 'doc-types');
    actors = new HttpActors(app, suffix);
    alpha = await adminOf('dta');
    beta = await adminOf('dtb');
  });

  afterAll(async () => {
    await prisma.documentType.deleteMany({
      where: { id: { in: globalTypeIds } },
    });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };
  type TypeRow = {
    id: string;
    key: string;
    name: string;
    tenantId: string | null;
  };

  let typeId: string;

  it('creates, reads and edits a tenant document type', async () => {
    const created = await call(alpha, 'post', 'documents/types', {
      key: `visa-${suffix}`,
      name: 'Visa',
    });
    expect(created.status).toBe(201);
    typeId = (created.body as TypeRow).id;

    const read = await call(alpha, 'get', `documents/types/${typeId}`);
    expect((read.body as TypeRow).name).toBe('Visa');

    /* The whole record posted back, as the settings form does. */
    const updated = await call(alpha, 'patch', `documents/types/${typeId}`, {
      key: `visa-${suffix}`,
      name: 'Work visa',
      isActive: true,
    });
    expect(updated.status).toBe(200);
    expect((updated.body as TypeRow).name).toBe('Work visa');
  });

  it('refuses a changed key', async () => {
    const refused = await call(alpha, 'patch', `documents/types/${typeId}`, {
      key: 'something-else',
    });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain(
      'DOCUMENT_TYPE_KEY_IMMUTABLE',
    );
  });

  it('never lets a tenant create a shared type or category (BUG-3809)', async () => {
    const type = await call(alpha, 'post', 'documents/types', {
      key: `g-${suffix}`,
      name: 'Global',
      isGlobal: true,
    });
    expect(type.status).toBe(403);
    const category = await call(alpha, 'post', 'documents/categories', {
      name: `Global ${suffix}`,
      isGlobal: true,
    });
    expect(category.status).toBe(403);
    expect(
      await prisma.documentType.count({ where: { key: `g-${suffix}` } }),
    ).toBe(0);
  });

  it('does not let a tenant edit a shared type', async () => {
    const shared = await prisma.documentType.create({
      data: { tenantId: null, key: `shared-${suffix}`, name: 'Shared' },
      select: { id: true },
    });
    globalTypeIds.push(shared.id);
    const refused = await call(alpha, 'patch', `documents/types/${shared.id}`, {
      name: 'Mine now',
    });
    expect(refused.status).toBe(400);
  });

  it("keeps one tenant's type from another", async () => {
    const list = await call(beta, 'get', 'documents/types');
    const keys = (list.body as TypeRow[]).map((row) => row.key);
    expect(keys).not.toContain(`visa-${suffix}`);
    const read = await call(beta, 'get', `documents/types/${typeId}`);
    expect(read.status).toBe(404);
  });
});
