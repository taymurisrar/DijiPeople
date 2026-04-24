import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import type { StringValue } from 'ms';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import {
  getAccessTokenSecret,
  getAccessTokenTtl,
  getRefreshTokenSecret,
  getRefreshTokenTtl,
  parseDurationToMilliseconds,
} from '../../common/config/auth.config';
import {
  AuthTokenPayload,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { PermissionBootstrapService } from '../permissions/permission-bootstrap.service';
import { UserInvitationsService } from './user-invitations.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const ACCESS_TOKEN_COOKIE = 'dp_access_token';
const REFRESH_TOKEN_COOKIE = 'dp_refresh_token';

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
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly permissionBootstrapService: PermissionBootstrapService,
    private readonly userInvitationsService: UserInvitationsService,
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

  async login(dto: LoginDto) {
    const user = await this.validateCredentials(dto);

    if (user.status !== 'ACTIVE' || user.tenant.status !== 'ACTIVE') {
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
    );

    await Promise.all([
      this.persistRefreshToken(
        refreshedUser.id,
        refreshedUser.tenantId,
        authResponse.tokens.refreshToken,
        authResponse.tokens.refreshTokenExpiresIn,
      ),
      this.usersService.markLastLogin(refreshedUser.id),
    ]);

    return authResponse;
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findByIdWithAccess(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Unable to refresh this session.');
    }

    if (user.status !== 'ACTIVE' || user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is not active.');
    }

    await this.permissionBootstrapService.bootstrapTenantRbac(user.tenantId);
    const refreshedUser = await this.usersService.findByIdWithAccess(user.id);

    if (!refreshedUser) {
      throw new UnauthorizedException('Unable to refresh this session.');
    }

    const refreshTokenMatches = await this.hasActiveRefreshToken(
      refreshedUser.id,
      refreshToken,
    );

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    const authResponse = this.buildAuthResponse(refreshedUser);

    await this.rotateRefreshToken(
      refreshedUser.id,
      refreshedUser.tenantId,
      refreshToken,
      authResponse.tokens.refreshToken,
      authResponse.tokens.refreshTokenExpiresIn,
    );

    return authResponse;
  }

  async getProfile(currentUser: AuthenticatedUser) {
    const tenant = await this.tenantsService.findById(currentUser.tenantId);

    if (!tenant) {
      throw new BadRequestException('Tenant context is no longer valid.');
    }

    return {
      user: {
        userId: currentUser.userId,
        tenantId: currentUser.tenantId,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        isTenantOwner:
          tenant.ownerUserId === currentUser.userId,
        roleIds: currentUser.roleIds,
        roleKeys: currentUser.roleKeys,
        permissionKeys: currentUser.permissionKeys,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
    };
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
      accessTokenExpiresIn: string;
      refreshTokenExpiresIn: string;
    },
    rememberMe?: boolean,
  ) {
    const isProduction = this.isProduction();

    const accessMaxAge = rememberMe
      ? parseDurationToMilliseconds(tokens.accessTokenExpiresIn)
      : undefined;

    const refreshMaxAge = rememberMe
      ? parseDurationToMilliseconds(tokens.refreshTokenExpiresIn)
      : undefined;

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: accessMaxAge,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: refreshMaxAge,
    });
  }

  clearAuthCookies(res: Response) {
    const isProduction = this.isProduction();

    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });

    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private async validateCredentials(dto: LoginDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmailWithAccess(normalizedEmail);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return user;
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwtService.verifyAsync<
        AuthTokenPayload & { type: string }
      >(refreshToken, {
        secret: getRefreshTokenSecret(this.configService),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  private async persistRefreshToken(
    userId: string,
    tenantId: string,
    refreshToken: string,
    refreshTokenTtl: string,
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash,
        expiresAt: new Date(
          Date.now() + parseDurationToMilliseconds(refreshTokenTtl),
        ),
      },
    });
  }

  private async hasActiveRefreshToken(userId: string, refreshToken: string) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);

      if (matches) {
        return true;
      }
    }

    return false;
  }

  private async rotateRefreshToken(
    userId: string,
    tenantId: string,
    previousRefreshToken: string,
    nextRefreshToken: string,
    nextRefreshTokenTtl: string,
  ) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
      },
    });

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(
        previousRefreshToken,
        tokenRecord.tokenHash,
      );

      if (matches) {
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
      nextRefreshToken,
      nextRefreshTokenTtl,
    );
  }

  private buildAuthResponse(user: UserWithAccess, rememberMe = false) {
    const permissionKeys = Array.from(
      new Set([
        ...user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.key,
          ),
        ),
        ...user.userPermissions.map(
          (userPermission) => userPermission.permission.key,
        ),
      ]),
    );

    const roleIds = user.userRoles.map((userRole) => userRole.roleId);
    const roleKeys = user.userRoles.map((userRole) => userRole.role.key);
    const roles = user.userRoles.map((userRole) => ({
      id: userRole.role.id,
      key: userRole.role.key,
      name: userRole.role.name,
    }));

    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleIds,
      roleKeys,
      permissionKeys,
    };

    const accessTokenTtl = rememberMe
      ? this.configService.get<string>('JWT_ACCESS_TTL_REMEMBER_ME') || '30m'
      : getAccessTokenTtl(this.configService);

    const refreshTokenTtl = rememberMe
      ? this.configService.get<string>('JWT_REFRESH_TTL_REMEMBER_ME') || '30d'
      : getRefreshTokenTtl(this.configService);

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: getAccessTokenSecret(this.configService),
      expiresIn: accessTokenTtl as StringValue,
    });

    const refreshToken = this.jwtService.sign(
      {
        ...accessPayload,
        type: 'refresh',
      },
      {
        secret: getRefreshTokenSecret(this.configService),
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
      user: this.mapUserSummary(
        user,
        roleIds,
        roleKeys,
        roles,
        permissionKeys,
        user.tenant.ownerUserId === user.id,
      ),
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresIn: accessTokenTtl,
        refreshTokenExpiresIn: refreshTokenTtl,
      },
    };
  }

  private mapUserSummary(
    user: User,
    roleIds: string[],
    roleKeys: string[],
    roles: Array<{ id: string; key: string; name: string }>,
    permissionKeys: string[],
    isTenantOwner = false,
  ) {
    return {
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
      availablePermissionKeys: FOUNDATION_PERMISSION_DEFINITIONS.map(
        (permission) => permission.key,
      ),
    };
  }
}
