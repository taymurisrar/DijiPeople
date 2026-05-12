import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import {
  getAuthClientIdFromHeaders,
  getAuthCookieNames,
  getClientAbsoluteTimeoutMs,
  getClientAccessTokenSecret,
  getClientAccessTokenTtl,
  getClientIdleTimeoutMs,
  getClientRefreshTokenSecret,
  getClientRefreshTokenTtl,
  getSessionAbsoluteTimeoutMs,
  getSessionActivityThrottleMs,
  isRefreshRotationEnabled,
  isSlidingSessionEnabled,
  normalizeAuthClientId,
  parseDurationToMilliseconds,
  buildAuthCookieOptions,
  type AuthClientId,
} from '../../common/config/auth.config';
import { AuthTokenPayload } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { PermissionBootstrapService } from '../permissions/permission-bootstrap.service';
import { UserInvitationsService } from './user-invitations.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthAccessService } from './auth-access.service';

type UserWithAccess = Prisma.UserGetPayload<{
  include: {
    tenant: {
      select: {
        id: true;
        name: true;
        slug: true;
        status: true;
        ownerUserId: true;
      };
    };
    userPermissions: {
      include: {
        permission: true;
      };
    };
    userRoles: {
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true;
              };
            };
            rolePrivileges: true;
            miscPermissions: true;
          };
        };
      };
    };
    teamMemberships: {
      include: {
        team: {
          include: {
            teamRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true;
                      };
                    };
                    rolePrivileges: true;
                    miscPermissions: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly permissionBootstrapService: PermissionBootstrapService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly authAccessService: AuthAccessService,
  ) {}

  async signup(dto: SignupDto) {
    return this.tenantsService.signup({
      companyName: dto.companyName,
      slug: dto.slug,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      adminEmail: dto.adminEmail,
      password: dto.password,
    });
  }

  async login(dto: LoginDto, req?: Request) {
    const clientId = this.getClientId(req);
    const user = await this.validateCredentials(dto);
    const tenantStatus = String(user.tenant.status).toUpperCase();

    if (user.status !== 'ACTIVE' || tenantStatus !== 'ACTIVE') {
      throw new UnauthorizedException('This account is not active.');
    }

    await this.permissionBootstrapService.bootstrapTenantRbac(user.tenantId);

    const refreshedUser = await this.usersService.findByIdWithAccess(user.id);

    if (!refreshedUser) {
      throw new UnauthorizedException('Unable to load this account.');
    }

    const authResponse = this.buildAuthResponse(
      refreshedUser,
      dto.rememberMe ?? false,
      { clientId },
    );

    await Promise.all([
      this.persistRefreshToken(
        refreshedUser.id,
        refreshedUser.tenantId,
        authResponse.tokens.sessionId,
        clientId,
        authResponse.tokens.refreshToken,
        authResponse.tokens.refreshTokenExpiresIn,
        req,
      ),
      this.usersService.markLastLogin(refreshedUser.id),
    ]);

    return authResponse;
  }

  async refresh(
    refreshToken?: string,
    req?: Request,
    requestedClientId?: string,
  ) {
    if (!refreshToken) {
      throw this.authUnauthorized(
        'REFRESH_TOKEN_EXPIRED',
        'Refresh token is invalid or expired.',
      );
    }

    const clientId = normalizeAuthClientId(
      requestedClientId ?? this.getClientId(req),
    );
    const payload = await this.verifyRefreshToken(refreshToken, clientId);

    if (
      normalizeAuthClientId(payload.appClientId) !== clientId ||
      normalizeAuthClientId(String(payload.aud ?? '')) !== clientId
    ) {
      throw this.authUnauthorized(
        'INVALID_TOKEN',
        'Refresh token is not valid for this application.',
      );
    }

    const user = await this.usersService.findByIdWithAccess(payload.sub);

    if (!user) {
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Unable to refresh this session.',
      );
    }

    const tenantStatus = String(user.tenant.status).toUpperCase();

    if (user.status !== 'ACTIVE' || tenantStatus !== 'ACTIVE') {
      throw this.authUnauthorized(
        'SESSION_REVOKED',
        'This account is not active.',
      );
    }

    await this.permissionBootstrapService.bootstrapTenantRbac(user.tenantId);

    const refreshedUser = await this.usersService.findByIdWithAccess(user.id);

    if (!refreshedUser) {
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Unable to refresh this session.',
      );
    }

    const refreshTokenMatches = await this.hasActiveRefreshToken(
      refreshedUser.id,
      refreshedUser.tenantId,
      payload.sessionId,
      clientId,
      refreshToken,
    );

    if (!refreshTokenMatches) {
      throw this.authUnauthorized(
        'SESSION_REVOKED',
        'Refresh token is invalid.',
      );
    }

    const rotateRefresh = isRefreshRotationEnabled(this.configService);
    const authResponse = this.buildAuthResponse(refreshedUser, false, {
      clientId,
      sessionId: payload.sessionId,
      refreshTokenOverride: rotateRefresh ? undefined : refreshToken,
    });

    if (rotateRefresh) {
      await this.rotateRefreshToken(
        refreshedUser.id,
        refreshedUser.tenantId,
        payload.sessionId,
        clientId,
        refreshToken,
        authResponse.tokens.refreshToken,
        authResponse.tokens.refreshTokenExpiresIn,
        req,
      );
    } else {
      await this.touchRefreshSession(
        refreshedUser.id,
        refreshedUser.tenantId,
        payload.sessionId,
        clientId,
      );
    }

    return authResponse;
  }

  async recordActivity(currentUser: {
    userId: string;
    tenantId: string;
    sessionId?: string;
    appClientId?: string;
  }) {
    if (!isSlidingSessionEnabled(this.configService)) {
      return { ok: true, sliding: false };
    }

    const throttleMs = getSessionActivityThrottleMs(this.configService);
    const threshold = new Date(Date.now() - throttleMs);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId: currentUser.userId,
        tenantId: currentUser.tenantId,
        ...(currentUser.sessionId ? { sessionId: currentUser.sessionId } : {}),
        ...(currentUser.appClientId
          ? { appClientId: currentUser.appClientId }
          : {}),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: threshold } }],
      },
      data: {
        lastActivityAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    return { ok: true, sliding: true };
  }

  async getProfileFromRequest(req: Request, res: Response) {
    const clientId = this.getClientId(req);
    const cookieNames = getAuthCookieNames(this.configService, clientId);
    const accessToken = this.extractTokenFromRequest(req, cookieNames.access);
    const refreshToken = this.extractTokenFromRequest(req, cookieNames.refresh);

    if (accessToken) {
      try {
        const payload = await this.verifyAccessToken(accessToken, clientId);
        const { response } = await this.authAccessService.loadAccessContext(
          payload.sub,
          payload.tenantId,
        );
        return response;
      } catch {
        // Fall through to refresh. Invalid refresh clears both cookies below.
      }
    }

    if (!refreshToken) {
      this.clearAuthCookies(res, clientId);
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Your session expired. Please sign in again to continue.',
      );
    }

    try {
      const refreshed = await this.refresh(refreshToken, req, clientId);
      this.setAuthCookies(res, refreshed.tokens, false, clientId);
      const { response } = await this.authAccessService.loadAccessContext(
        refreshed.user.userId,
        refreshed.tenant.id,
      );
      return response;
    } catch {
      this.clearAuthCookies(res, clientId);
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Your session expired. Please sign in again to continue.',
      );
    }
  }

  getInvitationStatus(token: string) {
    return this.userInvitationsService.getInvitationStatus(token);
  }

  activateAccount(token: string, password: string) {
    return this.userInvitationsService.activateAccount(token, password);
  }

  setAuthCookies(
    res: Response,
    tokens: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      accessTokenExpiresIn: string;
      refreshTokenExpiresIn: string;
    },
    rememberMe?: boolean,
    clientId: AuthClientId = 'web',
  ) {
    const accessMaxAge = rememberMe
      ? parseDurationToMilliseconds(tokens.accessTokenExpiresIn)
      : undefined;

    const refreshMaxAge = rememberMe
      ? parseDurationToMilliseconds(tokens.refreshTokenExpiresIn)
      : undefined;

    const cookieNames = getAuthCookieNames(this.configService, clientId);

    res.cookie(
      cookieNames.access,
      tokens.accessToken,
      buildAuthCookieOptions(this.configService, accessMaxAge, clientId),
    );

    res.cookie(
      cookieNames.refresh,
      tokens.refreshToken,
      buildAuthCookieOptions(this.configService, refreshMaxAge, clientId),
    );

    res.cookie(
      cookieNames.session,
      tokens.sessionId,
      buildAuthCookieOptions(
        this.configService,
        getSessionAbsoluteTimeoutMs(this.configService),
        clientId,
      ),
    );
  }

  clearAuthCookies(res: Response, clientId: AuthClientId = 'web') {
    const cookieNames = getAuthCookieNames(this.configService, clientId);
    const options = buildAuthCookieOptions(this.configService, 0, clientId);

    res.clearCookie(cookieNames.access, options);
    res.clearCookie(cookieNames.refresh, options);
    res.clearCookie(cookieNames.session, options);
  }

  async logout(req: Request, res: Response) {
    const clientId = this.getClientId(req);
    const cookieNames = getAuthCookieNames(this.configService, clientId);
    const refreshToken = this.extractTokenFromRequest(req, cookieNames.refresh);

    if (refreshToken) {
      const activeTokens = await this.prisma.refreshToken.findMany({
        where: { revokedAt: null, appClientId: clientId },
        select: { id: true, tokenHash: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      for (const tokenRecord of activeTokens) {
        const matches = await bcrypt.compare(
          refreshToken,
          tokenRecord.tokenHash,
        );
        if (matches) {
          await this.prisma.refreshToken.update({
            where: { id: tokenRecord.id },
            data: { revokedAt: new Date(), lastUsedAt: new Date() },
          });
          break;
        }
      }
    }

    this.clearAuthCookies(res, clientId);
  }

  private async validateCredentials(dto: LoginDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const tenantSlug = dto.tenantSlug?.trim();

    const user = tenantSlug
      ? await this.usersService.findByTenantSlugAndEmail(
          tenantSlug,
          normalizedEmail,
        )
      : await this.usersService.findByEmailWithAccess(normalizedEmail);

    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.login.failed',
          reason: 'USER_NOT_FOUND',
          identifier: normalizedEmail,
          tenantSlug: tenantSlug ?? null,
        }),
      );
      throw this.authUnauthorized(
        'INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.login.failed',
          reason: 'PASSWORD_MISMATCH',
          identifier: normalizedEmail,
          tenantSlug: tenantSlug ?? null,
          userId: user.id,
          tenantId: user.tenantId,
        }),
      );
      throw this.authUnauthorized(
        'INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    return user;
  }

  private async verifyRefreshToken(
    refreshToken: string,
    clientId: AuthClientId,
  ) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        refreshToken,
        {
          secret: getClientRefreshTokenSecret(this.configService, clientId),
        },
      );
      if (payload.tokenUse !== 'refresh' && payload.type !== 'refresh') {
        throw new Error('Invalid token type.');
      }
      return payload;
    } catch {
      throw this.authUnauthorized(
        'REFRESH_TOKEN_EXPIRED',
        'Refresh token is invalid or expired.',
      );
    }
  }

  private async verifyAccessToken(accessToken: string, clientId: AuthClientId) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        accessToken,
        { secret: getClientAccessTokenSecret(this.configService, clientId) },
      );
      if (payload.tokenUse !== 'access' && payload.type !== 'access') {
        throw new Error('Invalid token type.');
      }
      if (
        normalizeAuthClientId(payload.appClientId) !== clientId ||
        normalizeAuthClientId(String(payload.aud ?? '')) !== clientId
      ) {
        throw new Error('Invalid token audience.');
      }
      return payload;
    } catch {
      throw this.authUnauthorized(
        'ACCESS_TOKEN_EXPIRED',
        'Access token is invalid or expired.',
      );
    }
  }

  private async persistRefreshToken(
    userId: string,
    tenantId: string,
    sessionId: string,
    clientId: AuthClientId,
    refreshToken: string,
    refreshTokenTtl: string,
    req?: Request,
    absoluteExpiresAt?: Date | null,
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const now = Date.now();

    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        sessionId,
        appClientId: clientId,
        tokenFamilyId: sessionId,
        tokenHash,
        expiresAt: new Date(now + parseDurationToMilliseconds(refreshTokenTtl)),
        absoluteExpiresAt:
          absoluteExpiresAt ??
          new Date(
            now + getClientAbsoluteTimeoutMs(this.configService, clientId),
          ),
        lastActivityAt: new Date(now),
        userAgent: req?.headers['user-agent']?.slice(0, 500),
        ipAddress: req?.ip,
      },
    });
  }

  private async hasActiveRefreshToken(
    userId: string,
    tenantId: string,
    sessionId: string,
    clientId: AuthClientId,
    refreshToken: string,
  ) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        tenantId,
        sessionId,
        appClientId: clientId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);

      if (matches) {
        this.assertSessionNotExpired(tokenRecord, clientId);
        return true;
      }
    }

    return false;
  }

  private async rotateRefreshToken(
    userId: string,
    tenantId: string,
    sessionId: string,
    clientId: AuthClientId,
    previousRefreshToken: string,
    nextRefreshToken: string,
    nextRefreshTokenTtl: string,
    req?: Request,
  ) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        tenantId,
        sessionId,
        appClientId: clientId,
        revokedAt: null,
      },
    });

    let absoluteExpiresAt: Date | null = null;

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(
        previousRefreshToken,
        tokenRecord.tokenHash,
      );

      if (matches) {
        absoluteExpiresAt = tokenRecord.absoluteExpiresAt;
        await this.prisma.refreshToken.update({
          where: {
            id: tokenRecord.id,
          },
          data: {
            revokedAt: new Date(),
            lastUsedAt: new Date(),
          },
        });
      }
    }

    await this.persistRefreshToken(
      userId,
      tenantId,
      sessionId,
      clientId,
      nextRefreshToken,
      nextRefreshTokenTtl,
      req,
      absoluteExpiresAt,
    );
  }

  private async touchRefreshSession(
    userId: string,
    tenantId: string,
    sessionId: string,
    clientId: AuthClientId,
  ) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        tenantId,
        sessionId,
        appClientId: clientId,
        revokedAt: null,
      },
      data: {
        lastActivityAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
  }

  private buildAuthResponse(
    user: UserWithAccess,
    rememberMe = false,
    options: {
      clientId?: AuthClientId;
      sessionId?: string;
      refreshTokenOverride?: string;
    } = {},
  ) {
    const clientId = options.clientId ?? 'web';
    const sessionId = options.sessionId ?? randomUUID();
    const tokenVersion = 0;

    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      sessionId,
      tokenVersion,
      type: 'access',
      tokenUse: 'access',
      appClientId: clientId,
      aud: clientId,
    };

    const accessTokenTtl = rememberMe
      ? this.configService.get<string>('JWT_ACCESS_TTL_REMEMBER_ME') || '30m'
      : getClientAccessTokenTtl(this.configService, clientId);

    const refreshTokenTtl = rememberMe
      ? this.configService.get<string>('JWT_REFRESH_TTL_REMEMBER_ME') || '30d'
      : getClientRefreshTokenTtl(this.configService, clientId);

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: getClientAccessTokenSecret(this.configService, clientId),
      expiresIn: accessTokenTtl as StringValue,
    });

    const refreshToken =
      options.refreshTokenOverride ??
      this.jwtService.sign(
        {
          sub: user.id,
          tenantId: user.tenantId,
          sessionId,
          tokenVersion,
          type: 'refresh',
          tokenUse: 'refresh',
          appClientId: clientId,
          aud: clientId,
        } satisfies AuthTokenPayload,
        {
          secret: getClientRefreshTokenSecret(this.configService, clientId),
          expiresIn: refreshTokenTtl as StringValue,
        },
      );

    return {
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
      user: this.mapUserSummary(user, user.tenant.ownerUserId === user.id),
      tokens: {
        accessToken,
        refreshToken,
        sessionId,
        accessTokenExpiresIn: accessTokenTtl,
        refreshTokenExpiresIn: refreshTokenTtl,
      },
    };
  }

  private mapUserSummary(user: UserWithAccess, isTenantOwner = false) {
    const directRoles = user.userRoles
      .map((userRole) => userRole.role)
      .filter((role) => role.isActive);
    const teamRoles = user.teamMemberships.flatMap((membership) =>
      membership.team.teamRoles
        .map((teamRole) => teamRole.role)
        .filter((role) => role.isActive),
    );
    const effectiveRoles = Array.from(
      new Map(
        [...directRoles, ...teamRoles].map((role) => [role.id, role]),
      ).values(),
    );
    const roleIds = effectiveRoles.map((role) => role.id);
    const roleKeys = effectiveRoles.map((role) => role.key);
    const isGlobalAdministrator = roleKeys.includes(ROLE_KEYS.GLOBAL_ADMIN);
    const roles = effectiveRoles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      type: role.isSystem ? 'SYSTEM' : 'CUSTOM',
      isSystem: role.isSystem,
    }));
    const permissionKeys = Array.from(
      new Set([
        ...(isGlobalAdministrator
          ? FOUNDATION_PERMISSION_DEFINITIONS.map(
              (permission) => permission.key,
            )
          : []),
        ...effectiveRoles.flatMap((role) =>
          role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.key,
          ),
        ),
        ...effectiveRoles.flatMap((role) =>
          role.rolePrivileges
            .filter((privilege) => privilege.accessLevel !== 'NONE')
            .map(
              (privilege) =>
                `${privilege.entityKey}.${privilege.privilege.toLowerCase()}`,
            ),
        ),
        ...effectiveRoles.flatMap((role) =>
          role.miscPermissions
            .filter((permission) => permission.enabled)
            .map((permission) => permission.permissionKey),
        ),
        ...user.userPermissions.map(
          (userPermission) => userPermission.permission.key,
        ),
      ]),
    );

    return {
      id: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isTenantOwner,
      roleIds,
      roleKeys,
      roles,
      permissionKeys,
      rolePrivileges: effectiveRoles.flatMap((role) =>
        role.rolePrivileges.map((privilege) => ({
          entityKey: privilege.entityKey,
          privilege: privilege.privilege,
          accessLevel: privilege.accessLevel,
          roleId: role.id,
        })),
      ),
      miscPermissions: effectiveRoles.flatMap((role) =>
        role.miscPermissions
          .filter((permission) => permission.enabled)
          .map((permission) => permission.permissionKey),
      ),
      availablePermissionKeys: FOUNDATION_PERMISSION_DEFINITIONS.map(
        (permission) => permission.key,
      ),
    };
  }

  private extractTokenFromRequest(req: Request, cookieName: string) {
    const cookies = req.cookies as Record<string, string> | undefined;
    if (cookies?.[cookieName]) {
      return cookies[cookieName];
    }

    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const prefix = `${cookieName}=`;
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        return decodeURIComponent(trimmed.slice(prefix.length));
      }
    }

    return null;
  }

  private assertSessionNotExpired(
    tokenRecord: {
      absoluteExpiresAt: Date | null;
      lastActivityAt: Date | null;
    },
    clientId: AuthClientId,
  ) {
    const now = Date.now();
    if (
      tokenRecord.absoluteExpiresAt &&
      tokenRecord.absoluteExpiresAt.getTime() <= now
    ) {
      throw this.authUnauthorized('SESSION_EXPIRED', 'Session has expired.');
    }

    if (!isSlidingSessionEnabled(this.configService)) {
      return;
    }

    const lastActivityAt = tokenRecord.lastActivityAt?.getTime();
    if (
      lastActivityAt &&
      now - lastActivityAt >
        getClientIdleTimeoutMs(this.configService, clientId)
    ) {
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Session expired due to inactivity.',
      );
    }
  }

  private authUnauthorized(code: string, message: string) {
    return new UnauthorizedException({ code, message });
  }

  private getClientId(req?: Request): AuthClientId {
    return req
      ? getAuthClientIdFromHeaders(req.headers)
      : normalizeAuthClientId(undefined);
  }
}
