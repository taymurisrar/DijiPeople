import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { getClientAccessTokenSecret } from '../src/common/config/auth.config';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-3137, BUG-3138 and BUG-3140: the three account-recovery and session
 * defects, driven through the real routes on a disposable database.
 *
 *  3137  the public forgot-password flow stored the live reset URL in the
 *        tenant-readable email delivery log.
 *  3138  a password reset reactivated a DISABLED account.
 *  3140  the client-supplied `startNewSession` flag on the public agent refresh
 *        route reset the absolute session lifetime, so a refresh-token holder
 *        stayed signed in indefinitely.
 *
 * Every attack has an owner control on the same route with an otherwise
 * identical request, and the persisted state is re-read after each.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Auth and session hardening (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let jwt: JwtService;
  let config: ConfigService;
  const suffix = randomUUID().slice(0, 6);
  const password = 'Str0ng!Passw0rd#42';
  const newPassword = 'An0ther!Str0ng#Pass77';
  const identityIds: string[] = [];
  const userIds: string[] = [];
  let tenantId: string;
  let tenantSlug: string;
  let businessUnitId: string;

  async function makeUser(label: string, status: 'ACTIVE' | 'DISABLED') {
    const email = `${label}-${suffix}@example.invalid`.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 4);
    const identity = await prisma.identity.create({
      data: { email, passwordHash },
      select: { id: true },
    });
    identityIds.push(identity.id);
    const user = await prisma.user.create({
      data: {
        tenantId,
        businessUnitId,
        identityId: identity.id,
        firstName: 'Auth',
        lastName: label,
        email,
        passwordHash,
        status,
      },
      select: { id: true, passwordChangedAt: true },
    });
    userIds.push(user.id);
    await prisma.employee.create({
      data: {
        tenantId,
        userId: user.id,
        employeeCode: `AUTH-${label}-${suffix}`,
        firstName: 'Auth',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
    });
    return { id: user.id, email };
  }

  const resetToken = async (userId: string) => {
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });
    return jwt.sign(
      {
        sub: userId,
        tenantId,
        type: 'password-reset',
        pwv: row.passwordChangedAt?.getTime() ?? 0,
      },
      {
        secret: getClientAccessTokenSecret(config, 'web'),
        expiresIn: '1h',
      },
    );
  };

  const reset = (token: string) =>
    request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: newPassword });

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
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    fixtures = new DbFixtures(prisma, 'authh');
    const tenant = await fixtures.createTenant('authh');
    tenantId = tenant.id;
    tenantSlug = (
      await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true },
      })
    ).slug;
    const organizationId = await fixtures.createOrganization(tenant.id);
    businessUnitId = await fixtures.createBusinessUnit(
      tenant.id,
      organizationId,
    );
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the app open.
    try {
      await prisma.agentRefreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.employeeDevice.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.employee.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.identity.deleteMany({ where: { id: { in: identityIds } } });
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('BUG-3138: a password reset never reactivates a disabled account', () => {
    it('control: an ACTIVE user resets its password and can then sign in', async () => {
      const user = await makeUser('reset-ok', 'ACTIVE');
      const res = await reset(await resetToken(user.id));
      expect(res.status).toBe(201);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.status).toBe('ACTIVE');
      expect(await bcrypt.compare(newPassword, after.passwordHash)).toBe(true);
    });

    it('a DISABLED user with a valid link is refused and stays DISABLED, password unchanged', async () => {
      const user = await makeUser('reset-disabled', 'DISABLED');
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const res = await reset(await resetToken(user.id));
      expect(res.status).toBe(401);
      // The same generic answer as an invalid link: no account oracle.
      expect((res.body as { message?: string }).message).toBe(
        'This password reset link is invalid or expired.',
      );
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.status).toBe('DISABLED');
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.passwordChangedAt?.getTime()).toBe(
        before.passwordChangedAt?.getTime(),
      );
    });

    it('a link issued while ACTIVE is refused once the user is disabled afterwards', async () => {
      const user = await makeUser('reset-later', 'ACTIVE');
      const token = await resetToken(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'DISABLED' },
      });
      const res = await reset(token);
      expect(res.status).toBe(401);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .status,
      ).toBe('DISABLED');
    });

    it('a reset for a user of a suspended tenant is refused', async () => {
      const user = await makeUser('reset-suspended', 'ACTIVE');
      const token = await resetToken(user.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      try {
        const res = await reset(token);
        expect(res.status).toBe(401);
        const after = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        expect(await bcrypt.compare(password, after.passwordHash)).toBe(true);
      } finally {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'ACTIVE' },
        });
      }
    });
  });

  describe('BUG-3137: the forgot-password flow never stores the reset link', () => {
    it('the delivery-log row for a forgot-password request carries no reset URL or token', async () => {
      const user = await makeUser('forgot', 'ACTIVE');
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email, tenantSlug });
      expect(res.status).toBeLessThan(300);

      // The control: the request really produced a delivery-log row for this
      // recipient, so an absent URL below is the fix and not a missing email.
      let row = null;
      for (let attempt = 0; attempt < 20 && !row; attempt += 1) {
        row = await prisma.emailDeliveryLog.findFirst({
          where: { tenantId, recipient: user.email },
          orderBy: { createdAt: 'desc' },
        });
        if (!row) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(row).not.toBeNull();
      const stored = JSON.stringify(row?.metadata ?? {});
      expect(stored).toContain('forgot-password');
      expect(stored).not.toMatch(/reset-password\?token=/);
      expect(stored).not.toMatch(/resetUrl/i);
      expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    });
  });

  describe('BUG-3140: startNewSession cannot extend the absolute agent session', () => {
    const fingerprint = `fp-${suffix}-device-0001`;
    const login = (email: string) =>
      request(app.getHttpServer()).post('/agent/auth/login').send({
        email,
        password,
        deviceFingerprint: fingerprint,
        deviceName: 'Test device',
        os: 'Windows',
        platform: 'win32',
        agentVersion: '1.0.0',
      });
    const refresh = (refreshToken: string, startNewSession?: boolean) =>
      request(app.getHttpServer())
        .post('/agent/auth/refresh')
        .send({
          refreshToken,
          deviceFingerprint: fingerprint,
          agentVersion: '1.0.0',
          ...(startNewSession === undefined ? {} : { startNewSession }),
        });
    const tokenRow = (userId: string) =>
      prisma.agentRefreshToken.findFirstOrThrow({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });

    it('control: a signed-in agent refreshes, and the new token keeps the SAME absolute expiry', async () => {
      const user = await makeUser('agent-ok', 'ACTIVE');
      const signedIn = await login(user.email);
      expect(signedIn.status).toBe(201);
      const tokens = (signedIn.body as { tokens: { refreshToken: string } })
        .tokens;
      const first = await tokenRow(user.id);
      const res = await refresh(tokens.refreshToken);
      expect(res.status).toBe(201);
      const second = await tokenRow(user.id);
      expect(second.id).not.toBe(first.id);
      expect(second.absoluteExpiresAt?.getTime()).toBe(
        first.absoluteExpiresAt?.getTime(),
      );
    });

    it('with the flag, a session past its ABSOLUTE expiry is refused (it used to mint a fresh lifetime)', async () => {
      const user = await makeUser('agent-absolute', 'ACTIVE');
      const signedIn = await login(user.email);
      expect(signedIn.status).toBe(201);
      const refreshToken = (
        signedIn.body as { tokens: { refreshToken: string } }
      ).tokens.refreshToken;
      const row = await tokenRow(user.id);
      await prisma.agentRefreshToken.update({
        where: { id: row.id },
        data: { absoluteExpiresAt: new Date(Date.now() - 60_000) },
      });
      const res = await refresh(refreshToken, true);
      expect(res.status).toBe(401);
      expect((res.body as { message?: string }).message).toBe(
        'Agent session has expired.',
      );
      // Nothing was minted: the presented token is not revoked and no new row.
      const rows = await prisma.agentRefreshToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].revokedAt).toBeNull();
    });

    it('with the flag, an IDLE session still resumes, and keeps its original absolute expiry', async () => {
      const user = await makeUser('agent-idle', 'ACTIVE');
      const signedIn = await login(user.email);
      const refreshToken = (
        signedIn.body as { tokens: { refreshToken: string } }
      ).tokens.refreshToken;
      const row = await tokenRow(user.id);
      await prisma.agentRefreshToken.update({
        where: { id: row.id },
        data: { lastActivityAt: new Date(Date.now() - 400 * 24 * 3600_000) },
      });
      // Without the flag the idle session is refused...
      const refused = await refresh(refreshToken);
      expect(refused.status).toBe(401);
      expect((refused.body as { message?: string }).message).toBe(
        'Agent session expired due to inactivity.',
      );
      // ...with it, the desktop's resume-after-restart path works, on the same
      // absolute lifetime.
      const resumed = await refresh(refreshToken, true);
      expect(resumed.status).toBe(201);
      const next = await tokenRow(user.id);
      expect(next.absoluteExpiresAt?.getTime()).toBe(
        row.absoluteExpiresAt?.getTime(),
      );
    });
  });
});
