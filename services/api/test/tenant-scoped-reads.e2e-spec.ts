/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
 * Reads untyped controller results and Reflect metadata. Scoped to this file so the API lint
 * warning budget (CI --max-warnings) is neither spent nor raised on it. */
/**
 * The four tenant-scoped reads the authorization register flagged P2
 * (TENANT_SCOPED_NO_ACTION_AUTHZ), on REAL PostgreSQL:
 *
 *   GET runtime-metadata/published
 *   GET organization-hierarchy/tree
 *   GET error-logs/:traceId
 *   GET error-logs/:traceId/download
 *
 * They declare no @Permissions on purpose (every signed-in user needs the metadata
 * and the structure to render the app; an error reference belongs to whoever hit it).
 * What must hold instead — and what is proven here — is authentication, tenant
 * isolation, owner-or-support access to a log, redaction of what a log stores, and
 * a foreign reference that is indistinguishable from one that does not exist.
 * Review notes: docs/engineering/security/api-route-review-2026-11-03.md.
 *
 * Disposable database only (assert-test-database); fixtures are removed in afterAll.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';

import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CustomizationRuntimeController } from '../src/modules/customization/customization-runtime.controller';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { ErrorLogsController } from '../src/modules/error-logs/error-logs.controller';
import { ErrorLogsService } from '../src/modules/error-logs/error-logs.service';
import { OrganizationHierarchyController } from '../src/modules/organization/organization-hierarchy.controller';
import { OrganizationRepository } from '../src/modules/organization/organization.repository';
import { OrganizationService } from '../src/modules/organization/organization.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error('DATABASE_URL is required for database-backed tests.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const user = (
  tenantId: string,
  userId: string,
  roleKeys: string[] = [],
): AuthenticatedUser =>
  ({
    userId,
    tenantId,
    email: `${userId}@example.invalid`,
    roleIds: [],
    roleKeys,
    permissionKeys: [],
    rolePrivileges: [],
    accessContext: { teamIds: [], accessibleBusinessUnitIds: [] },
  }) as unknown as AuthenticatedUser;

/** A tenant-wide reader of the hierarchy: the tree is scoped to what the caller may see, so a caller with no access sees nothing. */
const hierarchyReader = (tenantId: string, userId: string): AuthenticatedUser =>
  ({
    ...user(tenantId, userId),
    permissionKeys: ['hierarchy.read'],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.HIERARCHY,
        privilege: SecurityPrivilege.READ,
        accessLevel: SecurityAccessLevel.TENANT,
      },
    ],
  }) as unknown as AuthenticatedUser;

const SECRET = 'hunter2-never-store-me';

describeWithDatabase()(
  'Tenant-scoped reads flagged P2 (real PostgreSQL)',
  () => {
    jest.setTimeout(120_000);

    const prisma = createTestPrismaClient();
    const fixtures = new DbFixtures(prisma, 'p2reads');
    const config = { get: () => undefined } as never;
    const logs = new ErrorLogsService(prisma as never, config);
    const logsController = new ErrorLogsController(logs);
    const orgService = new OrganizationService(
      new OrganizationRepository(prisma as never),
      prisma as never,
      { log: async () => ({}) } as never,
    );
    const orgController = new OrganizationHierarchyController(orgService);
    const customization = new CustomizationService(prisma as never);
    const runtimeController = new CustomizationRuntimeController(customization);

    let a: Awaited<ReturnType<DbFixtures['createTenantWithBusinessUnit']>>;
    let b: Awaited<ReturnType<DbFixtures['createTenantWithBusinessUnit']>>;
    const run = randomUUID().slice(0, 8);
    const traces = {
      owner: `api_${run}_owner`,
      other: `api_${run}_other`,
      foreign: `api_${run}_foreign`,
      platform: `api_${run}_platform`,
      missing: `api_${run}_missing`,
    };

    const persist = (
      traceId: string,
      who: { tenantId?: string; userId?: string },
      extra: Record<string, unknown> = {},
    ) =>
      logs.persist({
        traceId,
        errorCode: 'SYSTEM_UNEXPECTED_ERROR',
        statusCode: 500,
        severity: 'ERROR',
        message: 'boom',
        description: 'boom',
        method: 'GET',
        path: '/x',
        ...who,
        ...extra,
      });

    beforeAll(async () => {
      await prisma.$connect();
      a = await fixtures.createTenantWithBusinessUnit('a');
      b = await fixtures.createTenantWithBusinessUnit('b');
      await persist(
        traces.owner,
        { tenantId: a.id, userId: 'u-owner' },
        {
          details: {
            password: SECRET,
            accessToken: SECRET,
            nested: { authorization: `Bearer ${SECRET}` },
            ok: 'visible',
          },
          stack: `Error: boom\n    at login (password=${SECRET})`,
        },
      );
      await persist(traces.other, { tenantId: a.id, userId: 'u-other' });
      await persist(traces.foreign, { tenantId: b.id, userId: 'u-b' });
      await persist(traces.platform, { userId: 'platform-user' });
      await prisma.customizationPublishSnapshot.createMany({
        data: [a, b].map((t, i) => ({
          tenantId: t.id,
          version: 1,
          status: 'published',
          publishedAt: new Date(),
          snapshotJson: { marker: `tenant-${i === 0 ? 'a' : 'b'}-only` },
        })),
      });
    });

    afterAll(async () => {
      await prisma.errorLog
        .deleteMany({ where: { traceId: { startsWith: `api_${run}_` } } })
        .catch(() => undefined);
      await fixtures.cleanup();
      await prisma.$disconnect();
    });

    /* ------------------------------------------------------ authentication */

    it.each([
      ['CustomizationRuntimeController', CustomizationRuntimeController],
      ['OrganizationHierarchyController', OrganizationHierarchyController],
      ['ErrorLogsController', ErrorLogsController],
    ])('%s is behind JwtAuthGuard and has no public handler', (_n, ctrl) => {
      expect(Reflect.getMetadata('__guards__', ctrl)).toContain(JwtAuthGuard);
      const proto = (ctrl as { prototype: object }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = (proto as Record<string, unknown>)[name] as object;
        expect(Reflect.getMetadata('isPublic', handler)).toBeFalsy();
      }
    });

    /* ------------------------------------------------ error-logs/:traceId */

    it('the owner reads their own log; what was stored is redacted', async () => {
      const res = (await logsController.getLog(
        traces.owner,
        user(a.id, 'u-owner'),
      )) as any;
      expect(res.traceId).toBe(traces.owner);
      expect(JSON.stringify(res)).not.toContain(SECRET);
    });

    it('a colleague in the same tenant without a support role cannot read it', async () => {
      await expect(
        logsController.getLog(traces.owner, user(a.id, 'u-colleague')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a support role reads a colleague log in ITS OWN tenant only', async () => {
      const support = user(a.id, 'u-support', ['System Administrator']);
      await expect(
        logsController.getLog(traces.other, support),
      ).resolves.toMatchObject({ traceId: traces.other });
      await expect(
        logsController.getLog(traces.foreign, support),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a platform-scope log (no tenant) is not served by the tenant route, even to a support role', async () => {
      await expect(
        logsController.getLog(
          traces.platform,
          user(a.id, 'platform-user', ['System Administrator']),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a foreign reference is byte-identical to a missing one (no enumeration oracle)', async () => {
      const caller = user(a.id, 'u-support', ['System Administrator']);
      const outcome = async (traceId: string) => {
        try {
          await logsController.getLog(traceId, caller);
          return 'resolved';
        } catch (error) {
          return JSON.stringify([
            (error as NotFoundException).getStatus(),
            (error as NotFoundException).getResponse(),
          ]);
        }
      };
      expect(await outcome(traces.foreign)).toBe(await outcome(traces.missing));
      expect(await outcome(traces.platform)).toBe(
        await outcome(traces.missing),
      );
    });

    /* ------------------------------------- error-logs/:traceId/download */

    const download = async (traceId: string, caller: AuthenticatedUser) => {
      const sent: { headers: Record<string, string>; body?: string } = {
        headers: {},
      };
      await logsController.downloadLog(traceId, caller, {
        setHeader: (k: string, v: string) => (sent.headers[k] = v),
        send: (body: string) => (sent.body = body),
      } as never);
      return sent;
    };

    it('download: owner gets a redacted text file with a sanitised filename', async () => {
      const sent = await download(traces.owner, user(a.id, 'u-owner'));
      expect(sent.body).toContain(traces.owner);
      expect(sent.body).not.toContain(SECRET);
      expect(sent.headers['Content-Disposition']).toMatch(
        /^attachment; filename="dijipeople-error-[A-Za-z0-9_.-]+\.txt"$/,
      );
    });

    it('download: foreign, platform-scope and colleague references are all refused as "not found"', async () => {
      const support = user(a.id, 'u-support', ['System Administrator']);
      for (const [traceId, caller] of [
        [traces.foreign, support],
        [traces.platform, support],
        [traces.owner, user(a.id, 'u-colleague')],
        [traces.missing, support],
      ] as const) {
        await expect(download(traceId, caller)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      }
    });

    it('download: a hostile reference cannot inject into the filename header', async () => {
      const hostile = `api_${run}_x"\r\nSet-Cookie: a=b`;
      await expect(
        download(hostile, user(a.id, 'u-owner')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /* --------------------------------------- organization-hierarchy/tree */

    it('the tree holds only the caller tenant: every node, in both directions', async () => {
      for (const [mine, theirs] of [
        [a, b],
        [b, a],
      ] as const) {
        const tree = (await orgController.findHierarchyTree(
          hierarchyReader(mine.id, 'u-any'),
        )) as any;
        const wire = JSON.stringify(tree);
        expect(wire).toContain(mine.organizationId);
        expect(wire).toContain(mine.businessUnitId);
        expect(wire).not.toContain(theirs.id);
        expect(wire).not.toContain(theirs.organizationId);
        expect(wire).not.toContain(theirs.businessUnitId);
      }
    });

    it('the tree takes its tenant from the session: the handler has no request input to forge', () => {
      expect(
        OrganizationHierarchyController.prototype.findHierarchyTree.length,
      ).toBe(1);
    });

    /* ------------------------------------------- runtime-metadata/published */

    it('published metadata is the caller tenant snapshot, never another tenant', async () => {
      const mineA = (await runtimeController.getPublished(
        user(a.id, 'u-any'),
      )) as any;
      const mineB = (await runtimeController.getPublished(
        user(b.id, 'u-any'),
      )) as any;
      expect(JSON.stringify(mineA)).toContain('tenant-a-only');
      expect(JSON.stringify(mineA)).not.toContain('tenant-b-only');
      expect(JSON.stringify(mineB)).toContain('tenant-b-only');
      expect(JSON.stringify(mineB)).not.toContain('tenant-a-only');
    });

    it('a tenant with nothing published learns nothing about others', async () => {
      const empty = await fixtures.createTenant('empty');
      const res = (await runtimeController.getPublished(
        user(empty.id, 'u-any'),
      )) as any;
      expect(res).toMatchObject({ published: false, snapshotJson: null });
    });
  },
);
