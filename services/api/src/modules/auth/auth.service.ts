import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { getAppOrigin } from '@repo/config';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformUser, Prisma } from '@prisma/client';
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
import { PublicTenantsService } from '../tenants/public-tenants.service';
import { UsersService } from '../users/users.service';
import { PermissionBootstrapService } from '../permissions/permission-bootstrap.service';
import { UserInvitationsService } from './user-invitations.service';
import { EmailService } from '../notifications/email/email.service';
import { AuditService } from '../audit/audit.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthAccessService } from './auth-access.service';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { AdminLoginDto } from './dto/admin-login.dto';

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

const ADMIN_AUTH_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly publicTenantsService: PublicTenantsService,
    private readonly usersService: UsersService,
    private readonly permissionBootstrapService: PermissionBootstrapService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly authAccessService: AuthAccessService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
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
    const user = await this.validateCredentials(dto, req, clientId);
    const tenantStatus = String(user.tenant.status).toUpperCase();

    if (user.status !== 'ACTIVE' || tenantStatus !== 'ACTIVE') {
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'auth.login.failed',
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: 'ACCOUNT_OR_TENANT_INACTIVE',
        clientId,
        req,
      });
      throw new UnauthorizedException('This account is not active.');
    }

    await this.permissionBootstrapService.bootstrapTenantRbac(user.tenantId);

    const refreshedUser = await this.usersService.findByIdWithAccess(user.id);

    if (!refreshedUser) {
      throw new UnauthorizedException('Unable to load this account.');
    }

    const authResponse = await this.buildAuthResponse(
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
        new Date(
          Date.now() +
            authResponse.tokens.absoluteSessionLifetimeDays * 86_400_000,
        ),
      ),
      this.usersService.markLastLogin(refreshedUser.id),
    ]);

    await this.logTenantAuthEvent({
      tenantId: refreshedUser.tenantId,
      actorUserId: refreshedUser.id,
      action: 'auth.login.succeeded',
      entityId: refreshedUser.id,
      email: refreshedUser.email,
      result: 'SUCCESS',
      clientId,
      sessionId: authResponse.tokens.sessionId,
      req,
    });

    return authResponse;
  }

  async adminLogin(dto: AdminLoginDto, req?: Request) {
    const clientId: AuthClientId = 'admin';
    const user = await this.validatePlatformAdminCredentials(dto);

    if (user.status !== 'ACTIVE') {
      throw this.authUnauthorized(
        'ADMIN_AUTH_ACCOUNT_INACTIVE',
        'This admin account is not active.',
      );
    }

    const authResponse = this.buildPlatformAuthResponse(
      user,
      dto.rememberMe ?? false,
      { clientId },
    );

    await Promise.all([
      this.persistPlatformRefreshToken(
        user.id,
        authResponse.tokens.sessionId,
        clientId,
        authResponse.tokens.refreshToken,
        authResponse.tokens.refreshTokenExpiresIn,
        req,
      ),
      this.prisma.platformUser.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      }),
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

    if (clientId === 'admin' && payload.authSubjectType === 'platform-user') {
      return this.refreshPlatformSession(payload, refreshToken, req, clientId);
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
    const authResponse = await this.buildAuthResponse(
      refreshedUser,
      payload.rememberMe ?? false,
      {
        clientId,
        sessionId: payload.sessionId,
        refreshTokenOverride: rotateRefresh ? undefined : refreshToken,
      },
    );

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
    platform?: { id: string };
  }) {
    if (!isSlidingSessionEnabled(this.configService)) {
      return { ok: true, sliding: false };
    }

    const throttleMs = getSessionActivityThrottleMs(this.configService);
    const threshold = new Date(Date.now() - throttleMs);

    if (currentUser.appClientId === 'admin' && currentUser.platform?.id) {
      await this.prisma.platformRefreshToken.updateMany({
        where: {
          platformUserId: currentUser.platform.id,
          ...(currentUser.sessionId
            ? { sessionId: currentUser.sessionId }
            : {}),
          appClientId: 'admin',
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
        const { response } =
          clientId === 'admin' && payload.authSubjectType === 'platform-user'
            ? await this.authAccessService.loadPlatformAccessContext(
                payload.sub,
              )
            : await this.authAccessService.loadAccessContext(
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
      const { response } =
        clientId === 'admin' &&
        'role' in refreshed.user &&
        refreshed.tenant.id === 'platform'
          ? await this.authAccessService.loadPlatformAccessContext(
              refreshed.user.userId,
            )
          : await this.authAccessService.loadAccessContext(
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

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const email = normalizeEmail(dto.email);
    const tenantSlug = dto.tenantSlug?.trim().toLowerCase();
    const tenantCode = dto.tenantCode?.trim().toUpperCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        ...(tenantSlug || tenantCode
          ? {
              tenant: {
                ...(tenantSlug ? { slug: tenantSlug } : {}),
                ...(tenantCode ? { tenantCode } : {}),
              },
            }
          : {}),
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        employee: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!user || user.status !== 'ACTIVE' || user.tenant.status !== 'ACTIVE') {
      return {
        ok: true,
        message:
          'If an active account exists for this email, a password reset link will be sent.',
      };
    }

    const resetToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        type: 'password-reset',
      },
      {
        secret: getClientAccessTokenSecret(this.configService, 'web'),
        expiresIn: '1d',
      },
    );
    const baseUrl =
      this.configService.get<string>('PASSWORD_RESET_LINK_BASE_URL') ??
      `${getAppOrigin('web', process.env)}/reset-password`;
    const resetUrl = `${baseUrl}?tenant=${encodeURIComponent(
      user.tenant.slug,
    )}&token=${encodeURIComponent(resetToken)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const recipientName = `${user.firstName} ${user.lastName}`.trim() || email;

    await this.emailService.sendTemplateEmail({
      tenantId: user.tenantId,
      eventCode: 'AUTH_PASSWORD_RESET',
      templateKey: 'AUTH_PASSWORD_RESET',
      recipient: email,
      variables: {
        firstName: user.firstName,
        name: recipientName,
        recipientName,
        email,
        tenantName: user.tenant.name,
        appName: 'DijiPeople',
        resetUrl,
        expiresIn: '24 hours',
        expiresAt: expiresAt.toISOString(),
        supportEmail:
          this.configService.get<string>('SUPPORT_EMAIL') ??
          'support@dijipeople.com',
      },
      metadata: {
        userId: user.id,
        employeeId: user.employee?.id ?? null,
        resetUrl,
        source: 'forgot-password',
      },
      requestedByUserId: user.id,
    });

    return {
      ok: true,
      message:
        'If an active account exists for this email, a password reset link will be sent.',
    };
  }

  async issuePasswordResetForUser(input: {
    tenantId: string;
    userId: string;
    requestedByUserId: string;
    source: string;
  }) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: input.userId,
        tenantId: input.tenantId,
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        employee: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account was not found.');
    }

    if (user.status === 'DISABLED') {
      throw new ForbiddenException(
        'Password reset cannot be sent to a disabled account.',
      );
    }

    const reset = await this.sendPasswordResetEmail({
      user,
      requestedByUserId: input.requestedByUserId,
      source: input.source,
    });

    return {
      ok: true,
      expiresAt: reset.expiresAt,
      deliveryStatus: reset.delivery.status,
      deliveryMode: reset.delivery.sent ? 'sent' : 'disabled',
    };
  }

  async resetPassword(token: string, password: string) {
    let payload: Omit<AuthTokenPayload, 'type'> & { type?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: getClientAccessTokenSecret(this.configService, 'web'),
      });
    } catch {
      throw new UnauthorizedException(
        'This password reset link is invalid or expired.',
      );
    }

    if (
      payload.type !== 'password-reset' ||
      !payload.sub ||
      !payload.tenantId
    ) {
      throw new UnauthorizedException(
        'This password reset link is invalid or expired.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: payload.sub },
        data: {
          passwordHash,
          status: 'ACTIVE',
          updatedById: payload.sub,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          tenantId: payload.tenantId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private async sendPasswordResetEmail(input: {
    user: {
      id: string;
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      tenant: { name: string; slug: string };
      employee?: { id: string } | null;
    };
    requestedByUserId: string;
    source: string;
  }) {
    const resetToken = this.jwtService.sign(
      {
        sub: input.user.id,
        tenantId: input.user.tenantId,
        type: 'password-reset',
      },
      {
        secret: getClientAccessTokenSecret(this.configService, 'web'),
        expiresIn: '1d',
      },
    );
    const baseUrl =
      this.configService.get<string>('PASSWORD_RESET_LINK_BASE_URL') ??
      `${getAppOrigin('web', process.env)}/reset-password`;
    const resetUrl = `${baseUrl}?tenant=${encodeURIComponent(
      input.user.tenant.slug,
    )}&token=${encodeURIComponent(resetToken)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const recipientName =
      `${input.user.firstName} ${input.user.lastName}`.trim() ||
      input.user.email;

    const delivery = await this.emailService.sendTemplateEmail({
      tenantId: input.user.tenantId,
      eventCode: 'AUTH_PASSWORD_RESET',
      templateKey: 'AUTH_PASSWORD_RESET',
      recipient: input.user.email,
      variables: {
        firstName: input.user.firstName,
        name: recipientName,
        recipientName,
        email: input.user.email,
        tenantName: input.user.tenant.name,
        appName: 'DijiPeople',
        resetUrl,
        expiresIn: '24 hours',
        expiresAt: expiresAt.toISOString(),
        supportEmail:
          this.configService.get<string>('SUPPORT_EMAIL') ??
          'support@dijipeople.com',
      },
      metadata: {
        userId: input.user.id,
        employeeId: input.user.employee?.id ?? null,
        resetUrl,
        source: input.source,
      },
      requestedByUserId: input.requestedByUserId,
    });

    return { delivery, expiresAt };
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
    const accessMaxAge = parseDurationToMilliseconds(
      tokens.accessTokenExpiresIn,
    );
    const refreshMaxAge = parseDurationToMilliseconds(
      tokens.refreshTokenExpiresIn,
    );

    const cookieNames = getAuthCookieNames(this.configService, clientId);
    const accessCookieOptions = buildAuthCookieOptions(
      this.configService,
      accessMaxAge,
      clientId,
    );
    const refreshCookieOptions = buildAuthCookieOptions(
      this.configService,
      refreshMaxAge,
      clientId,
    );
    const sessionCookieOptions = buildAuthCookieOptions(
      this.configService,
      getSessionAbsoluteTimeoutMs(this.configService),
      clientId,
    );

    res.cookie(cookieNames.access, tokens.accessToken, accessCookieOptions);

    res.cookie(cookieNames.refresh, tokens.refreshToken, refreshCookieOptions);

    res.cookie(cookieNames.session, tokens.sessionId, sessionCookieOptions);

    this.logger.log({
      event: 'auth.cookies.set',
      clientId,
      cookies: cookieNames,
      access: toCookieLog(accessCookieOptions),
      refresh: toCookieLog(refreshCookieOptions),
      session: toCookieLog(sessionCookieOptions),
    });
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
      if (clientId === 'admin') {
        const activeTokens = await this.prisma.platformRefreshToken.findMany({
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
            await this.prisma.platformRefreshToken.update({
              where: { id: tokenRecord.id },
              data: { revokedAt: new Date(), lastUsedAt: new Date() },
            });
            break;
          }
        }
      } else {
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
    }

    this.clearAuthCookies(res, clientId);
  }

  private async validateCredentials(
    dto: LoginDto,
    req?: Request,
    clientId: AuthClientId = 'web',
  ) {
    const normalizedEmail = normalizeEmail(dto.email);
    const tenantContext = await this.resolveLoginTenant(dto);
    const user = await this.usersService.findByTenantIdAndEmail(
      tenantContext.id,
      normalizedEmail,
    );

    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.login.failed',
          reason: 'USER_NOT_FOUND',
          identifier: normalizedEmail,
          tenantId: tenantContext.id,
          tenantSlug: tenantContext.slug,
        }),
      );
      await this.logTenantAuthEvent({
        tenantId: tenantContext.id,
        action: 'auth.login.failed',
        entityId: normalizedEmail,
        email: normalizedEmail,
        result: 'FAILED',
        failureReason: 'USER_NOT_FOUND',
        clientId,
        req,
      });
      throw this.authUnauthorized(
        'AUTH_INVALID_CREDENTIALS',
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
          tenantSlug: tenantContext.slug,
          userId: user.id,
          tenantId: user.tenantId,
        }),
      );
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'auth.login.failed',
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: 'PASSWORD_MISMATCH',
        clientId,
        req,
      });
      throw this.authUnauthorized(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    return user;
  }

  private async validateAdminCredentials(dto: AdminLoginDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const users =
      await this.usersService.findManyByEmailWithAccess(normalizedEmail);
    const adminCandidates = users.filter((user) => this.hasAdminAuthRole(user));

    for (const user of adminCandidates) {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        continue;
      }

      return user;
    }

    this.logger.warn(
      JSON.stringify({
        event: 'admin.auth.login.failed',
        reason:
          adminCandidates.length > 0 ? 'PASSWORD_MISMATCH' : 'NO_ADMIN_USER',
        identifier: normalizedEmail,
      }),
    );
    throw this.authUnauthorized(
      'ADMIN_AUTH_INVALID_CREDENTIALS',
      'Invalid admin credentials.',
    );
  }

  private async validatePlatformAdminCredentials(dto: AdminLoginDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.prisma.platformUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'admin.auth.login.failed',
          reason: 'PLATFORM_USER_NOT_FOUND',
          identifier: normalizedEmail,
        }),
      );
      throw this.authUnauthorized(
        'ADMIN_AUTH_INVALID_CREDENTIALS',
        'Invalid admin credentials.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        JSON.stringify({
          event: 'admin.auth.login.failed',
          reason: 'PASSWORD_MISMATCH',
          identifier: normalizedEmail,
          platformUserId: user.id,
        }),
      );
      throw this.authUnauthorized(
        'ADMIN_AUTH_INVALID_CREDENTIALS',
        'Invalid admin credentials.',
      );
    }

    return user;
  }

  private hasAdminAuthRole(user: UserWithAccess) {
    return this.getEffectiveRoleKeys(user).some((roleKey) =>
      ADMIN_AUTH_ROLE_KEYS.has(roleKey),
    );
  }

  private getEffectiveRoleKeys(user: UserWithAccess) {
    const directRoles = user.userRoles
      .map((userRole) => userRole.role)
      .filter((role) => role.isActive);
    const teamRoles = user.teamMemberships.flatMap((membership) =>
      membership.team.teamRoles
        .map((teamRole) => teamRole.role)
        .filter((role) => role.isActive),
    );

    return Array.from(
      new Set([...directRoles, ...teamRoles].map((role) => role.key)),
    );
  }

  private async resolveLoginTenant(dto: LoginDto) {
    if (dto.tenantId?.trim()) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId.trim() },
        select: {
          id: true,
          slug: true,
          status: true,
        },
      });

      if (!tenant) {
        throw this.authUnauthorized(
          'AUTH_TENANT_NOT_FOUND',
          'Tenant was not found.',
        );
      }

      this.assertLoginTenantIsActive(tenant);
      return tenant;
    }

    if (
      !dto.tenantSlug?.trim() &&
      !dto.tenantCode?.trim() &&
      !dto.domain?.trim() &&
      !dto.host?.trim()
    ) {
      throw this.authUnauthorized(
        'AUTH_TENANT_REQUIRED',
        'Company or tenant context is required to sign in.',
      );
    }

    try {
      const resolved = await this.publicTenantsService.resolve({
        slug: dto.tenantSlug,
        tenantCode: dto.tenantCode,
        domain: dto.domain,
        host: dto.host,
      });

      return {
        id: resolved.tenant.id,
        slug: resolved.tenant.slug,
        tenantCode: resolved.tenant.tenantCode,
        status: resolved.tenant.status,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw this.authUnauthorized(
          'AUTH_TENANT_INACTIVE',
          'This tenant is not active.',
        );
      }

      throw this.authUnauthorized(
        'AUTH_TENANT_NOT_FOUND',
        'Tenant was not found.',
      );
    }
  }

  private assertLoginTenantIsActive(tenant: {
    status: string;
    slug?: string | null;
    tenantCode?: string | null;
  }) {
    if (String(tenant.status).toUpperCase() === 'ACTIVE') {
      return;
    }

    throw this.authUnauthorized(
      'AUTH_TENANT_INACTIVE',
      'This tenant is not active.',
    );
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
    const allowMultipleSessions =
      await this.allowsMultipleActiveSessions(tenantId);

    if (!allowMultipleSessions) {
      await this.prisma.refreshToken.updateMany({
        where: {
          tenantId,
          userId,
          appClientId: clientId,
          revokedAt: null,
          expiresAt: { gt: new Date(now) },
        },
        data: {
          revokedAt: new Date(now),
          lastUsedAt: new Date(now),
        },
      });
    }

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

  private async allowsMultipleActiveSessions(tenantId: string) {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: {
        tenantId_category_key: {
          tenantId,
          category: 'security',
          key: 'allowMultipleActiveSessions',
        },
      },
      select: { value: true },
    });

    return setting?.value === true;
  }

  private async logTenantAuthEvent(input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityId: string;
    email?: string | null;
    result: 'SUCCESS' | 'FAILED';
    failureReason?: string | null;
    clientId: AuthClientId;
    sessionId?: string | null;
    req?: Request;
  }) {
    try {
      const requestInfo = getAuthRequestInfo(input.req);
      await this.auditService.log({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: 'AUTH_LOGIN',
        entityId: input.entityId,
        sourceModule: 'auth',
        afterSnapshot: {
          email: input.email ?? null,
          result: input.result,
          failureReason: input.failureReason ?? null,
          appClientId: input.clientId,
          sessionId: input.sessionId ?? null,
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent,
          mfaResult: 'NOT_REQUIRED',
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.audit.failed',
          action: input.action,
          tenantId: input.tenantId,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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
        const authPolicy = await this.resolveTenantAuthPolicy(tenantId);
        this.assertSessionNotExpired(
          tokenRecord,
          clientId,
          authPolicy.idleTimeoutMinutes * 60_000,
        );
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

  private async refreshPlatformSession(
    payload: AuthTokenPayload,
    refreshToken: string,
    req: Request | undefined,
    clientId: AuthClientId,
  ) {
    const user = await this.prisma.platformUser.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw this.authUnauthorized(
        'SESSION_EXPIRED',
        'Unable to refresh this admin session.',
      );
    }

    const refreshTokenMatches = await this.hasActivePlatformRefreshToken(
      user.id,
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
    const authResponse = this.buildPlatformAuthResponse(user, false, {
      clientId,
      sessionId: payload.sessionId,
      refreshTokenOverride: rotateRefresh ? undefined : refreshToken,
    });

    if (rotateRefresh) {
      await this.rotatePlatformRefreshToken(
        user.id,
        payload.sessionId,
        clientId,
        refreshToken,
        authResponse.tokens.refreshToken,
        authResponse.tokens.refreshTokenExpiresIn,
        req,
      );
    } else {
      await this.touchPlatformRefreshSession(
        user.id,
        payload.sessionId,
        clientId,
      );
    }

    return authResponse;
  }

  private async persistPlatformRefreshToken(
    platformUserId: string,
    sessionId: string,
    clientId: AuthClientId,
    refreshToken: string,
    refreshTokenTtl: string,
    req?: Request,
    absoluteExpiresAt?: Date | null,
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const now = Date.now();

    await this.prisma.platformRefreshToken.create({
      data: {
        platformUserId,
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

  private async hasActivePlatformRefreshToken(
    platformUserId: string,
    sessionId: string,
    clientId: AuthClientId,
    refreshToken: string,
  ) {
    const activeTokens = await this.prisma.platformRefreshToken.findMany({
      where: {
        platformUserId,
        sessionId,
        appClientId: clientId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
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

  private async rotatePlatformRefreshToken(
    platformUserId: string,
    sessionId: string,
    clientId: AuthClientId,
    previousRefreshToken: string,
    nextRefreshToken: string,
    nextRefreshTokenTtl: string,
    req?: Request,
  ) {
    const activeTokens = await this.prisma.platformRefreshToken.findMany({
      where: {
        platformUserId,
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
        await this.prisma.platformRefreshToken.update({
          where: { id: tokenRecord.id },
          data: { revokedAt: new Date(), lastUsedAt: new Date() },
        });
      }
    }

    await this.persistPlatformRefreshToken(
      platformUserId,
      sessionId,
      clientId,
      nextRefreshToken,
      nextRefreshTokenTtl,
      req,
      absoluteExpiresAt,
    );
  }

  private async touchPlatformRefreshSession(
    platformUserId: string,
    sessionId: string,
    clientId: AuthClientId,
  ) {
    await this.prisma.platformRefreshToken.updateMany({
      where: {
        platformUserId,
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

  private async buildAuthResponse(
    user: UserWithAccess,
    rememberMe = false,
    options: {
      clientId?: AuthClientId;
      sessionId?: string;
      refreshTokenOverride?: string;
    } = {},
  ) {
    const clientId = options.clientId ?? 'web';
    const authPolicy = await this.resolveTenantAuthPolicy(user.tenantId);
    rememberMe = rememberMe && authPolicy.allowRememberMe;
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
      rememberMe,
    };

    const accessTokenTtl = `${authPolicy.sessionTimeoutMinutes}m`;

    const refreshTokenTtl = rememberMe
      ? `${authPolicy.refreshTokenExpiryDays}d`
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
          rememberMe,
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
        rememberMe,
        absoluteSessionLifetimeDays: authPolicy.absoluteSessionLifetimeDays,
        idleTimeoutMinutes: authPolicy.idleTimeoutMinutes,
      },
    };
  }

  private async resolveTenantAuthPolicy(tenantId: string) {
    const rows = await this.prisma.tenantSetting.findMany({
      where: {
        tenantId,
        category: 'security',
        key: {
          in: [
            'allowRememberMe',
            'sessionTimeoutMinutes',
            'refreshTokenExpiryDays',
            'absoluteSessionLifetimeDays',
            'idleTimeoutMinutes',
          ],
        },
      },
      select: { key: true, value: true },
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return {
      allowRememberMe: readBooleanSetting(values.get('allowRememberMe'), true),
      sessionTimeoutMinutes: readNumberSetting(
        values.get('sessionTimeoutMinutes'),
        480,
        15,
        1440,
      ),
      refreshTokenExpiryDays: readNumberSetting(
        values.get('refreshTokenExpiryDays'),
        30,
        1,
        365,
      ),
      absoluteSessionLifetimeDays: readNumberSetting(
        values.get('absoluteSessionLifetimeDays'),
        30,
        1,
        365,
      ),
      idleTimeoutMinutes: readNumberSetting(
        values.get('idleTimeoutMinutes'),
        480,
        15,
        1440,
      ),
    };
  }

  private buildPlatformAuthResponse(
    user: PlatformUser,
    rememberMe = false,
    options: {
      clientId?: AuthClientId;
      sessionId?: string;
      refreshTokenOverride?: string;
    } = {},
  ) {
    const clientId = options.clientId ?? 'admin';
    const sessionId = options.sessionId ?? randomUUID();
    const tokenVersion = 0;

    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      tenantId: 'platform',
      email: user.email,
      sessionId,
      tokenVersion,
      type: 'access',
      tokenUse: 'access',
      appClientId: clientId,
      aud: clientId,
      authSubjectType: 'platform-user',
      platformRole: user.role,
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
          tenantId: 'platform',
          sessionId,
          tokenVersion,
          type: 'refresh',
          tokenUse: 'refresh',
          appClientId: clientId,
          aud: clientId,
          authSubjectType: 'platform-user',
          platformRole: user.role,
        } satisfies AuthTokenPayload,
        {
          secret: getClientRefreshTokenSecret(this.configService, clientId),
          expiresIn: refreshTokenTtl as StringValue,
        },
      );

    const platformAccess = platformAccessForRole(user.role);
    return {
      tenant: {
        id: 'platform',
        name: 'DijiPeople Platform',
        slug: 'platform',
        status: 'ACTIVE',
      },
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        roleIds: [user.role],
        roleKeys: platformAccess.roleKeys,
        permissionKeys: platformAccess.permissionKeys,
      },
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
    idleTimeoutMs = getClientIdleTimeoutMs(this.configService, clientId),
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
    if (lastActivityAt && now - lastActivityAt > idleTimeoutMs) {
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

function readBooleanSetting(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumberSetting(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(numeric)))
    : fallback;
}

function toCookieLog(options: {
  maxAge?: number;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  secure?: boolean;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
}) {
  return {
    maxAge: options.maxAge,
    sameSite: options.sameSite,
    secure: options.secure,
    httpOnly: options.httpOnly,
    path: options.path,
    domainPresent: Boolean(options.domain),
  };
}

function getAuthRequestInfo(req?: Request) {
  const forwardedFor = req?.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || req?.ip || null;
  const userAgentHeader = req?.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader[0]
    : userAgentHeader || null;

  return {
    ipAddress,
    userAgent: userAgent?.slice(0, 500) ?? null,
  };
}
