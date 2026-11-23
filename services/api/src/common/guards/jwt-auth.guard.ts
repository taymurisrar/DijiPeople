import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError, JsonWebTokenError } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  getAuthClientIdFromHeaders,
  getClientAccessTokenSecret,
  getClientIdleTimeoutMs,
  getAuthCookieNames,
  isSlidingSessionEnabled,
  normalizeAuthClientId,
  type AuthClientId,
} from '../config/auth.config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthAccessService } from '../../modules/auth/auth-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAuthPolicyService } from '../security/tenant-auth-policy.service';
import {
  AuthenticatedRequest,
  AuthTokenPayload,
} from '../interfaces/authenticated-request.interface';
import { TimesheetRestrictionMode } from '@prisma/client';
import {
  isRouteAllowedUnderTimesheetRestriction,
  timesheetRestrictionAllowedRoutesForClient,
} from './timesheet-restriction-routes';
import { toErrorMessage } from '../utils/display-string';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authAccessService: AuthAccessService,
    private readonly prisma: PrismaService,
    private readonly tenantAuthPolicyService: TenantAuthPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const clientId = getAuthClientIdFromHeaders(request.headers);
    const token = this.extractToken(request, clientId);

    if (!token) {
      this.logger.warn(
        `Unauthorized request: access token missing. Path=${request.url}, Method=${request.method}`,
      );

      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Access token is required.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        token,
        {
          secret: getClientAccessTokenSecret(this.configService, clientId),
        },
      );

      if (payload.tokenUse !== 'access' && payload.type !== 'access') {
        this.logger.warn(
          `Invalid token type. Expected=access, Received=${payload.type}, UserId=${payload.sub}, TenantId=${payload.tenantId}`,
        );

        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid.',
        });
      }

      if (
        normalizeAuthClientId(payload.appClientId) !== clientId ||
        normalizeAuthClientId(String(payload.aud ?? '')) !== clientId
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Access token is not valid for this application.',
        });
      }

      await this.assertSessionIsActive(payload, clientId);

      const { authUser } =
        clientId === 'admin' && payload.authSubjectType === 'platform-user'
          ? await this.authAccessService.loadPlatformAccessContext(payload.sub)
          : await this.authAccessService.loadAccessContext(
              payload.sub,
              payload.tenantId,
              { includeEmployee: false },
            );

      if (!authUser) {
        this.logger.warn(
          `Access context not found. UserId=${payload.sub}, TenantId=${payload.tenantId}`,
        );

        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid.',
        });
      }

      if (authUser.email !== payload.email) {
        this.logger.warn(
          `Token email mismatch. TokenEmail=${payload.email}, CurrentEmail=${authUser.email}, UserId=${payload.sub}, TenantId=${payload.tenantId}`,
        );

        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid.',
        });
      }

      request.user = authUser;
      request.user.sessionId = payload.sessionId;
      request.user.appClientId = payload.appClientId;

      await this.assertTimesheetRestrictionAllowsRequest(request);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // BUG-4518: a deliberate refusal (the timesheet restriction's 403) is an
      // answer, not a token failure. Falling through to the generic branch
      // below rewrote it into 401 INVALID_TOKEN, which a client reads as
      // "session expired" and answers with a pointless refresh-and-retry.
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof TokenExpiredError) {
        this.logger.warn(
          `Access token expired. Path=${request.url}, Method=${request.method}`,
        );

        throw new UnauthorizedException({
          code: 'ACCESS_TOKEN_EXPIRED',
          message: 'Access token has expired.',
        });
      }

      if (error instanceof JsonWebTokenError) {
        this.logger.warn(
          `Invalid JWT. Reason=${error.message}, Path=${request.url}, Method=${request.method}`,
        );

        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid.',
        });
      }

      if (isDatabaseUnavailableError(error)) {
        this.logger.error(
          `Authentication database check failed. Path=${request.url}, Method=${request.method}`,
          error instanceof Error ? error.stack : String(error),
        );

        throw new ServiceUnavailableException({
          code: 'DATABASE_CONNECTION_FAILED',
          message: 'Database is currently unavailable.',
          description:
            'The database is recovering or not accepting connections. Please try again shortly.',
        });
      }

      this.logger.error(
        `Unexpected auth guard error. Path=${request.url}, Method=${request.method}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Access token could not be verified.',
      });
    }
  }

  private async assertTimesheetRestrictionAllowsRequest(
    request: AuthenticatedRequest,
  ) {
    if (
      request.user.platform ||
      request.user.roleKeys.includes('system-scheduler')
    )
      return;
    // One query, not two: the restriction is found through its employee
    // relation instead of resolving the employee id first. The overwhelmingly
    // common case — an employee with no active restriction — used to cost two
    // round trips on every authenticated request and now costs one. Nothing is
    // cached, so a restriction added or lifted still applies to the very next
    // request. Same predicates as before: the employee must be this tenant's,
    // this user's and not deleted, and the restriction must be this tenant's.
    const restriction = await this.prisma.timesheetAccessRestriction.findFirst({
      where: {
        tenantId: request.user.tenantId,
        employee: {
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          isDeleted: false,
        },
        isActive: true,
        overriddenAt: null,
        OR: [{ expiryAt: null }, { expiryAt: { gt: new Date() } }],
      },
      orderBy: { startAt: 'desc' },
    });
    if (
      !restriction ||
      restriction.restrictionMode === TimesheetRestrictionMode.WARNING_ONLY
    )
      return;
    // BUG-3164: matched against the path as served, `/api` prefix included.
    const path = request.path || request.url.split('?')[0] || '/';
    if (isRouteAllowedUnderTimesheetRestriction(path)) return;
    if (
      restriction.restrictionMode === TimesheetRestrictionMode.LIMITED_ACCESS &&
      request.method.toUpperCase() === 'GET'
    )
      return;
    // `details` is the one place the exception filter passes structured data
    // through to the client; top-level extras are dropped by it.
    throw new ForbiddenException({
      code: 'TIMESHEET_ACCESS_RESTRICTED',
      message: restriction.reason,
      details: {
        restrictionMode: restriction.restrictionMode,
        restrictionId: restriction.id,
        allowedRoutes: timesheetRestrictionAllowedRoutesForClient(),
      },
    });
  }

  private extractToken(request: AuthenticatedRequest, clientId: AuthClientId) {
    const bearerToken = this.extractTokenFromHeader(request);

    if (bearerToken) {
      return bearerToken;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[getAuthCookieNames(this.configService, clientId).access];
  }

  private extractTokenFromHeader(request: AuthenticatedRequest) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async assertSessionIsActive(
    payload: AuthTokenPayload,
    clientId: AuthClientId,
  ) {
    if (payload.tokenUse !== 'access' && payload.type !== 'access') {
      return;
    }

    if (clientId === 'agent-desktop') {
      await this.assertAgentSessionIsActive(payload);
      return;
    }

    const tokenRecord =
      clientId === 'admin' && payload.authSubjectType === 'platform-user'
        ? await this.prisma.platformRefreshToken.findFirst({
            where: {
              sessionId: payload.sessionId,
              platformUserId: payload.sub,
              appClientId: clientId,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              absoluteExpiresAt: true,
              lastActivityAt: true,
            },
          })
        : await this.prisma.refreshToken.findFirst({
            where: {
              sessionId: payload.sessionId,
              userId: payload.sub,
              tenantId: payload.tenantId,
              appClientId: clientId,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              absoluteExpiresAt: true,
              lastActivityAt: true,
            },
          });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session is no longer active.',
      });
    }

    const now = Date.now();
    if (
      tokenRecord.absoluteExpiresAt &&
      tokenRecord.absoluteExpiresAt.getTime() <= now
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session has expired.',
      });
    }

    if (
      isSlidingSessionEnabled(this.configService) &&
      tokenRecord.lastActivityAt &&
      now - tokenRecord.lastActivityAt.getTime() >
        (await this.resolveIdleTimeoutMs(payload, clientId))
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session expired due to inactivity.',
      });
    }
  }

  /*
   * ITEM-0162 — this used to run its own tenant-setting lookup with its own
   * hardcoded fallback, independent of the one `AuthService.buildAuthResponse`
   * used to compute the `idleTimeoutMinutes` a login response advertises to
   * the client. The two disagreed in production (480 advertised, 30 enforced)
   * because they were, in every sense that mattered, two different policies
   * that happened to share a name. `TenantAuthPolicyService` is now the one
   * place either question is answered.
   */
  private async resolveIdleTimeoutMs(
    payload: AuthTokenPayload,
    clientId: AuthClientId,
  ) {
    const fallback = getClientIdleTimeoutMs(this.configService, clientId);
    if (
      clientId !== 'web' ||
      payload.authSubjectType === 'platform-user' ||
      !payload.tenantId
    ) {
      return fallback;
    }

    const policy = await this.tenantAuthPolicyService.resolveEffectivePolicy(
      payload.tenantId,
    );
    return policy.idleTimeoutMinutes * 60_000;
  }

  private async assertAgentSessionIsActive(payload: AuthTokenPayload) {
    const tokenRecord = await this.prisma.agentRefreshToken.findFirst({
      where: {
        sessionId: payload.sessionId,
        userId: payload.sub,
        tenantId: payload.tenantId,
        ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        absoluteExpiresAt: true,
        lastActivityAt: true,
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session is no longer active.',
      });
    }

    const now = Date.now();
    if (
      tokenRecord.absoluteExpiresAt &&
      tokenRecord.absoluteExpiresAt.getTime() <= now
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session has expired.',
      });
    }

    if (
      isSlidingSessionEnabled(this.configService) &&
      tokenRecord.lastActivityAt &&
      now - tokenRecord.lastActivityAt.getTime() >
        getClientIdleTimeoutMs(this.configService, 'agent-desktop')
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session expired due to inactivity.',
      });
    }
  }
}

function isDatabaseUnavailableError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  // `String(error)` on a thrown non-Error gives '[object Object]', which is
  // exactly the case a driver throws and exactly where the message is the
  // only thing left to read. ITEM-0042.
  const message = toErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  return (
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1017' ||
    code === 'ECONNREFUSED' ||
    lowerMessage.includes('connection terminated') ||
    lowerMessage.includes('server has closed the connection') ||
    lowerMessage.includes('database system is in recovery mode') ||
    lowerMessage.includes('database system is not yet accepting connections')
  );
}
