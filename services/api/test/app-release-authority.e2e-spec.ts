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
 * WP3 (SESSION-0137) — who may change the GLOBAL desktop-agent releases.
 *
 * `ApplicationRelease` rows belong to no tenant: they are the artefacts every
 * tenant's desktop agent updates from, and STABLE is "the channel every
 * assigned tenant's agent auto-updates from". Disabling, enabling, promoting or
 * publishing one therefore affects every customer at once. The comment in
 * rbac-matrix.ts says publishing is "a platform action, not a tenant one", but
 * the controller guards only with JwtAuthGuard + PermissionsGuard, and a tenant
 * Global Administrator passes PermissionsGuard for every key through the
 * `hasElevatedTenantRole` bypass. This suite states the intended rule and
 * checks the actual behaviour.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('App release authority (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantAdmin: HttpActor;
  let platformAdmin: HttpActor;
  let releaseId: string;
  const suffix = randomUUID().slice(0, 6);
  const appKey = `authority-test-${suffix}`;
  const publishToken = `tok-${randomUUID()}-${randomUUID()}`;

  const call = (
    method: 'get' | 'post',
    as: HttpActor,
    path: string,
    client: 'web' | 'admin',
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', client);
    return body ? req.send(body) : req;
  };

  const release = () =>
    prisma.applicationRelease.findUniqueOrThrow({ where: { id: releaseId } });

  beforeAll(async () => {
    // Configure the machine token so the refusals below are the guard rejecting
    // a WRONG token, not the guard failing closed because none is set.
    process.env.RELEASE_PUBLISH_TOKEN = publishToken;
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
    fixtures = new DbFixtures(prisma, 'relauth');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('rel');
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    tenantAdmin = await actors.tenantUser(tenant.id, unit, 'rel-admin');
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: 'Admin rel',
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: tenantAdmin.id, roleId: role.id },
    });
    platformAdmin = await actors.platformUser('SUPER_ADMIN', 'rel-platform');

    releaseId = (
      await prisma.applicationRelease.create({
        data: {
          appKey,
          name: 'Authority test',
          version: '9.9.9',
          platform: 'WINDOWS',
          architecture: 'X64',
          channel: 'BETA',
          externalUrl: 'https://example.invalid/agent.exe',
          fileName: 'agent.exe',
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      await prisma.applicationRelease.deleteMany({ where: { appKey } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('control: a platform super admin can disable and re-enable a release', async () => {
    const off = await call(
      'post',
      platformAdmin,
      `app-releases/${releaseId}/disable`,
      'admin',
    );
    expect(off.status).toBeLessThan(300);
    expect((await release()).isActive).toBe(false);
    const on = await call(
      'post',
      platformAdmin,
      `app-releases/${releaseId}/enable`,
      'admin',
    );
    expect(on.status).toBeLessThan(300);
    expect((await release()).isActive).toBe(true);
  });

  it('control: a tenant admin may still READ the catalogue it downloads from', async () => {
    const res = await call('get', tenantAdmin, 'app-releases', 'web');
    expect(res.status).toBe(200);
  });

  it('a tenant admin cannot disable a global release', async () => {
    const res = await call(
      'post',
      tenantAdmin,
      `app-releases/${releaseId}/disable`,
      'web',
    );
    expect(res.status).toBe(403);
    expect((await release()).isActive).toBe(true);
  });

  it('a tenant admin cannot enable a disabled global release', async () => {
    await prisma.applicationRelease.update({
      where: { id: releaseId },
      data: { isActive: false },
    });
    const res = await call(
      'post',
      tenantAdmin,
      `app-releases/${releaseId}/enable`,
      'web',
    );
    expect(res.status).toBe(403);
    expect((await release()).isActive).toBe(false);
    await prisma.applicationRelease.update({
      where: { id: releaseId },
      data: { isActive: true },
    });
  });

  it('a tenant admin cannot promote a global release to STABLE', async () => {
    const res = await call(
      'post',
      tenantAdmin,
      `app-releases/${releaseId}/promote`,
      'web',
      { channel: 'STABLE' },
    );
    expect(res.status).toBe(403);
    expect(
      await prisma.applicationRelease.count({
        where: { appKey, channel: 'STABLE' },
      }),
    ).toBe(0);
  });

  it('a tenant admin cannot publish a release', async () => {
    const before = await prisma.applicationRelease.count({ where: { appKey } });
    const res = await call('post', tenantAdmin, 'app-releases', 'web', {
      appKey,
      name: 'Rogue',
      version: '0.0.1',
      platform: 'WINDOWS',
      architecture: 'X64',
      channel: 'STABLE',
      externalUrl: 'https://attacker.invalid/agent.exe',
    });
    expect(res.status).toBe(403);
    expect(await prisma.applicationRelease.count({ where: { appKey } })).toBe(
      before,
    );
  });

  describe('machine publisher routes (@Public, token-gated)', () => {
    // These are @Public() because a CI job has no user session, so the ONLY
    // thing between the internet and a global STABLE release is the token guard.
    const publish = (headers: Record<string, string>) => {
      let req = request(app.getHttpServer()).post(
        '/app-releases/publisher/promote',
      );
      for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
      return req.send({ appKey, version: '9.9.9', channel: 'STABLE' });
    };
    const stable = () =>
      prisma.applicationRelease.count({ where: { appKey, channel: 'STABLE' } });

    it('control: the configured publish token is accepted (list is read-only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/app-releases/publisher/releases?app=agent-desktop')
        .set('x-dijipeople-release-token', publishToken);
      expect(res.status).toBe(200);
    });

    it('refuses a request with no token', async () => {
      const res = await publish({});
      expect(res.status).toBe(401);
      expect(await stable()).toBe(0);
    });

    it('refuses a tenant admin bearer token in place of the publish token', async () => {
      const res = await publish({
        Authorization: `Bearer ${tenantAdmin.token}`,
      });
      expect(res.status).toBe(401);
      expect(await stable()).toBe(0);
    });

    it('refuses a guessed token', async () => {
      const res = await publish({
        'x-dijipeople-release-token': 'a'.repeat(48),
      });
      expect(res.status).toBe(401);
      expect(await stable()).toBe(0);
    });
  });

  it('a tenant admin cannot read the management catalogue (disabled and every channel)', async () => {
    const res = await call('get', tenantAdmin, 'app-releases/manage', 'web');
    expect(res.status).toBe(403);
  });
});
