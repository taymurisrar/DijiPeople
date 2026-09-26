/**
 * Authenticated callers for HTTP-level e2e suites.
 *
 * `JwtAuthGuard` does three things a bypass would skip: it verifies the token
 * with the per-client secret, it requires a live refresh-token row for the
 * session the token names, and it reloads the subject's access context from
 * the database. An actor built here satisfies all three for real, so a request
 * that reaches a service has been through the same gate a browser's would.
 *
 * Two shapes, because the platform and the tenant product authenticate
 * differently:
 *
 *   platform operator   PlatformUser + PlatformRefreshToken, client `admin`,
 *                       `authSubjectType: 'platform-user'` — the role decides
 *                       the permission set (`platformAccessForRole`).
 *   tenant user         User + Identity + RefreshToken, client `web` — no
 *                       platform identity at all, which is the point of the
 *                       negative tests that use one.
 *
 * Every row is registered at the moment it is created, so `cleanup()` removes
 * exactly what this instance made, even after a setup that failed half-way.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PlatformUserRole } from '@prisma/client';

import { getClientAccessTokenSecret } from '../../src/common/config/auth.config';
import type { AuthTokenPayload } from '../../src/common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../src/common/prisma/prisma.service';

export interface HttpActor {
  id: string;
  email: string;
  /** The `X-DijiPeople-App` value the token was minted for. */
  client: 'admin' | 'web';
  /** Pass as `Authorization: Bearer <token>`. */
  token: string;
}

export class HttpActors {
  private readonly platformUserIds: string[] = [];
  private readonly userIds: string[] = [];
  private readonly identityIds: string[] = [];

  private readonly prisma: PrismaService;
  private readonly jwt: JwtService;
  private readonly config: ConfigService;

  constructor(
    app: INestApplication,
    private readonly runId: string,
  ) {
    this.prisma = app.get(PrismaService);
    this.jwt = app.get(JwtService);
    this.config = app.get(ConfigService);
  }

  /** A platform operator holding exactly the permissions `role` grants. */
  async platformUser(
    role: PlatformUserRole,
    label: string,
  ): Promise<HttpActor> {
    const email = `${label}-${this.runId}@example.invalid`.toLowerCase();
    const user = await this.prisma.platformUser.create({
      data: {
        email,
        firstName: 'E2E',
        lastName: label,
        // Never used to sign in: the token below is minted directly.
        passwordHash: 'not-used-in-this-test',
        role,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    this.platformUserIds.push(user.id);

    const sessionId = randomUUID();
    await this.prisma.platformRefreshToken.create({
      data: {
        platformUserId: user.id,
        sessionId,
        appClientId: 'admin',
        tokenFamilyId: sessionId,
        tokenHash: createHash('sha256')
          .update(`${sessionId}-${this.runId}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        lastActivityAt: new Date(),
      },
    });

    const payload: AuthTokenPayload = {
      sub: user.id,
      tenantId: 'platform',
      email,
      sessionId,
      tokenVersion: 0,
      type: 'access',
      tokenUse: 'access',
      appClientId: 'admin',
      aud: 'admin',
      authSubjectType: 'platform-user',
      platformRole: role,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: getClientAccessTokenSecret(this.config, 'admin'),
      expiresIn: '1h',
    });
    return { id: user.id, email, client: 'admin', token };
  }

  /** A tenant user with no platform identity and no roles. */
  async tenantUser(
    tenantId: string,
    businessUnitId: string,
    label: string,
  ): Promise<HttpActor> {
    const email = `${label}-${this.runId}@example.invalid`.toLowerCase();
    const identity = await this.prisma.identity.create({
      data: { email, passwordHash: 'not-used-in-this-test' },
      select: { id: true },
    });
    this.identityIds.push(identity.id);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        businessUnitId,
        identityId: identity.id,
        firstName: 'E2E',
        lastName: label,
        email,
        passwordHash: 'not-used-in-this-test',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    this.userIds.push(user.id);

    const sessionId = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        sessionId,
        appClientId: 'web',
        tokenHash: createHash('sha256')
          .update(`${sessionId}-${this.runId}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        lastActivityAt: new Date(),
      },
    });

    const payload: AuthTokenPayload = {
      sub: user.id,
      tenantId,
      email,
      sessionId,
      tokenVersion: 1,
      type: 'access',
      tokenUse: 'access',
      appClientId: 'web',
      aud: 'web',
    };
    const token = await this.jwt.signAsync(payload, {
      secret: getClientAccessTokenSecret(this.config, 'web'),
      expiresIn: '1h',
    });
    return { id: user.id, email, client: 'web', token };
  }

  /**
   * Remove every row this instance created, in reverse dependency order.
   *
   * Throws on a failure rather than warning: a leaked operator account is a
   * real leak, and `.agent/context/test-resource-policy.md` forbids reporting a
   * clean run over one. Refresh tokens cascade from both user tables.
   */
  async cleanup(): Promise<void> {
    if (this.userIds.length > 0) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId: { in: this.userIds } },
      });
      await this.prisma.user.deleteMany({
        where: { id: { in: this.userIds } },
      });
      this.userIds.length = 0;
    }
    if (this.identityIds.length > 0) {
      await this.prisma.identity.deleteMany({
        where: { id: { in: this.identityIds } },
      });
      this.identityIds.length = 0;
    }
    if (this.platformUserIds.length > 0) {
      await this.prisma.platformUser.deleteMany({
        where: { id: { in: this.platformUserIds } },
      });
      this.platformUserIds.length = 0;
    }
  }
}
