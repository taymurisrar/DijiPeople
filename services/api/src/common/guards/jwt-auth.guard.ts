import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
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
import {
  AuthenticatedRequest,
  AuthTokenPayload,
} from '../interfaces/authenticated-request.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authAccessService: AuthAccessService,
    private readonly prisma: PrismaService,
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

      const { authUser } = await this.authAccessService.loadAccessContext(
        payload.sub,
        payload.tenantId,
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

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
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

    const tokenRecord = await this.prisma.refreshToken.findFirst({
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
        getClientIdleTimeoutMs(this.configService, clientId)
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session expired due to inactivity.',
      });
    }
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
