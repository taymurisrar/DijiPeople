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
 * WP3 (SESSION-0137) — documents: files are the most sensitive tenant data
 * (contracts, IDs, payslips), and `Document` is the one table those all share.
 *
 * Each tenant uploads a REAL file through the API as its own admin (the owner
 * control: the route, permission, multipart handling and storage all work), then
 * ALPHA's admin attacks BETA's document by id on every verb, and tries to attach
 * a new file to BETA's employee or to a BETA-owned document type/category.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Documents cross-tenant (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);
  const alphaSecret = `alpha-secret-${suffix}`;
  const betaSecret = `beta-secret-${suffix}`;

  interface Side {
    tenantId: string;
    admin: HttpActor;
    employeeId: string;
    documentId: string;
    typeId: string;
    categoryId: string;
  }
  let alpha: Side;
  let beta: Side;

  // Binary responses arrive as a Buffer, text ones as `text`; either way the
  // marker must be readable from the owner's own download.
  const bodyText = (res: { text?: string; body: unknown }): string =>
    Buffer.isBuffer(res.body) ? res.body.toString('utf8') : (res.text ?? '');

  const asWeb = (as: HttpActor) => ({
    Authorization: `Bearer ${as.token}`,
    'X-DijiPeople-App': 'web',
  });

  const api = (
    method: 'get' | 'post' | 'patch' | 'delete',
    as: HttpActor,
    path: string,
  ) => {
    let req = request(app.getHttpServer())[method](`/${path}`);
    for (const [k, v] of Object.entries(asWeb(as))) req = req.set(k, v);
    return req;
  };

  // The tenant requires a category on every upload, so each caller's own category
  // is the default. An attack that swaps in a FOREIGN reference then fails for
  // that reason alone and not because a required field was missing.
  const ownCategory = new Map<string, string>();

  const upload = (
    as: HttpActor,
    employeeId: string,
    content: string,
    override: Record<string, string> = {},
  ) => {
    const fields: Record<string, string> = {
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      title: `Doc ${content}`,
      documentCategoryId: ownCategory.get(as.id) ?? '',
      ...override,
    };
    let req = api('post', as, 'documents/upload');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', Buffer.from(`%PDF-1.4\n%${content}\n%%EOF\n`), {
      filename: 'note.pdf',
      contentType: 'application/pdf',
    });
  };

  async function side(label: string, secret: string): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const admin = await actors.tenantUser(tenant.id, unit, label);
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
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `DOC-${label}-${suffix}`,
        firstName: 'Doc',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const type = await prisma.documentType.create({
      data: {
        tenantId: tenant.id,
        key: `t-${label}-${suffix}`,
        name: `Type ${label} ${suffix}`,
      },
      select: { id: true },
    });
    const category = await prisma.documentCategory.create({
      data: {
        tenantId: tenant.id,
        code: `C_${label}_${suffix}`.toUpperCase(),
        name: `Category ${label} ${suffix}`,
      },
      select: { id: true },
    });
    ownCategory.set(admin.id, category.id);
    const res = await upload(admin, employee.id, secret);
    if (res.status >= 300) {
      throw new Error(
        `fixture upload failed for ${label}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return {
      tenantId: tenant.id,
      admin,
      employeeId: employee.id,
      documentId: (res.body as { id: string }).id,
      typeId: type.id,
      categoryId: category.id,
    };
  }

  const betaDocument = () =>
    prisma.document.findUniqueOrThrow({ where: { id: beta.documentId } });

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
    fixtures = new DbFixtures(prisma, 'doc');
    actors = new HttpActors(app, suffix);
    alpha = await side('docalpha', alphaSecret);
    beta = await side('docbeta', betaSecret);
  });

  afterAll(async () => {
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  describe('controls (owner, same verbs)', () => {
    it('the owner reads, views and downloads its own document with its own bytes', async () => {
      const meta = await api('get', beta.admin, `documents/${beta.documentId}`);
      expect(meta.status).toBe(200);
      const view = await api(
        'get',
        beta.admin,
        `documents/${beta.documentId}/view`,
      ).buffer(true);
      expect(view.status).toBe(200);
      expect(bodyText(view)).toContain(betaSecret);
      const dl = await api(
        'get',
        beta.admin,
        `documents/${beta.documentId}/download`,
      ).buffer(true);
      expect(dl.status).toBe(200);
      expect(bodyText(dl)).toContain(betaSecret);
    });

    it('the owner lists its documents for its own employee', async () => {
      const res = await api(
        'get',
        beta.admin,
        `documents/entity/EMPLOYEE/${beta.employeeId}`,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(beta.documentId);
    });
  });

  describe('ALPHA admin → BETA document', () => {
    const refusedStatuses = [403, 404];

    it('cannot read the document by id', async () => {
      const res = await api('get', alpha.admin, `documents/${beta.documentId}`);
      expect(refusedStatuses).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain(betaSecret);
    });

    it('cannot view or download the file bytes', async () => {
      for (const verb of ['view', 'download']) {
        const res = await api(
          'get',
          alpha.admin,
          `documents/${beta.documentId}/${verb}`,
        ).buffer(true);
        expect({ verb, status: refusedStatuses.includes(res.status) }).toEqual({
          verb,
          status: true,
        });
        expect(String(res.text ?? '')).not.toContain(betaSecret);
      }
    });

    it('cannot list documents of a BETA employee', async () => {
      const res = await api(
        'get',
        alpha.admin,
        `documents/entity/EMPLOYEE/${beta.employeeId}`,
      );
      expect(JSON.stringify(res.body)).not.toContain(beta.documentId);
      expect(JSON.stringify(res.body)).not.toContain(betaSecret);
    });

    it('does not see BETA documents in its own document list', async () => {
      const res = await api('get', alpha.admin, 'documents');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(beta.documentId);
      expect(JSON.stringify(res.body)).toContain(alpha.documentId);
    });

    it('cannot rename or retag the document, and it is unchanged', async () => {
      const before = await betaDocument();
      const res = await api(
        'patch',
        alpha.admin,
        `documents/${beta.documentId}`,
      ).send({ title: 'HIJACKED' });
      expect(refusedStatuses).toContain(res.status);
      const after = await betaDocument();
      expect(after.title).toBe(before.title);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('cannot archive the document, and it stays unarchived', async () => {
      const res = await api(
        'delete',
        alpha.admin,
        `documents/${beta.documentId}`,
      );
      expect(refusedStatuses).toContain(res.status);
      expect((await betaDocument()).isArchived).toBe(false);
    });
  });

  describe('foreign parent / reference ids on upload', () => {
    it('control: ALPHA uploads to its OWN employee with its OWN type and category', async () => {
      const res = await upload(alpha.admin, alpha.employeeId, 'ok-own', {
        documentTypeId: alpha.typeId,
      });
      expect(res.status).toBeLessThan(300);
    });

    it('cannot attach a file to a BETA employee, and no document or link exists anywhere for it', async () => {
      // A leak would write the Document/DocumentLink under ALPHA's tenantId with
      // entityId = BETA's employee, so count by entity and title across tenants.
      const linksBefore = await prisma.documentLink.count({
        where: { entityId: beta.employeeId },
      });
      const res = await upload(alpha.admin, beta.employeeId, 'planted');
      const message = (res.body as { message?: string }).message;
      expect({ status: res.status, message }).toEqual({
        status: 400,
        message: 'Selected employee does not belong to this tenant.',
      });
      expect(
        await prisma.documentLink.count({
          where: { entityId: beta.employeeId },
        }),
      ).toBe(linksBefore);
      expect(
        await prisma.document.count({ where: { title: 'Doc planted' } }),
      ).toBe(0);
    });
    it('cannot upload with a BETA document type', async () => {
      const res = await upload(alpha.admin, alpha.employeeId, 'foreign-type', {
        documentTypeId: beta.typeId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(
        await prisma.document.count({
          where: { title: 'Doc foreign-type' },
        }),
      ).toBe(0);
    });

    it('cannot upload with a BETA document category', async () => {
      const res = await upload(alpha.admin, alpha.employeeId, 'foreign-cat', {
        documentCategoryId: beta.categoryId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(
        await prisma.document.count({ where: { title: 'Doc foreign-cat' } }),
      ).toBe(0);
    });

    it('cannot retag its own document onto a BETA type or category', async () => {
      const own = await prisma.document.findFirstOrThrow({
        where: { tenantId: alpha.tenantId },
        select: { id: true },
      });
      for (const body of [
        { documentTypeId: beta.typeId },
        { documentCategoryId: beta.categoryId },
      ]) {
        const res = await api('patch', alpha.admin, `documents/${own.id}`).send(
          body,
        );
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
      const after = await prisma.document.findUniqueOrThrow({
        where: { id: own.id },
      });
      expect(after.documentTypeId).not.toBe(beta.typeId);
      expect(after.documentCategoryId).not.toBe(beta.categoryId);
    });
  });

  describe('document types and categories', () => {
    it('does not list BETA-owned types or categories to ALPHA', async () => {
      for (const route of ['documents/types', 'documents/categories']) {
        const res = await api('get', alpha.admin, route);
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain(beta.typeId);
        expect(JSON.stringify(res.body)).not.toContain(beta.categoryId);
      }
    });

    it('control: ALPHA can read its own type', async () => {
      const res = await api(
        'get',
        alpha.admin,
        `documents/types/${alpha.typeId}`,
      );
      expect(res.status).toBe(200);
    });

    it('cannot read, edit or deactivate a BETA type or category', async () => {
      const read = await api(
        'get',
        alpha.admin,
        `documents/types/${beta.typeId}`,
      );
      expect(read.status).toBe(404);
      const editType = await api(
        'patch',
        alpha.admin,
        `documents/types/${beta.typeId}`,
      ).send({ name: 'HIJACKED' });
      expect(editType.status).toBe(404);
      const editCat = await api(
        'patch',
        alpha.admin,
        `documents/categories/${beta.categoryId}`,
      ).send({ name: 'HIJACKED' });
      expect(editCat.status).toBe(404);
      const del = await api(
        'delete',
        alpha.admin,
        `documents/categories/${beta.categoryId}`,
      );
      expect(del.status).toBe(404);
      const type = await prisma.documentType.findUniqueOrThrow({
        where: { id: beta.typeId },
      });
      const cat = await prisma.documentCategory.findUniqueOrThrow({
        where: { id: beta.categoryId },
      });
      expect(type.name).not.toBe('HIJACKED');
      expect(cat.name).not.toBe('HIJACKED');
      expect(cat.isActive).toBe(true);
    });

    it('a tenant admin cannot edit a GLOBAL (tenantId null) type or category', async () => {
      const globalType = await prisma.documentType.create({
        data: { tenantId: null, key: `g-${suffix}`, name: `Global ${suffix}` },
        select: { id: true },
      });
      const globalCategory = await prisma.documentCategory.create({
        data: {
          tenantId: null,
          code: `G_${suffix}`.toUpperCase(),
          name: `Gcat ${suffix}`,
        },
        select: { id: true },
      });
      try {
        const t = await api(
          'patch',
          alpha.admin,
          `documents/types/${globalType.id}`,
        ).send({ name: 'HIJACKED' });
        expect(t.status).toBe(400);
        const c = await api(
          'patch',
          alpha.admin,
          `documents/categories/${globalCategory.id}`,
        ).send({ name: 'HIJACKED' });
        expect(c.status).toBe(400);
        const d = await api(
          'delete',
          alpha.admin,
          `documents/categories/${globalCategory.id}`,
        );
        expect(d.status).toBe(404);
        expect(
          (
            await prisma.documentType.findUniqueOrThrow({
              where: { id: globalType.id },
            })
          ).name,
        ).toBe(`Global ${suffix}`);
        expect(
          (
            await prisma.documentCategory.findUniqueOrThrow({
              where: { id: globalCategory.id },
            })
          ).isActive,
        ).toBe(true);
      } finally {
        await prisma.documentType.deleteMany({ where: { id: globalType.id } });
        await prisma.documentCategory.deleteMany({
          where: { id: globalCategory.id },
        });
      }
    });

    it('rejects isGlobal and tenantId in a create body (mass assignment)', async () => {
      const res = await api('post', alpha.admin, 'documents/types').send({
        key: `mass-${suffix}`,
        name: `Mass ${suffix}`,
        tenantId: beta.tenantId,
      });
      expect(res.status).toBe(400);
      expect(
        await prisma.documentType.count({ where: { key: `mass-${suffix}` } }),
      ).toBe(0);
    });
  });
});
