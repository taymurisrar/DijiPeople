import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { getAccessTokenSecret } from '../config/auth.config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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
    const token = this.extractTokenFromHeader(request);

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

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: {
            select: {
              status: true,
            },
          },
        },
      });

      const tenantStatus = user?.tenant?.status
        ? String(user.tenant.status).toUpperCase()
        : null;

      if (
        !user ||
        user.tenantId !== payload.tenantId ||
        user.status !== 'ACTIVE' ||
        !user.tenant ||
        !['ACTIVE', 'ONBOARDING'].includes(tenantStatus ?? '')
      ) {
        throw new UnauthorizedException('This account is not active.');
      }

      request.user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        tenantName: payload.tenantName,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        roleKeys: payload.roleKeys ?? [],
        permissionKeys: payload.permissionKeys ?? [],
        roleIds: payload.roleIds ?? [],
      };

      return true;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }

  private extractTokenFromHeader(request: AuthenticatedRequest) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
