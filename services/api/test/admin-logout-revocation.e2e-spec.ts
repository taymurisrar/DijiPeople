import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { getAuthCookieNames } from '../src/common/config/auth.config';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * REG-221 — ITEM-0002.
 *
 * The admin sign-out story is covered in two places already, and neither of them
 * touches the database:
 *
 *   - `apps/admin/app/api/auth/logout/logout-route.spec.ts` reads the route's
 *     *source shape*;
 *   - `logout-route.behaviour.spec.ts` invokes the handlers, but mocks `fetch`,
 *     so it proves the API is **called**, not that anything was revoked.
 *
 * Session revocation is the one auth behaviour where "the code looks right" is
 * least convincing, because the failure mode is a session that *appears* closed:
 * the browser is cleared, the operator sees the login screen, and the refresh
 * token is still live server-side. Only a persisted row can settle it.
 *
 * ## What this suite drives
 *
 * A real `PlatformRefreshToken`, a real `POST /api/auth/logout` over HTTP with
 * `X-DijiPeople-App: admin`, and an assertion on `revokedAt` afterwards.
 *
 * The case that matters is **the refresh cookie being absent**. That is not an
 * edge case, it is the ordinary one: the refresh cookie has the shortest life of
 * the three, so the sign-out that follows a session-expired modal — the exact
 * flow BUG-0009 was raised about — almost always arrives without it. The access
 * and session cookies outlive it, and the admin route forwards all three
 * precisely so the server can still find the session.
 *
 * ## The negative case is not optional here
 *
 * Revocation keyed on something a caller supplies is only safe if it reaches
 * exactly one session. The last test drives a session id belonging to nobody and
 * asserts a bystander's token is untouched — without it, a fix that revoked
 * every open admin token would pass every other test in this file.
 */
describeWithDatabase()('Admin sign-out revokes the persisted session', () => {
  jest.setTimeout(180_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cookieNames: { access: string; refresh: string; session: string };
  let webCookieNames: { access: string; refresh: string; session: string };

  const platformUserIds: string[] = [];
  const runId = randomUUID().slice(0, 8);
  let fixtures: DbFixtures;

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
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    // Read the names from the running configuration rather than restating them.
    // A suite that hardcodes `dp_admin_refresh_token` keeps passing after the
    // deployment renames the cookie, which is the failure it exists to catch.
    cookieNames = getAuthCookieNames(app.get(ConfigService), 'admin');
    webCookieNames = getAuthCookieNames(app.get(ConfigService), 'web');
    fixtures = new DbFixtures(prisma, 'admin-logout');
  });

  afterAll(async () => {
    if (platformUserIds.length > 0) {
      await prisma.platformRefreshToken.deleteMany({
        where: { platformUserId: { in: platformUserIds } },
      });
      await prisma.platformUser.deleteMany({
        where: { id: { in: platformUserIds } },
      });
    }
    await fixtures?.cleanup();
    await app?.close();
  });

  /** A platform operator with one live admin session. */
  async function createLiveAdminSession(label: string) {
    const platformUser = await prisma.platformUser.create({
      data: {
        email: `logout-${label}-${runId}@example.invalid`,
        firstName: 'Logout',
        lastName: 'Probe',
        passwordHash: await bcrypt.hash(`password-${runId}`, 4),
      },
      select: { id: true },
    });
    platformUserIds.push(platformUser.id);

    const refreshToken = `refresh-${label}-${randomUUID()}`;
    const sessionId = randomUUID();
    const token = await prisma.platformRefreshToken.create({
      data: {
        platformUserId: platformUser.id,
        sessionId,
        appClientId: 'admin',
        tokenFamilyId: sessionId,
        tokenHash: await bcrypt.hash(refreshToken, 4),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    return { platformUserId: platformUser.id, tokenId: token.id, refreshToken, sessionId };
  }

  async function revokedAtFor(tokenId: string) {
    const row = await prisma.platformRefreshToken.findUnique({
      where: { id: tokenId },
      select: { revokedAt: true },
    });
    return row?.revokedAt ?? null;
  }

  function signOut(
    cookiePairs: Array<[string, string]>,
    client: 'admin' | 'web' = 'admin',
  ) {
    return request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-DijiPeople-App', client)
      .set(
        'Cookie',
        cookiePairs
          .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
          .join('; '),
      )
      .send({});
  }

  it('revokes the persisted token when the refresh cookie is present', async () => {
    // The control. If this ever fails, the case below proves nothing.
    const session = await createLiveAdminSession('with-refresh');
    expect(await revokedAtFor(session.tokenId)).toBeNull();

    const response = await signOut([
      [cookieNames.refresh, session.refreshToken],
      [cookieNames.session, session.sessionId],
    ]);

    expect(response.status).toBeLessThan(400);
    expect(await revokedAtFor(session.tokenId)).toBeInstanceOf(Date);
  });

  it('revokes the persisted token when the refresh cookie has already expired', async () => {
    /*
     * ITEM-0002, and the ordinary case rather than an exotic one. The refresh
     * cookie is the shortest-lived of the three, so the sign-out that follows a
     * session-expired modal arrives without it — while the session cookie, which
     * names the row, is still in the jar and is forwarded by the admin route.
     *
     * BUG-0009 fixed the client half: the route now calls the API instead of
     * silently skipping it. Whether the server then does anything is a separate
     * claim, and it is this one.
     */
    const session = await createLiveAdminSession('no-refresh');
    expect(await revokedAtFor(session.tokenId)).toBeNull();

    const response = await signOut([
      [cookieNames.access, 'an-access-token-that-may-well-be-expired'],
      [cookieNames.session, session.sessionId],
    ]);

    expect(response.status).toBeLessThan(400);
    expect(await revokedAtFor(session.tokenId)).toBeInstanceOf(Date);
  });

  it('clears the auth cookies on the way out', async () => {
    const session = await createLiveAdminSession('cookie-clear');

    const response = await signOut([
      [cookieNames.session, session.sessionId],
    ]);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const header = (Array.isArray(setCookie) ? setCookie : [setCookie ?? '']).join(
      '\n',
    );
    expect(header).toContain(cookieNames.access);
    expect(header).toContain(cookieNames.refresh);
  });

  it('revokes nothing when the session id belongs to no one', async () => {
    /*
     * The pair to the test above, and the one that keeps the fix honest. A
     * revocation keyed on a caller-supplied value has to reach exactly one row:
     * a version that revoked every open admin token would satisfy every other
     * assertion in this file while signing out the whole platform team.
     */
    const bystander = await createLiveAdminSession('bystander');

    const response = await signOut([[cookieNames.session, randomUUID()]]);

    expect(response.status).toBeLessThan(400);
    expect(await revokedAtFor(bystander.tokenId)).toBeNull();
  });

  /**
   * The same defect existed on the tenant side, and the fix is shared, so the
   * tenant side is asserted rather than assumed. A fix written for one client
   * and reasoned about for the other is how half a fix ships.
   */
  describe('the tenant client', () => {
    async function createLiveWebSession() {
      const tenant = await fixtures.createTenantWithBusinessUnit('web-logout');
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: tenant.businessUnitId,
          firstName: 'Web',
          lastName: 'Probe',
          email: `web-logout-${runId}@example.invalid`,
          passwordHash: await bcrypt.hash(`password-${runId}`, 4),
        },
        select: { id: true },
      });

      const sessionId = randomUUID();
      const token = await prisma.refreshToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          sessionId,
          appClientId: 'web',
          tokenHash: await bcrypt.hash(`web-refresh-${randomUUID()}`, 4),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      return { tokenId: token.id, sessionId };
    }

    it('revokes the tenant session when the refresh cookie has expired', async () => {
      const session = await createLiveWebSession();

      const response = await signOut(
        [[webCookieNames.session, session.sessionId]],
        'web',
      );

      expect(response.status).toBeLessThan(400);
      const row = await prisma.refreshToken.findUnique({
        where: { id: session.tokenId },
        select: { revokedAt: true },
      });
      expect(row?.revokedAt).toBeInstanceOf(Date);
    });

    it('does not revoke a different client token that shares the session id', async () => {
      /*
       * The scope assertion, and the reason `appClientId` is in the filter.
       *
       * A first version of this test signed out as `web` using an admin session
       * id and asserted the platform token survived. That passes whatever the
       * filter says — admin tokens live in `PlatformRefreshToken` and tenant
       * tokens in `RefreshToken`, so a `web` logout could never reach one. It
       * was an assertion that cannot fail, which is the same defect class this
       * whole file was written to remove; dropping `appClientId` from the
       * production filter left it green.
       *
       * The claim the filter really makes is within one table: `web` and
       * `agent-desktop` tokens are both `RefreshToken` rows, and the session id
       * arrives from a cookie the caller controls. Without `appClientId` a
       * tenant sign-out would close the attendance agent's session too.
       */
      const tenant = await fixtures.createTenantWithBusinessUnit('agent-logout');
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: tenant.businessUnitId,
          firstName: 'Agent',
          lastName: 'Probe',
          email: `agent-logout-${runId}@example.invalid`,
          passwordHash: await bcrypt.hash(`password-${runId}`, 4),
        },
        select: { id: true },
      });

      const sessionId = randomUUID();
      const agentToken = await prisma.refreshToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          sessionId,
          appClientId: 'agent-desktop',
          tokenHash: await bcrypt.hash(`agent-refresh-${randomUUID()}`, 4),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      const response = await signOut(
        [[webCookieNames.session, sessionId]],
        'web',
      );

      expect(response.status).toBeLessThan(400);
      const row = await prisma.refreshToken.findUnique({
        where: { id: agentToken.id },
        select: { revokedAt: true },
      });
      expect(row?.revokedAt).toBeNull();
    });
  });
});
