import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash, randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { getClientAccessTokenSecret } from '../src/common/config/auth.config';
import { GatewayCredentialService } from '../src/modules/attendance-integrations/gateways/gateway-credential.service';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';

import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';

import { DbFixtures, definedIds } from './helpers/db-fixtures';

/**
 * HTTP-level authentication and authorisation smoke tests.
 *
 * The DB-backed isolation suite proves the *queries* are tenant-scoped. This
 * suite proves the *guards* are wired: that `@Permissions(...)` is actually
 * enforced, that a gateway credential and a user JWT cannot be substituted for
 * one another, and that hidden resources return the same not-found as missing
 * ones over real HTTP.
 *
 * Every fixture is created and removed here; no seeded data is modified.
 */
describe('Attendance integration HTTP auth/RBAC (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let jwt: JwtService;
  let config: ConfigService;
  let gatewayCredentials: GatewayCredentialService;

  const suffix = `http-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  interface TenantActor {
    tenantId: string;
    userId: string;
    email: string;
    sessionId: string;
    token: string;
    roleId: string;
  }

  let privileged: TenantActor;
  let unprivileged: TenantActor;
  let otherTenant: TenantActor;

  let alphaIntegrationId: string;
  let betaIntegrationId: string;
  let betaDeviceId: string;
  let betaGatewayId: string;
  let internalReleaseId: string;
  let stableReleaseId: string;
  let gatewayCredentialPlaintext: string;
  let pairedGatewayId: string;

  const createdUserIds: string[] = [];
  const createdPermissionKeys = new Set<string>();
  const createdRoleIds: string[] = [];

  /**
   * Mints a genuine access token plus the RefreshToken row the guard checks,
   * so requests traverse the real JwtAuthGuard rather than a bypass.
   */
  async function createActor(
    tenantId: string,
    permissionKeys: string[],
    label: string,
    /**
     * Matrix privileges, which are a SEPARATE grant from the legacy keys above.
     *
     * DijiPeople runs two permission systems at once and `PermissionsGuard`
     * requires *all* declared legacy keys AND *at least one* matrix privilege
     * whose access level is not NONE. An actor holding only legacy keys is
     * refused with 403 — which is what every authorised request in this suite
     * did once the suite started building its own tenants instead of adopting
     * a seeded one whose roles came pre-bootstrapped.
     *
     * Granting both is not belt-and-braces; it is what a real role has. See the
     * Permissions row in AGENTS.md and `common/constants/rbac-matrix.ts`.
     */
    matrixPrivileges: Array<{
      entityKey: string;
      privilege: SecurityPrivilege;
    }> = [],
  ): Promise<TenantActor> {
    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });

    const email = `iso-${label}-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        tenantId,
        businessUnitId: businessUnit.id,
        firstName: 'Smoke',
        lastName: label,
        email,
        passwordHash: 'not-used-in-this-test',
        /*
         * TASK-0009 WP-09 — `identityId` is required since the contract phase.
         *
         * `upsert` rather than `create`: a fixture that puts the same address in
         * two tenants is modelling one person in two workspaces, which is what
         * Identity is for — and `Identity.email` is globally unique, so a plain
         * create would collide on the second.
         *
         * Resolved to a scalar rather than written as a nested relation because
         * Prisma refuses to mix the two: one nested write here would require
         * `tenant` and `businessUnit` to be nested as well.
         */
        identityId: (
          await prisma.identity.upsert({
            where: { email: email.trim().toLowerCase() },
            update: {},
            create: {
              email: email.trim().toLowerCase(),
              passwordHash: 'not-used-in-this-test',
            },
            select: { id: true },
          })
        ).id,
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const role = await prisma.role.create({
      data: {
        tenantId,
        name: `Smoke ${label} ${suffix}`,
        key: `smoke-${label}-${suffix}`,
        roleType: 'CUSTOM',
        accessLevel: 'USER',
      },
    });
    createdRoleIds.push(role.id);

    if (permissionKeys.length > 0) {
      // Permission rows are per tenant and are created by the RBAC bootstrap.
      // The Slice 1 keys are not present in every existing tenant yet (see the
      // note in the suite header), so the fixture ensures its own rather than
      // depending on seed state.
      for (const key of permissionKeys) {
        createdPermissionKeys.add(`${tenantId}::${key}`);
        await prisma.permission.upsert({
          where: { tenantId_key: { tenantId, key } },
          create: {
            tenantId,
            key,
            name: `${key} (${label} ${suffix})`,
            description: 'Created by the HTTP RBAC smoke suite.',
          },
          update: {},
        });
      }

      const permissions = await prisma.permission.findMany({
        where: { tenantId, key: { in: permissionKeys } },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          tenantId,
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    if (matrixPrivileges.length > 0) {
      // TENANT access level: this suite asserts guard wiring and tenant
      // boundaries, not row-level scoping. A narrower level would make a
      // cross-tenant test pass for the wrong reason — because the row was out
      // of the actor's scope rather than because the tenant filter held.
      await prisma.rolePrivilege.createMany({
        data: matrixPrivileges.map((privilege) => ({
          tenantId,
          roleId: role.id,
          entityKey: privilege.entityKey,
          privilege: privilege.privilege,
          accessLevel: SecurityAccessLevel.TENANT,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.userRole.create({
      data: { tenantId, userId: user.id, roleId: role.id },
    });

    const sessionId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        sessionId,
        appClientId: 'web',
        tokenHash: createHash('sha256')
          .update(`${sessionId}-${suffix}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        lastActivityAt: new Date(),
      },
    });

    const token = await jwt.signAsync(
      {
        sub: user.id,
        tenantId,
        email,
        sessionId,
        tokenVersion: 1,
        tokenUse: 'access',
        type: 'access',
        appClientId: 'web',
        aud: 'web',
      },
      { secret: getClientAccessTokenSecret(config, 'web'), expiresIn: '1h' },
    );

    return {
      tenantId,
      userId: user.id,
      email,
      sessionId,
      token,
      roleId: role.id,
    };
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    gatewayCredentials = app.get(GatewayCredentialService);

    // Built, not borrowed — see helpers/db-fixtures.ts and ITEM-0047. Alpha and
    // Beta must be genuinely different tenants for the cross-tenant assertions
    // below to mean anything, and "whichever two the seed left behind" gave no
    // such guarantee. `seed:demo` creates one tenant, so this threw before a
    // single assertion ran.
    fixtures = new DbFixtures(prisma, 'attendance-http');
    const { a: alphaTenant, b: betaTenant } = await fixtures.createTenantPair();

    privileged = await createActor(
      alphaTenant.id,
      [
        'integrations.read',
        'integrations.manage',
        'attendanceDevices.read',
        'attendanceDevices.manage',
        'gateways.read',
        'gateways.manage',
        'appDownloads.read',
        // Work site attendance configuration is written through the existing
        // Locations API, so the suite needs its permissions too.
        'locations.read',
        'locations.create',
        'locations.update',
      ],
      'admin',
      // The matrix half of the same grant. Three entity keys, because the
      // routes this suite drives do not sit under one: `attendance` covers
      // integrations, devices and gateways, `agent` covers the app-download
      // catalogue, and `hierarchy` covers locations, which is where work-site
      // attendance configuration is written.
      [
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.READ,
        },
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.MANAGE,
        },
        { entityKey: ENTITY_KEYS.AGENT, privilege: SecurityPrivilege.READ },
        { entityKey: ENTITY_KEYS.AGENT, privilege: SecurityPrivilege.MANAGE },
        { entityKey: ENTITY_KEYS.HIERARCHY, privilege: SecurityPrivilege.READ },
        {
          entityKey: ENTITY_KEYS.HIERARCHY,
          privilege: SecurityPrivilege.MANAGE,
        },
      ],
    );
    unprivileged = await createActor(
      alphaTenant.id,
      ['integrations.read'],
      'viewer',
      // READ only, deliberately. This actor exists to prove a reader is refused
      // a write, so granting MANAGE on either system would make every
      // permission-enforcement assertion below vacuous.
      [
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.READ,
        },
      ],
    );
    otherTenant = await createActor(
      betaTenant.id,
      [
        'integrations.read',
        'integrations.manage',
        'attendanceDevices.read',
        'gateways.read',
      ],
      'beta',
      // Fully privileged WITHIN tenant B. That is the point: the cross-tenant
      // assertions must fail on the tenant boundary, not on a missing grant —
      // an under-privileged intruder would pass them for the wrong reason.
      [
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.READ,
        },
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.MANAGE,
        },
      ],
    );

    const alphaIntegration = await prisma.attendanceIntegration.create({
      data: {
        tenantId: alphaTenant.id,
        name: `HTTP A ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
      },
    });
    alphaIntegrationId = alphaIntegration.id;

    const betaGateway = await prisma.integrationGateway.create({
      data: { tenantId: betaTenant.id, name: `HTTP GW B ${suffix}` },
    });
    betaGatewayId = betaGateway.id;

    const betaIntegration = await prisma.attendanceIntegration.create({
      data: {
        tenantId: betaTenant.id,
        name: `HTTP B ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
        gatewayId: betaGateway.id,
      },
    });
    betaIntegrationId = betaIntegration.id;

    const betaDevice = await prisma.attendanceDevice.create({
      data: {
        tenantId: betaTenant.id,
        integrationId: betaIntegration.id,
        name: `HTTP Device B ${suffix}`,
        provider: 'ZKTECO',
        status: 'ACTIVE',
        isEnabled: true,
      },
    });
    betaDeviceId = betaDevice.id;

    // A paired gateway in tenant A, with a real credential.
    const alphaGateway = await prisma.integrationGateway.create({
      data: {
        tenantId: alphaTenant.id,
        name: `HTTP GW A ${suffix}`,
        status: 'ONLINE',
        registeredAt: new Date(),
      },
    });
    pairedGatewayId = alphaGateway.id;
    const credential = await gatewayCredentials.rotateCredential({
      tenantId: alphaTenant.id,
      gatewayId: alphaGateway.id,
    });
    gatewayCredentialPlaintext = credential.plaintext;

    const internal = await prisma.applicationRelease.create({
      data: {
        appKey: 'ZKTECO_DIAGNOSTIC',
        name: `Internal build ${suffix}`,
        version: `0.0.0-internal-${suffix}`,
        platform: 'WINDOWS',
        architecture: 'X86',
        channel: 'INTERNAL',
        isActive: true,
        publishedAt: new Date(),
        externalUrl: 'https://internal.example/secret.exe',
      },
    });
    internalReleaseId = internal.id;

    const stable = await prisma.applicationRelease.create({
      data: {
        appKey: 'AGENT_DESKTOP',
        name: `Agent ${suffix}`,
        version: `9.9.9-${suffix}`,
        platform: 'WINDOWS',
        architecture: 'X64',
        channel: 'STABLE',
        isActive: true,
        publishedAt: new Date(),
        externalUrl: 'https://example.test/agent.exe',
      },
    });
    stableReleaseId = stable.id;
  });

  afterAll(async () => {
    // Everything tenant-owned — users, roles, permissions, gateways,
    // integrations, devices — cascades from the two fixture tenants, so the
    // eleven hand-ordered deletes that used to be here are gone along with the
    // chance of getting their order wrong.
    //
    // `ApplicationRelease` is the exception and stays explicit: it is a
    // PLATFORM model with no `tenantId`, so no tenant delete can reach it.
    // `definedIds` is what makes that safe when setup failed before the
    // releases were created — the previous version passed `undefined` straight
    // into an `in` array and Prisma refused the whole call, turning one setup
    // failure into a second, louder teardown failure.
    try {
      const releaseIds = definedIds([internalReleaseId, stableReleaseId]);
      if (releaseIds.length > 0) {
        await prisma.applicationRelease.deleteMany({
          where: { id: { in: releaseIds } },
        });
      }
    } finally {
      try {
        await fixtures?.cleanup();
      } finally {
        await app?.close();
      }
    }
  });

  const server = () => app.getHttpServer();

  describe('authentication', () => {
    it('rejects an unauthenticated request', async () => {
      await request(server())
        .get('/integrations/attendance/integrations')
        .expect(401);
    });

    it('rejects a garbage bearer token', async () => {
      await request(server())
        .get('/integrations/attendance/integrations')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('accepts a genuine tenant access token', async () => {
      await request(server())
        .get('/integrations/attendance/integrations')
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(200);
    });
  });

  describe('permission enforcement', () => {
    it('lets a reader list integrations', async () => {
      await request(server())
        .get('/integrations/attendance/integrations')
        .set('Authorization', `Bearer ${unprivileged.token}`)
        .expect(200);
    });

    it('refuses configuration changes without integrations.manage', async () => {
      await request(server())
        .patch(`/integrations/attendance/integrations/${alphaIntegrationId}`)
        .set('Authorization', `Bearer ${unprivileged.token}`)
        .send({ name: 'should not apply' })
        .expect(403);

      const unchanged = await prisma.attendanceIntegration.findUnique({
        where: { id: alphaIntegrationId },
        select: { name: true },
      });
      expect(unchanged?.name).not.toBe('should not apply');
    });

    it('refuses activation without integrations.manage', async () => {
      await request(server())
        .post(
          `/integrations/attendance/integrations/${alphaIntegrationId}/activate`,
        )
        .set('Authorization', `Bearer ${unprivileged.token}`)
        .expect(403);
    });

    it('refuses device creation without attendanceDevices.manage', async () => {
      await request(server())
        .post('/integrations/attendance/devices')
        .set('Authorization', `Bearer ${unprivileged.token}`)
        .send({ integrationId: alphaIntegrationId, name: `nope ${suffix}` })
        .expect(403);
    });

    it('allows an authorised admin to update configuration', async () => {
      await request(server())
        .patch(`/integrations/attendance/integrations/${alphaIntegrationId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({ description: 'updated by smoke test' })
        .expect(200);
    });
  });

  describe('cross-tenant ID guessing over HTTP', () => {
    it('hides another tenant’s integration', async () => {
      await request(server())
        .get(`/integrations/attendance/integrations/${betaIntegrationId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(404);
    });

    it('refuses to mutate another tenant’s integration', async () => {
      await request(server())
        .patch(`/integrations/attendance/integrations/${betaIntegrationId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({ name: 'hijacked' })
        .expect(404);

      const unchanged = await prisma.attendanceIntegration.findUnique({
        where: { id: betaIntegrationId },
        select: { name: true },
      });
      expect(unchanged?.name).not.toBe('hijacked');
    });

    it('hides another tenant’s device', async () => {
      await request(server())
        .get(`/integrations/attendance/devices/${betaDeviceId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(404);
    });

    it('hides another tenant’s gateway', async () => {
      await request(server())
        .get(`/integrations/gateways/${betaGatewayId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(404);
    });

    it('refuses to issue a pairing code for another tenant’s gateway', async () => {
      const response = await request(server())
        .post(`/integrations/gateways/${betaGatewayId}/pairing-code`)
        .set('Authorization', `Bearer ${privileged.token}`);

      expect([403, 404]).toContain(response.status);
    });

    it('excludes another tenant’s integration from the list', async () => {
      const response = await request(server())
        .get('/integrations/attendance/integrations?pageSize=200')
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(200);

      const ids = (response.body.items as Array<{ id: string }>).map(
        (i) => i.id,
      );
      expect(ids).toContain(alphaIntegrationId);
      expect(ids).not.toContain(betaIntegrationId);
    });

    /*
     * The same probes from the other side of the boundary.
     *
     * `otherTenant` was built for this and left unused, so every assertion
     * above ran in one direction only: tenant A reaching for tenant B. That is
     * not symmetric by construction — scoping here is applied per query, and a
     * helper can be right for the fixture somebody tested and wrong for the
     * other one. It is also the direction where the intruder holds every
     * relevant grant inside their own tenant, so a refusal is the boundary
     * holding rather than a missing permission.
     */
    it('hides tenant A’s integration from a fully privileged tenant B admin', async () => {
      await request(server())
        .get(`/integrations/attendance/integrations/${alphaIntegrationId}`)
        .set('Authorization', `Bearer ${otherTenant.token}`)
        .expect(404);
    });

    it('refuses a tenant B admin mutating tenant A’s integration', async () => {
      await request(server())
        .patch(`/integrations/attendance/integrations/${alphaIntegrationId}`)
        .set('Authorization', `Bearer ${otherTenant.token}`)
        .send({ name: 'hijacked-from-beta' })
        .expect(404);

      const unchanged = await prisma.attendanceIntegration.findUnique({
        where: { id: alphaIntegrationId },
        select: { name: true },
      });
      expect(unchanged?.name).not.toBe('hijacked-from-beta');
    });

    it('hides tenant A’s gateway from a tenant B admin', async () => {
      // `pairedGatewayId` is tenant A's gateway. There is no alpha *device*
      // fixture, so the device direction stays covered by the probes above.
      await request(server())
        .get(`/integrations/gateways/${pairedGatewayId}`)
        .set('Authorization', `Bearer ${otherTenant.token}`)
        .expect(404);

      const response = await request(server())
        .post(`/integrations/gateways/${pairedGatewayId}/pairing-code`)
        .set('Authorization', `Bearer ${otherTenant.token}`);

      expect([403, 404]).toContain(response.status);
    });

    it('excludes tenant A’s integration from a tenant B admin’s list', async () => {
      const response = await request(server())
        .get('/integrations/attendance/integrations?pageSize=200')
        .set('Authorization', `Bearer ${otherTenant.token}`)
        .expect(200);

      const ids = (response.body.items as Array<{ id: string }>).map(
        (i) => i.id,
      );
      // Present AND absent: a list that returned nothing at all would satisfy
      // the exclusion on its own, and prove only that the endpoint was broken.
      expect(ids).toContain(betaIntegrationId);
      expect(ids).not.toContain(alphaIntegrationId);
    });
  });

  describe('application release visibility over HTTP', () => {
    it('hides an INTERNAL release from a tenant administrator by id', async () => {
      await request(server())
        .get(`/app-releases/${internalReleaseId}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(404);
    });

    it('refuses to download an INTERNAL release by id', async () => {
      await request(server())
        .get(`/app-releases/${internalReleaseId}/download`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(404);
    });

    it('omits INTERNAL releases from the catalogue', async () => {
      const response = await request(server())
        .get('/app-releases')
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(200);

      const items = response.body.items as Array<{
        id: string;
        channel: string;
      }>;
      expect(items.some((item) => item.id === internalReleaseId)).toBe(false);
      expect(items.every((item) => item.channel !== 'INTERNAL')).toBe(true);
    });

    it('never exposes a storage URL in the catalogue', async () => {
      const response = await request(server())
        .get('/app-releases')
        .set('Authorization', `Bearer ${privileged.token}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('internal.example');
    });
  });

  describe('gateway credential vs user JWT', () => {
    it('accepts a gateway credential on the gateway heartbeat endpoint', async () => {
      const response = await request(server())
        .post('/integrations/gateway/heartbeat')
        .set('Authorization', `Bearer ${gatewayCredentialPlaintext}`)
        .send({ version: '0.1.0', platform: 'WINDOWS' })
        .expect(200);

      // Tenant and gateway are derived from the credential, not the request.
      expect(response.body.gatewayId).toBe(pairedGatewayId);
      expect(response.body.tenantId).toBe(privileged.tenantId);
    });

    it('refuses a user JWT on the gateway ingestion endpoint', async () => {
      await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({ integrationId: alphaIntegrationId, events: [] })
        .expect(401);
    });

    it('refuses a user JWT on the gateway heartbeat endpoint', async () => {
      await request(server())
        .post('/integrations/gateway/heartbeat')
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({})
        .expect(401);
    });

    it('refuses a gateway credential on a Web App endpoint', async () => {
      await request(server())
        .get('/integrations/attendance/integrations')
        .set('Authorization', `Bearer ${gatewayCredentialPlaintext}`)
        .expect(401);
    });

    it('refuses a gateway credential on the gateway admin API', async () => {
      await request(server())
        .get('/integrations/gateways')
        .set('Authorization', `Bearer ${gatewayCredentialPlaintext}`)
        .expect(401);
    });

    it('refuses a revoked gateway credential', async () => {
      const throwaway = await prisma.integrationGateway.create({
        data: {
          tenantId: privileged.tenantId,
          name: `HTTP GW revoke ${suffix}`,
          status: 'ONLINE',
          registeredAt: new Date(),
        },
      });

      try {
        const credential = await gatewayCredentials.rotateCredential({
          tenantId: privileged.tenantId,
          gatewayId: throwaway.id,
        });

        await request(server())
          .post('/integrations/gateway/heartbeat')
          .set('Authorization', `Bearer ${credential.plaintext}`)
          .send({})
          .expect(200);

        await gatewayCredentials.revokeGateway({
          tenantId: privileged.tenantId,
          gatewayId: throwaway.id,
        });

        await request(server())
          .post('/integrations/gateway/heartbeat')
          .set('Authorization', `Bearer ${credential.plaintext}`)
          .send({})
          .expect(401);
      } finally {
        await prisma.integrationGatewayCredential.deleteMany({
          where: { gatewayId: throwaway.id },
        });
        await prisma.integrationGateway.deleteMany({
          where: { id: throwaway.id },
        });
      }
    });

    it('refuses a gateway ingesting for another tenant’s integration', async () => {
      const response = await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', `Bearer ${gatewayCredentialPlaintext}`)
        .send({ integrationId: betaIntegrationId, events: [] });

      expect(response.status).toBe(403);
    });

    it('refuses a gateway spoofing another integration’s device', async () => {
      const response = await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', `Bearer ${gatewayCredentialPlaintext}`)
        .send({
          integrationId: alphaIntegrationId,
          deviceId: betaDeviceId,
          events: [],
        });

      expect(response.status).toBe(403);
    });

    it('rejects an unauthenticated gateway request', async () => {
      await request(server())
        .post('/integrations/gateway/heartbeat')
        .send({})
        .expect(401);
    });
  });

  /**
   * Work site attendance configuration.
   *
   * These columns exist on Location and are surfaced by the Work Sites settings
   * page, but the create/update DTOs did not declare them — and the global
   * validation pipe runs with `whitelist: true`, so every one of them was
   * silently stripped before reaching the database. The settings form appeared
   * to save and changed nothing. These tests pin the whole chain.
   */
  describe('work site attendance configuration', () => {
    const createdLocationIds: string[] = [];

    afterAll(async () => {
      await prisma.location.deleteMany({
        where: { id: { in: createdLocationIds } },
      });
    });

    async function createWorkSite(body: Record<string, unknown>) {
      const response = await request(server())
        .post('/locations')
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({
          name: `WS ${suffix} ${randomUUID().slice(0, 8)}`,
          city: 'Karachi',
          state: 'Sindh',
          country: 'PK',
          ...body,
        });

      if (response.status === 201 && response.body?.id) {
        createdLocationIds.push(response.body.id as string);
      }

      return response;
    }

    it('persists every attendance field supplied on create', async () => {
      const response = await createWorkSite({
        attendanceEnabled: true,
        latitude: 24.8607,
        longitude: 67.0011,
        allowedRadiusMeters: 150,
        maximumAccuracyMeters: 40,
        allowedAttendanceMethods: ['DEVICE', 'WEB'],
        webAttendancePolicy: 'FALLBACK_ONLY',
        devicePolicy: 'DEVICE_REQUIRED',
        webFallbackEnabled: true,
        timezone: 'Asia/Karachi',
      });

      expect(response.status).toBe(201);

      const stored = await prisma.location.findUniqueOrThrow({
        where: { id: response.body.id as string },
      });

      expect(stored.attendanceEnabled).toBe(true);
      expect(stored.maximumAccuracyMeters).toBe(40);
      expect(stored.allowedRadiusMeters).toBe(150);
      expect(stored.allowedAttendanceMethods).toEqual(['DEVICE', 'WEB']);
      expect(stored.webAttendancePolicy).toBe('FALLBACK_ONLY');
      expect(stored.devicePolicy).toBe('DEVICE_REQUIRED');
      expect(stored.webFallbackEnabled).toBe(true);
    });

    it('leaves an unsupplied override null so the tenant setting applies', async () => {
      const response = await createWorkSite({});
      expect(response.status).toBe(201);

      const stored = await prisma.location.findUniqueOrThrow({
        where: { id: response.body.id as string },
      });

      // null means inherit. A default of `false` here would silently disable
      // attendance at every newly created work site.
      expect(stored.attendanceEnabled).toBeNull();
      expect(stored.webAttendancePolicy).toBeNull();
      expect(stored.webFallbackEnabled).toBeNull();
      expect(stored.maximumAccuracyMeters).toBeNull();
      expect(stored.allowedAttendanceMethods).toEqual([]);
    });

    it('updates attendance configuration on an existing work site', async () => {
      const created = await createWorkSite({ attendanceEnabled: false });
      const id = created.body.id as string;

      await request(server())
        .patch(`/locations/${id}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({
          attendanceEnabled: true,
          devicePolicy: 'DEVICE_OPTIONAL',
          maximumAccuracyMeters: 25,
        })
        .expect(200);

      const stored = await prisma.location.findUniqueOrThrow({ where: { id } });
      expect(stored.attendanceEnabled).toBe(true);
      expect(stored.devicePolicy).toBe('DEVICE_OPTIONAL');
      expect(stored.maximumAccuracyMeters).toBe(25);
    });

    it('clears an override back to inheriting when sent an empty value', async () => {
      const created = await createWorkSite({
        webAttendancePolicy: 'DISALLOWED',
        maximumAccuracyMeters: 30,
      });
      const id = created.body.id as string;

      // The settings form sends "" for a cleared field. That has to mean
      // "inherit again", not "leave it as it was".
      await request(server())
        .patch(`/locations/${id}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({ webAttendancePolicy: '', maximumAccuracyMeters: '' })
        .expect(200);

      const stored = await prisma.location.findUniqueOrThrow({ where: { id } });
      expect(stored.webAttendancePolicy).toBeNull();
      expect(stored.maximumAccuracyMeters).toBeNull();
    });

    it('leaves stored attendance values alone when the field is absent', async () => {
      const created = await createWorkSite({ webAttendancePolicy: 'ALLOWED' });
      const id = created.body.id as string;

      await request(server())
        .patch(`/locations/${id}`)
        .set('Authorization', `Bearer ${privileged.token}`)
        .send({ city: 'Lahore' })
        .expect(200);

      const stored = await prisma.location.findUniqueOrThrow({ where: { id } });
      expect(stored.city).toBe('Lahore');
      expect(stored.webAttendancePolicy).toBe('ALLOWED');
    });

    it('refuses an attendance method that is not in the schema enum', async () => {
      const response = await createWorkSite({
        allowedAttendanceMethods: ['DEVICE', 'TELEPATHY'],
      });

      expect(response.status).toBe(400);
    });

    it('refuses an unknown web attendance policy', async () => {
      const response = await createWorkSite({
        webAttendancePolicy: 'WHENEVER',
      });

      expect(response.status).toBe(400);
    });
  });
});
