import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { getAccessTokenSecret } from '../config/auth.config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthAccessService } from '../../modules/auth/auth-access.service';
import {
  AuthenticatedRequest,
  AuthTokenPayload,
} from '../interfaces/authenticated-request.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authAccessService: AuthAccessService,
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
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Access token is required.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        token,
        {
          secret: getAccessTokenSecret(this.configService),
        },
      );

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Access token is invalid.');
      }

      const { authUser } = await this.authAccessService.loadAccessContext(
        payload.sub,
        payload.tenantId,
      );
      if (authUser.email !== payload.email) {
        throw new UnauthorizedException('Access token is invalid.');
      }

      request.user = authUser;

      return true;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }

  private extractToken(request: AuthenticatedRequest) {
    const bearerToken = this.extractTokenFromHeader(request);

    if (bearerToken) {
      return bearerToken;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.dp_access_token;
  }

  private extractTokenFromHeader(request: AuthenticatedRequest) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
