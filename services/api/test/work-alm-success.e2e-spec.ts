/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { roleActor } from './helpers/role-actors';

/**
 * The ALM success path for work components, over HTTP with the real guards.
 *
 * ITEM-0248: no SEEDED role holds both the package permissions and the work-profile
 * permissions, so before this suite the happy path was only ever exercised by
 * service-level tests that hand the service a pre-built user. Here a throwaway role
 * holds exactly both permission sets (and nothing else) and drives the whole
 * journey; users holding only one set are refused. Seeds and the matrix are NOT
 * touched - who SHOULD hold both is an owner decision (ITEM-0248).
 *
 * Needs a UTF-8 database: names below are deliberately non-ASCII (accents, Arabic,
 * CJK) to prove they survive export, import and re-read. Run with
 *   DATABASE_URL=.../dp_master_utf8  jest --runInBand
 */
describeWithDatabase({ requireUtf8: true })(
  'Work components ALM success path (e2e, HTTP)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    const suffix = randomUUID().slice(0, 6);
    const tenantIds: string[] = [];

    let src: { tenantId: string; both: HttpActor; pkgOnly: HttpActor };
    let dst: {
      tenantId: string;
      both: HttpActor;
      pkgOnly: HttpActor;
      workOnly: HttpActor;
    };
    let adopt: { tenantId: string; both: HttpActor };

    const PACKAGE_KEYS = [
      'customization.read',
      'customization.publish',
      'customization.packages.manage',
      'customization.packages.release',
      'customization.packages.import',
      'customization.packages.uninstall',
      'customization.export',
    ];
    const WORK_KEYS = [
      'work-profiles.read',
      'work-profiles.manage',
      'work-queues.read',
      'work-queues.manage',
    ];
    const P = SecurityPrivilege;
    const PACKAGE_GRANT = {
      entityKey: ENTITY_KEYS.CUSTOMIZATION,
      privileges: [P.READ, P.CONFIGURE, P.EXPORT, P.IMPORT, P.DELETE],
    };
    const WORK_GRANT = {
      entityKey: ENTITY_KEYS.EMPLOYEES,
      privileges: [P.READ, P.MANAGE],
    };

    // Non-ASCII on purpose (UTF-8 round trip).
    const UNIT_NAME = 'Durée de visite — 任务';
    const PROFILE_NAME = 'Infirmière de salle — مُمَرِّض';
    const QUEUE_NAME = 'Soporte técnico — 支持 ✓';
    const PACKAGE_NAME = 'Pack travail — حزمة العمل';

    const nurse = () => ({
      workTypes: [
        {
          key: 'ward-round',
          name: 'Tournée — جولة',
          kind: 'DUTY',
          unitKey: 'duty',
          measurementMode: 'COMPLETION',
          standardEffortMinutes: 45,
        },
      ],
    });

    const as = (actor: HttpActor) => ({
      get: (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-DijiPeople-App', 'web'),
      post: (path: string, body?: object) => {
        const req = request(app.getHttpServer())
          .post(path)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-DijiPeople-App', 'web');
        return body ? req.send(body) : req;
      },
    });

    async function workspace(
      label: string,
      environmentType: 'DEVELOPMENT' | 'PRODUCTION',
    ) {
      const t = await fixtures.createTenant(label, { environmentType });
      tenantIds.push(t.id);
      const org = await fixtures.createOrganization(t.id);
      const unit = await fixtures.createBusinessUnit(t.id, org);
      const mk = (name: string, keys: string[], grants: object[]) =>
        roleActor(prisma, actors, {
          tenantId: t.id,
          unit,
          label: `${label}-${name}`,
          suffix,
          keys,
          grants: grants as never,
        });
      return { tenantId: t.id, mk };
    }

    async function analyze(actor: HttpActor, content: string) {
      return as(actor)
        .post('/customization/package-imports/analyze')
        .attach('file', Buffer.from(content, 'utf8'), {
          filename: 'work.djpkg',
          contentType: 'application/json',
        });
    }

    let artifact = '';
    let sourcePackageId = '';

    beforeAll(async () => {
      process.env.SECRET_ENCRYPTION_KEY ||= 'work-alm-success-e2e-key';
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
      fixtures = new DbFixtures(prisma, 'walm');
      actors = new HttpActors(app, suffix);

      const s = await workspace('src', 'DEVELOPMENT');
      src = {
        tenantId: s.tenantId,
        both: await s.mk(
          'both',
          [...PACKAGE_KEYS, ...WORK_KEYS],
          [PACKAGE_GRANT, WORK_GRANT],
        ),
        pkgOnly: await s.mk('pkg', PACKAGE_KEYS, [PACKAGE_GRANT]),
      };
      const d = await workspace('dst', 'PRODUCTION');
      dst = {
        tenantId: d.tenantId,
        both: await d.mk(
          'both',
          [...PACKAGE_KEYS, ...WORK_KEYS],
          [PACKAGE_GRANT, WORK_GRANT],
        ),
        pkgOnly: await d.mk('pkg', PACKAGE_KEYS, [PACKAGE_GRANT]),
        workOnly: await d.mk('work', WORK_KEYS, [WORK_GRANT]),
      };
      const a = await workspace('adopt', 'PRODUCTION');
      adopt = {
        tenantId: a.tenantId,
        both: await a.mk(
          'both',
          [...PACKAGE_KEYS, ...WORK_KEYS],
          [PACKAGE_GRANT, WORK_GRANT],
        ),
      };
    });

    afterAll(async () => {
      try {
        for (const tenantId of tenantIds) {
          await prisma.errorLog.deleteMany({ where: { tenantId } });
        }
        await actors?.cleanup();
        await fixtures?.cleanup();
      } finally {
        await app?.close();
      }
    });

    /* ------------------------------------------------------------ source */

    it('the throwaway role holds exactly both permission sets and builds the work content over HTTP', async () => {
      const unit = await as(src.both).post('/work-profiles/units', {
        key: 'duty',
        name: UNIT_NAME,
        kind: 'DUTY_COMPLETION',
      });
      expect(unit.status).toBe(201);
      const profile = await as(src.both).post('/work-profiles', {
        key: 'nurse-ward',
        name: PROFILE_NAME,
        description: 'Salle — وصف',
        definition: nurse(),
      });
      expect(profile.status).toBe(201);
      const published = await as(src.both).post(
        `/work-profiles/${profile.body.id}/versions/${profile.body.versions[0].id}/publish`,
        {},
      );
      expect(published.status).toBeLessThan(300);
      const queue = await as(src.both).post('/work-queues', {
        key: 'support-l1',
        name: QUEUE_NAME,
        description: 'Première ligne',
        responseSlaMinutes: 30,
        resolutionSlaMinutes: 480,
      });
      expect(queue.status).toBe(201);
    });

    it('export: package, work components, release and download through the routes', async () => {
      const created = await as(src.both).post('/customization/packages', {
        packageKey: 'wrk_almpack',
        displayName: PACKAGE_NAME,
        publisherName: 'WRK',
        version: '1.0.0',
      });
      expect(created.status).toBe(201);
      sourcePackageId = created.body.id;

      // Duty templates are NOT a packageable component type: refused by validation.
      const template = await as(src.both).post(
        `/customization/packages/${sourcePackageId}/work-components`,
        { components: [{ type: 'workDutyTemplate', key: 'ward-round' }] },
      );
      expect(template.status).toBe(400);

      const added = await as(src.both).post(
        `/customization/packages/${sourcePackageId}/work-components`,
        {
          components: [
            { type: 'workProfile', key: 'nurse-ward' },
            { type: 'workUnit', key: 'duty' },
            { type: 'workQueue', key: 'support-l1' },
          ],
        },
      );
      expect(added.status).toBe(201);
      expect(added.body.added).toEqual([
        'workProfile:nurse-ward',
        'workQueue:support-l1',
        'workUnit:duty',
      ]);

      const released = await as(src.both).post(
        `/customization/packages/${sourcePackageId}/release`,
        {},
      );
      expect(released.status).toBe(201);
      expect(released.body.version).toBe('1.0.0');
      expect(released.body.componentCount).toBe(3);

      const download = await as(src.both)
        .get(
          `/customization/packages/${sourcePackageId}/versions/1.0.0/artifact`,
        )
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            callback(null, Buffer.concat(chunks).toString('utf8')),
          );
        });
      expect(download.status).toBe(200);
      artifact = download.body as unknown as string;

      // UTF-8 survives, and nothing tenant-specific travels.
      for (const text of [UNIT_NAME, PROFILE_NAME, QUEUE_NAME, PACKAGE_NAME]) {
        expect(artifact).toContain(text);
      }
      expect(artifact).not.toContain(src.tenantId);
      expect(artifact).not.toMatch(/"(tenantId|businessUnitId|teamId)"/);
    });

    /* --------------------------------------------------- permission halves */

    it('a user holding only the package permissions is refused with a clear error, at add and at import', async () => {
      const add = await as(src.pkgOnly).post(
        `/customization/packages/${sourcePackageId}/work-components`,
        { components: [{ type: 'workQueue', key: 'support-l1' }] },
      );
      expect(add.status).toBe(403);
      expect(add.body.message).toMatch(/work-queues\.manage/);

      const analysis = await analyze(dst.pkgOnly, artifact);
      expect(analysis.status).toBe(201);
      expect(analysis.body.status).toBe('BLOCKED');
      const issues = JSON.stringify(analysis.body.plan);
      expect(issues).toContain('WORK_PERMISSION_REQUIRED');
      expect(issues).toContain('work-profiles.manage');
      expect(issues).toContain('work-queues.manage');

      const execute = await as(dst.pkgOnly).post(
        `/customization/package-imports/${analysis.body.id}/execute`,
        {},
      );
      expect(execute.status).toBeGreaterThanOrEqual(400);
      expect(execute.body.errorCode).toBe('PACKAGE_IMPORT_BLOCKED');
      expect(
        await prisma.workQueue.count({ where: { tenantId: dst.tenantId } }),
      ).toBe(0);
    });

    it('a user holding only the work permissions cannot reach the package routes', async () => {
      const res = await analyze(dst.workOnly, artifact);
      expect(res.status).toBe(403);
      expect(
        await prisma.workUnit.count({ where: { tenantId: dst.tenantId } }),
      ).toBe(0);
    });

    /* ---------------------------------------------------------------- import */

    it('analysis is a dry run; import lands the components tenant-scoped, with provenance and intact UTF-8', async () => {
      const analysis = await analyze(dst.both, artifact);
      expect(analysis.status).toBe(201);
      expect(analysis.body.status).toBe('READY');
      expect(analysis.body.plan.mode).toBe('INSTALL');
      expect(
        analysis.body.plan.items
          .map(
            (item: { key: string; status: string }) =>
              `${item.key}=${item.status}`,
          )
          .sort(),
      ).toEqual([
        'workProfile:nurse-ward=NEW',
        'workQueue:support-l1=NEW',
        'workUnit:duty=NEW',
      ]);
      expect(
        await prisma.workQueue.count({ where: { tenantId: dst.tenantId } }),
      ).toBe(0);

      const executed = await as(dst.both).post(
        `/customization/package-imports/${analysis.body.id}/execute`,
        {},
      );
      expect(executed.status).toBeLessThan(300);
      expect(executed.body.status).toBe('COMPLETED');

      const unit = await prisma.workUnit.findFirstOrThrow({
        where: { tenantId: dst.tenantId, key: 'duty' },
      });
      const profile = await prisma.workProfile.findFirstOrThrow({
        where: { tenantId: dst.tenantId, key: 'nurse-ward' },
        include: { versions: true },
      });
      const queue = await prisma.workQueue.findFirstOrThrow({
        where: { tenantId: dst.tenantId, key: 'support-l1' },
      });
      expect([unit.name, profile.name, queue.name]).toEqual([
        UNIT_NAME,
        PROFILE_NAME,
        QUEUE_NAME,
      ]);
      expect(profile.versions).toHaveLength(1);
      expect(profile.versions[0].status).toBe('PUBLISHED');
      expect(queue.isActive).toBe(true);

      // Tenant-scoped: nothing leaked onto the source or the third workspace,
      // and the target rows have their own ids.
      const srcUnit = await prisma.workUnit.findFirstOrThrow({
        where: { tenantId: src.tenantId, key: 'duty' },
      });
      expect(srcUnit.id).not.toBe(unit.id);
      expect(
        await prisma.workQueue.count({ where: { tenantId: adopt.tenantId } }),
      ).toBe(0);

      // Provenance: an IMPORTED solution owns each component by logical key.
      const solution = await prisma.customizationSolution.findFirstOrThrow({
        where: { tenantId: dst.tenantId, solutionKey: 'wrk_almpack' },
      });
      expect(solution.origin).toBe('IMPORTED');
      const members = await prisma.customizationSolutionComponent.findMany({
        where: { tenantId: dst.tenantId, solutionId: solution.id },
        select: { componentType: true, objectKey: true, objectId: true },
      });
      expect(
        members.map((m) => `${m.componentType}:${m.objectKey}`).sort(),
      ).toEqual([
        'workProfile:nurse-ward',
        'workQueue:support-l1',
        'workUnit:duty',
      ]);
      expect(members.find((m) => m.objectKey === 'support-l1')!.objectId).toBe(
        queue.id,
      );
    });

    it('re-importing is idempotent', async () => {
      const before = {
        units: await prisma.workUnit.count({
          where: { tenantId: dst.tenantId },
        }),
        versions: await prisma.workProfileVersion.count({
          where: { tenantId: dst.tenantId },
        }),
        queues: await prisma.workQueue.count({
          where: { tenantId: dst.tenantId },
        }),
      };
      const analysis = await analyze(dst.both, artifact);
      expect(analysis.body.plan.mode).toBe('REINSTALL');
      expect(analysis.body.counts).toMatchObject({ created: 0, updated: 0 });
      const executed = await as(dst.both).post(
        `/customization/package-imports/${analysis.body.id}/execute`,
        {},
      );
      expect(executed.body.status).toBe('COMPLETED');
      expect({
        units: await prisma.workUnit.count({
          where: { tenantId: dst.tenantId },
        }),
        versions: await prisma.workProfileVersion.count({
          where: { tenantId: dst.tenantId },
        }),
        queues: await prisma.workQueue.count({
          where: { tenantId: dst.tenantId },
        }),
      }).toEqual(before);
    });

    /* ------------------------------------------------------------ uninstall */

    it('uninstall deactivates the components and keeps them (ADR-0031)', async () => {
      const solution = await prisma.customizationSolution.findFirstOrThrow({
        where: { tenantId: dst.tenantId, solutionKey: 'wrk_almpack' },
      });
      const check = await as(dst.both).get(
        `/customization/packages/${solution.id}/uninstall-check`,
      );
      expect(check.status).toBe(200);
      expect(check.body.canUninstall).toBe(true);

      const res = await as(dst.both).post(
        `/customization/packages/${solution.id}/uninstall`,
        {},
      );
      expect(res.status).toBeLessThan(300);
      expect(res.body.result.retainedWorkComponents.sort()).toEqual([
        'workProfile:nurse-ward',
        'workQueue:support-l1',
        'workUnit:duty',
      ]);
      expect(
        (
          await prisma.workQueue.findFirstOrThrow({
            where: { tenantId: dst.tenantId, key: 'support-l1' },
          })
        ).isActive,
      ).toBe(false);
      expect(
        (
          await prisma.workProfile.findFirstOrThrow({
            where: { tenantId: dst.tenantId, key: 'nurse-ward' },
          })
        ).isActive,
      ).toBe(false);
      expect(
        await prisma.customizationSolution.count({
          where: { tenantId: dst.tenantId, solutionKey: 'wrk_almpack' },
        }),
      ).toBe(0);
      // Never touched the source workspace.
      expect(
        (
          await prisma.workQueue.findFirstOrThrow({
            where: { tenantId: src.tenantId, key: 'support-l1' },
          })
        ).isActive,
      ).toBe(true);
    });

    it('an identical unowned local component is adopted, not reported as a conflict (ADR-0031)', async () => {
      const queue = await as(adopt.both).post('/work-queues', {
        key: 'support-l1',
        name: QUEUE_NAME,
        description: 'Première ligne',
        responseSlaMinutes: 30,
        resolutionSlaMinutes: 480,
      });
      expect(queue.status).toBe(201);

      const analysis = await analyze(adopt.both, artifact);
      expect(analysis.body.status).toBe('READY');
      const status = Object.fromEntries(
        analysis.body.plan.items.map(
          (item: { key: string; status: string }) => [item.key, item.status],
        ),
      );
      expect(status['workQueue:support-l1']).toBe('UPDATE');
      expect(status['workUnit:duty']).toBe('NEW');

      const executed = await as(adopt.both).post(
        `/customization/package-imports/${analysis.body.id}/execute`,
        {},
      );
      expect(executed.body.status).toBe('COMPLETED');
      expect(
        await prisma.workQueue.count({
          where: { tenantId: adopt.tenantId, key: 'support-l1' },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.workQueue.findFirstOrThrow({
            where: { tenantId: adopt.tenantId, key: 'support-l1' },
          })
        ).id,
      ).toBe(queue.body.id);

      // Once adopted, uninstalling the package deactivates it like any other member.
      const solution = await prisma.customizationSolution.findFirstOrThrow({
        where: { tenantId: adopt.tenantId, solutionKey: 'wrk_almpack' },
      });
      const gone = await as(adopt.both).post(
        `/customization/packages/${solution.id}/uninstall`,
        {},
      );
      expect(gone.status).toBeLessThan(300);
      expect(
        (
          await prisma.workQueue.findFirstOrThrow({
            where: { id: queue.body.id },
          })
        ).isActive,
      ).toBe(false);
    });
  },
);
