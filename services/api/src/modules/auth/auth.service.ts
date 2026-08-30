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
import { createHash, randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
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
import {
  listTenantIdsForIdentity,
  mirrorPasswordToIdentity,
  registerIdentityFailure,
  registerIdentitySuccess,
  resolveLoginCredential,
  verifyIdentityCredential,
} from '../users/identity.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { TenantsService } from '../tenants/tenants.service';
import { PublicTenantsService } from '../tenants/public-tenants.service';
import { UsersService } from '../users/users.service';
import { PermissionBootstrapService } from '../permissions/permission-bootstrap.service';
import { UserInvitationsService } from './user-invitations.service';
import { EmailService } from '../notifications/email/email.service';
import { AuditService } from '../audit/audit.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { DiscoverWorkspacesDto } from './dto/discover-workspaces.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthAccessService } from './auth-access.service';
import { LoginLockoutService } from './login-lockout.service';
import { PasswordPolicyService } from './password-policy.service';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PlatformCommunicationsService } from '../platform-communications/platform-communications.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';
import { buildDirectPermissionPrivileges } from './direct-permission-privileges';

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
    private readonly platformCommunications: PlatformCommunicationsService,
    private readonly auditService: AuditService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly tenantDomains: TenantDomainService,
  ) {}

  /**
   * A password-reset link that lands back in the workspace the user came from.
   *
   * The workspace hostname is resolved from the subject's own tenant, so the
   * link cannot be pointed at a different workspace by anything in the request.
   * If the domain service cannot answer, the configured base URL is used rather
   * than failing the reset.
   */
  private async buildWorkspaceResetUrl(
    tenantId: string,
    tenantSlug: string,
    resetToken: string,
  ) {
    try {
      const workspaceUrl = await this.tenantDomains.getWorkspaceUrl(
        tenantId,
        '/reset-password',
      );
      const url = new URL(workspaceUrl);
      url.searchParams.set('token', resetToken);
      return url.toString();
    } catch {
      const baseUrl =
        this.configService.get<string>('PASSWORD_RESET_LINK_BASE_URL') ??
        `${getAppOrigin('web', process.env)}/reset-password`;
      return `${baseUrl}?tenant=${encodeURIComponent(tenantSlug)}&token=${encodeURIComponent(resetToken)}`;
    }
  }

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

  /**
   * Sign in without naming a workspace.
   *
   * The brief's opening case: somebody clicks **Login** on `www.dijipeople.com`
   * with no tenant URL in hand. Before TASK-0009 this was impossible —
   * `resolveLoginTenant` refuses with `AUTH_TENANT_REQUIRED`, and `User` was
   * one row per tenant with its own password.
   *
   * **No token is issued here.** The credential is verified against the
   * identity and the workspaces it reaches are returned; the caller then signs
   * in normally against the workspace they picked. That keeps the JWT
   * tenant-scoped, which is the property the whole parent is built on:
   * `JwtAuthGuard` and every service reading `user.tenantId` are untouched.
   *
   * Every failure returns the same shape. A caller cannot tell an unknown
   * address from a wrong password from a suspended identity — the alternative
   * is a login form that doubles as an address validator.
   */
  async discoverWorkspaces(dto: DiscoverWorkspacesDto) {
    const verified = await verifyIdentityCredential(
      this.prisma,
      bcrypt.compare,
      dto.email,
      dto.password,
    );

    if (!verified) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.discover.failed',
          identifier: normalizeEmail(dto.email),
        }),
      );
      throw this.authUnauthorized(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    const tenantIds = await listTenantIdsForIdentity(
      this.prisma,
      verified.identityId,
    );

    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        status: true,
      },
    });

    /*
     * Only workspaces that can actually be signed into. A suspended or
     * half-provisioned tenant in this list is a door that refuses them, and
     * they have no way to tell whether the fault is theirs.
     */
    const workspaces = tenants
      .filter((tenant) => String(tenant.status).toUpperCase() === 'ACTIVE')
      .map((tenant) => ({
        tenantId: tenant.id,
        name: tenant.displayName || tenant.name,
        slug: tenant.slug,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      /*
       * Someone whose credentials are right but who has no usable workspace
       * gets an empty list rather than an error. It is a real state — every
       * workspace suspended, or an identity created before provisioning
       * finished — and the screen can say so honestly.
       */
      workspaces,
    };
  }

  async login(dto: LoginDto, req?: Request) {
    const clientId = this.getClientId(req);
    const user = await this.validateCredentials(dto, req, clientId);
    const tenantStatus = String(user.tenant.status).toUpperCase();

    if (user.status !== 'ACTIVE' || tenantStatus !== 'ACTIVE') {
      /*
       * A suspended workspace is a deliberate platform decision, not a broken
       * credential. Telling its administrator "this account is not active" sends
       * them to reset a password that is fine; naming the suspension sends them
       * to the person who can lift it. The distinction is only ever drawn for a
       * caller who already proved they hold valid credentials — an unauthenticated
       * probe still gets the generic failure from `validateCredentials`.
       */
      const tenantSuspended =
        user.status === 'ACTIVE' &&
        ['SUSPENDED', 'DECOMMISSIONING', 'DECOMMISSIONED'].includes(
          tenantStatus,
        );
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: tenantSuspended
          ? 'TENANT_SUSPENDED'
          : 'ACCOUNT_OR_TENANT_INACTIVE',
        clientId,
        req,
      });
      throw new UnauthorizedException(
        tenantSuspended
          ? 'This workspace has been suspended by DijiPeople. Contact DijiPeople support to restore access.'
          : 'This account is not active.',
      );
    }

    /*
     * An expired password stops here rather than being allowed through with a
     * "change it soon" flag: issuing tokens would leave a working session on a
     * credential the tenant has decided is too old. The distinct code lets the
     * sign-in screen send the user to the reset flow instead of showing them a
     * generic failure they cannot act on.
     */
    if (
      await this.passwordPolicyService.isPasswordExpired(
        user.tenantId,
        user.passwordChangedAt,
      )
    ) {
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: 'PASSWORD_EXPIRED',
        clientId,
        req,
      });
      throw this.authUnauthorized(
        'AUTH_PASSWORD_EXPIRED',
        'Your password has expired. Reset it to sign in again.',
      );
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
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
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

  async requestAdminPasswordReset(dto: ForgotPasswordDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.platformUser.findUnique({
      where: { email },
    });
    const response = {
      ok: true,
      message:
        'If an active admin account exists for this email, a password reset link will be sent.',
    };

    if (!user || user.status !== 'ACTIVE') return response;

    const passwordVersion = createHash('sha256')
      .update(user.passwordHash)
      .digest('hex');
    const resetToken = this.jwtService.sign(
      {
        sub: user.id,
        type: 'admin-password-reset',
        authSubjectType: 'platform-user',
        passwordVersion,
      },
      {
        secret: getClientAccessTokenSecret(this.configService, 'admin'),
        expiresIn: '1h',
      },
    );
    const resetUrl = `${getAppOrigin('admin', process.env)}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const displayName =
      `${user.firstName} ${user.lastName}`.trim() || 'Administrator';

    await this.platformCommunications.sendEmail({
      eventCode: 'ADMIN_PASSWORD_RESET',
      recipient: email,
      subject: 'Reset your DijiPeople Platform Admin password',
      html: `<p>Hello ${displayName},</p><p>We received a request to reset your DijiPeople Platform Admin password.</p><p><a href="${resetUrl}">Reset admin password</a></p><p>This secure link expires in one hour and can only be used once.</p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Hello ${displayName},\n\nReset your DijiPeople Platform Admin password: ${resetUrl}\n\nThis secure link expires in one hour and can only be used once.`,
      entityType: 'PlatformUser',
      entityId: user.id,
      requestedById: user.id,
      metadata: { source: 'admin-forgot-password', expiresIn: '1 hour' },
      idempotencyKey: `admin-password-reset:${user.id}:${passwordVersion}:${Math.floor(Date.now() / 60_000)}`,
    });

    return response;
  }

  async resetAdminPassword(token: string, password: string) {
    let payload: {
      sub?: string;
      type?: string;
      authSubjectType?: string;
      passwordVersion?: string;
    };
    try {
      payload = this.jwtService.verify(token, {
        secret: getClientAccessTokenSecret(this.configService, 'admin'),
      });
    } catch {
      throw new UnauthorizedException(
        'This admin password reset link is invalid or expired.',
      );
    }

    if (
      payload.type !== 'admin-password-reset' ||
      payload.authSubjectType !== 'platform-user' ||
      !payload.sub ||
      !payload.passwordVersion
    ) {
      throw new UnauthorizedException(
        'This admin password reset link is invalid or expired.',
      );
    }

    const user = await this.prisma.platformUser.findUnique({
      where: { id: payload.sub },
    });
    const currentVersion = user
      ? createHash('sha256').update(user.passwordHash).digest('hex')
      : '';
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      currentVersion !== payload.passwordVersion
    ) {
      throw new UnauthorizedException(
        'This admin password reset link is invalid or has already been used.',
      );
    }

    await this.passwordPolicyService.assertPasswordMeetsPolicy(
      'platform',
      password,
    );
    if (await bcrypt.compare(password, user.passwordHash)) {
      throw new ForbiddenException(
        'Choose a password that is different from your current password.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id: user.id },
        data: { passwordHash, updatedById: user.id },
      }),
      this.prisma.platformRefreshToken.updateMany({
        where: { platformUserId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), updatedById: user.id },
      }),
    ]);

    return {
      ok: true,
      message: 'Your admin password has been reset. You can now sign in.',
    };
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
        /*
         * BUG-2547. `/auth/me` is `@Public()` so that a signed-out visitor gets an
         * answer rather than a guard rejection, which means it never passes
         * through `JwtAuthGuard` — and so it was never asking the question the
         * guard asks straight after verifying a signature: is this session still
         * live?
         *
         * Verified on production at `fba846d1`: after signing out,
         * `GET /employees` correctly returned `401 SESSION_REVOKED` while
         * `GET /auth/me` returned `200` with the caller's identity, roles and
         * permission keys — and would have gone on doing so for the remaining
         * 7.98 hours of an eight-hour access token. Revocation worked everywhere
         * the guard ran. This endpoint was simply not asking.
         *
         * Throwing here falls into the catch below and on into the refresh path,
         * which is the existing answer for an access token that cannot be used:
         * it clears the cookies and reports an expired session, which is exactly
         * what a revoked session should look like to a client.
         */
        if (!(await this.isSessionStillLive(payload, clientId))) {
          throw new UnauthorizedException({
            code: 'SESSION_REVOKED',
            message: 'Session is no longer active.',
          });
        }
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
    /*
     * A user who entered through their workspace hostname is sent back to it.
     * The tenant comes from the reset subject's own record, never from the
     * request, so the link cannot be steered at another workspace.
     */
    const resetUrl = await this.buildWorkspaceResetUrl(
      user.tenant.id,
      user.tenant.slug,
      resetToken,
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const recipientName = `${user.firstName} ${user.lastName}`.trim() || email;

    await this.emailService.sendTemplateEmail({
      tenantId: user.tenantId,
      subjectUserId: user.id,
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

    await this.passwordPolicyService.assertPasswordMeetsPolicy(
      payload.tenantId,
      password,
    );
    await this.passwordPolicyService.assertPasswordNotReused(
      payload.sub,
      payload.tenantId,
      password,
    );

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: payload.sub },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          status: 'ACTIVE',
          updatedById: payload.sub,
        },
      });
      /*
       * The identity carries the same credential. Inside the transaction, so a
       * reset cannot half-apply and leave the two copies disagreeing — which,
       * once login reads the identity, is a person locked out by a change they
       * made themselves and watched succeed.
       */
      await mirrorPasswordToIdentity(tx, payload.sub, passwordHash);
      await tx.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          tenantId: payload.tenantId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    });

    await this.passwordPolicyService.recordPasswordChange(
      payload.sub,
      payload.tenantId,
      passwordHash,
    );

    return { ok: true };
  }

  private async sendPasswordResetEmail(input: {
    user: {
      id: string;
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      tenant: { id: string; name: string; slug: string };
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
    const resetUrl = await this.buildWorkspaceResetUrl(
      input.user.tenant.id,
      input.user.tenant.slug,
      resetToken,
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const recipientName =
      `${input.user.firstName} ${input.user.lastName}`.trim() ||
      input.user.email;

    const delivery = await this.emailService.sendTemplateEmail({
      tenantId: input.user.tenantId,
      subjectUserId: input.user.id,
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
    const sessionId = this.extractTokenFromRequest(req, cookieNames.session);

    if (sessionId) {
      /*
       * BUG-0627. The refresh cookie is the shortest-lived of the three, so the
       * sign-out that follows a session-expired modal — the flow BUG-0009 was
       * raised about — usually arrives without it. Keying revocation on the
       * refresh token alone meant that sign-out cleared the browser and left the
       * session live server-side: the operator sees the login screen and
       * believes they are out, and the token stays valid until it expires on its
       * own.
       *
       * The session cookie outlives the refresh cookie and names the row
       * directly, which is why every client forwards it here. Revoking by it is
       * exact rather than broad: the filter is the single session, scoped to the
       * client it was issued for, so this cannot reach another operator's
       * session or another client's token for the same person.
       *
       * BUG-2506. This ran only when the refresh cookie was ABSENT, so the
       * ordinary sign-out — every cookie present — fell through to the hash scan
       * below instead. That scan takes the twenty most recently created live
       * tokens for the client across the whole deployment and bcrypt-compares
       * each one. On any tenant issuing more than twenty refresh tokens in the
       * life of a session, the signer-out's own token is simply not in the list:
       * the cookies were cleared, the screen said they were signed out, and the
       * refresh token stayed valid for its full lifetime — up to thirty days
       * with remember-me. Revoking by session id is exact and cheap, so it now
       * runs whenever the session is known, and the scan below is left as the
       * fallback for a client that sent no session cookie.
       */
      await this.revokeSessionTokens(clientId, sessionId);
    }

    // Fallback only: reached when no session cookie arrived, or alongside the
    // exact revocation above for a token issued before sessions were recorded.
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

  /**
   * Whether the session behind an access token is still open.
   *
   * Deliberately the same question `JwtAuthGuard` asks, and deliberately the
   * same shape of query: a live, unrevoked, unexpired token row for this
   * session, this subject and this client. Two places asking it differently is
   * how they came to disagree in the first place.
   *
   * `agent-desktop` is excluded because the guard does not use this check for it
   * either — it has its own device-session assertion, and answering for it here
   * would be a second opinion rather than the same one.
   */
  private async isSessionStillLive(
    payload: AuthTokenPayload,
    clientId: AuthClientId,
  ): Promise<boolean> {
    if (!payload.sessionId) {
      // Issued before sessions were recorded. Nothing to check, and refusing
      // would sign out every holder of an older token.
      return true;
    }

    if (clientId === 'agent-desktop') {
      return true;
    }

    const where = {
      sessionId: payload.sessionId,
      appClientId: clientId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };

    const record =
      clientId === 'admin' && payload.authSubjectType === 'platform-user'
        ? await this.prisma.platformRefreshToken.findFirst({
            where: { ...where, platformUserId: payload.sub },
            select: { id: true },
          })
        : await this.prisma.refreshToken.findFirst({
            where: {
              ...where,
              userId: payload.sub,
              tenantId: payload.tenantId,
            },
            select: { id: true },
          });

    return Boolean(record);
  }

  /**
   * Revoke every live token for one session of one client.
   *
   * `updateMany` rather than a read-then-write: the filter is already exact, and
   * a token rotated between the read and the write would otherwise survive the
   * sign-out. `revokedAt: null` in the filter keeps an already-closed session's
   * timestamp at the moment it was actually closed.
   */
  private async revokeSessionTokens(clientId: AuthClientId, sessionId: string) {
    const now = new Date();
    const where = { sessionId, appClientId: clientId, revokedAt: null };

    if (clientId === 'admin') {
      await this.prisma.platformRefreshToken.updateMany({
        where,
        data: { revokedAt: now, lastUsedAt: now },
      });
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where,
      data: { revokedAt: now, lastUsedAt: now },
    });
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
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
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

    /*
     * The credential now comes from the identity where one exists.
     *
     * `resolveLoginCredential` falls back to `User.passwordHash` for a row the
     * backfill has not reached — `identityId` is nullable until the contract
     * phase, and a migration that has not run must not lock anybody out. It
     * also refuses outright for a SUSPENDED identity, which is the platform-
     * level "this person may not sign in anywhere" that `User.status` cannot
     * express.
     */
    const credential = await resolveLoginCredential(this.prisma, user.id);

    if (!credential) {
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: 'IDENTITY_SUSPENDED',
        clientId,
        req,
      });
      // Same response as a wrong password — see the lockout case below.
      throw this.authUnauthorized(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    /*
     * Two locks, and both must pass. The tenant's own policy governs sign-ins
     * to that tenant and is unchanged; the global one exists so that naming a
     * tenant cannot be a way around a platform-level lock, and so a sign-in
     * that names no tenant can still be stopped once WP-06 lands.
     */
    const identityLocked = Boolean(
      credential.identityLockedUntil &&
      credential.identityLockedUntil.getTime() > Date.now(),
    );

    if (identityLocked || this.loginLockoutService.isLocked(user)) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth.login.failed',
          reason: 'ACCOUNT_LOCKED',
          identifier: normalizedEmail,
          tenantSlug: tenantContext.slug,
          userId: user.id,
          tenantId: user.tenantId,
        }),
      );
      await this.logTenantAuthEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        entityId: user.id,
        email: user.email,
        result: 'FAILED',
        failureReason: 'ACCOUNT_LOCKED',
        clientId,
        req,
      });
      /*
       * Deliberately the same response as a wrong password: naming the lock
       * confirms the account exists and tells an attacker they are close.
       */
      throw this.authUnauthorized(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      credential.passwordHash,
    );

    if (!isPasswordValid) {
      await this.loginLockoutService.registerFailure(user);
      if (credential.identityId) {
        await registerIdentityFailure(this.prisma, credential.identityId);
      }
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
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
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

    await this.loginLockoutService.registerSuccess(user);
    if (credential.identityId) {
      await registerIdentitySuccess(this.prisma, credential.identityId);
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
    const authResponse = this.buildPlatformAuthResponse(
      user,
      payload.rememberMe ?? false,
      {
        clientId,
        sessionId: payload.sessionId,
        refreshTokenOverride: rotateRefresh ? undefined : refreshToken,
      },
    );

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
      rememberMe,
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
          rememberMe,
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
        rememberMe,
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
      rolePrivileges: [
        ...effectiveRoles.flatMap((role) =>
          role.rolePrivileges.map((privilege) => ({
            entityKey: privilege.entityKey,
            privilege: privilege.privilege,
            accessLevel: privilege.accessLevel,
            roleId: role.id,
          })),
        ),
        ...buildDirectPermissionPrivileges(
          user.userPermissions.map(
            (userPermission) => userPermission.permission.key,
          ),
          effectiveRoles,
        ),
      ],
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
  const forwardedFor: string | string[] | undefined =
    req?.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || req?.ip || null;
  const userAgentHeader: string | string[] | undefined =
    req?.headers['user-agent'];
  let userAgent: string | null;
  if (Array.isArray(userAgentHeader)) {
    userAgent = (userAgentHeader[0] as string | undefined) ?? null;
  } else {
    userAgent = userAgentHeader || null;
  }

  return {
    ipAddress,
    userAgent: userAgent?.slice(0, 500) ?? null,
  };
}
