import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import {
  getAccessTokenSecret,
  getAccessTokenTtl,
  getRefreshTokenSecret,
  getRefreshTokenTtl,
  parseDurationToMilliseconds,
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

  async login(dto: LoginDto) {
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

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.usersService.findByIdWithAccess(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Unable to refresh this session.');
    }

    const tenantStatus = String(user.tenant.status).toUpperCase();

    if (user.status !== 'ACTIVE' || tenantStatus !== 'ACTIVE') {
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

  async getProfileFromRequest(req: Request, res: Response) {
    const accessToken = this.extractTokenFromRequest(req, ACCESS_TOKEN_COOKIE);
    const refreshToken = this.extractTokenFromRequest(
      req,
      REFRESH_TOKEN_COOKIE,
    );

    if (accessToken) {
      try {
        const payload = await this.verifyAccessToken(accessToken);
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
      this.clearAuthCookies(res);
      throw new UnauthorizedException(
        'Your session expired. Please sign in again to continue.',
      );
    }

    try {
      const refreshed = await this.refresh(refreshToken);
      this.setAuthCookies(res, refreshed.tokens);
      const { response } = await this.authAccessService.loadAccessContext(
        refreshed.user.userId,
        refreshed.tenant.id,
      );
      return response;
    } catch {
      this.clearAuthCookies(res);
      throw new UnauthorizedException(
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
      accessTokenExpiresIn: string;
      refreshTokenExpiresIn: string;
    },
    rememberMe?: boolean,
  ) {
    const isProduction = this.isProduction();
    const domain = this.getCookieDomain();

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
      domain,
      maxAge: accessMaxAge,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      domain,
      maxAge: refreshMaxAge,
    });
  }

  clearAuthCookies(res: Response) {
    const isProduction = this.isProduction();
    const domain = this.getCookieDomain();

    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      domain,
    });

    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      domain,
    });
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private getCookieDomain() {
    return this.configService.get<string>('AUTH_COOKIE_DOMAIN') || undefined;
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
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        refreshToken,
        {
          secret: getRefreshTokenSecret(this.configService),
        },
      );
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  private async verifyAccessToken(accessToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        accessToken,
        { secret: getAccessTokenSecret(this.configService) },
      );
      if (payload.type !== 'access') {
        throw new Error('Invalid token type.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
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
    const sessionId = randomUUID();
    const tokenVersion = 0;

    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      sessionId,
      tokenVersion,
      type: 'access',
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
        sub: user.id,
        tenantId: user.tenantId,
        sessionId,
        tokenVersion,
        type: 'refresh',
      } satisfies AuthTokenPayload,
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
      user: this.mapUserSummary(user, user.tenant.ownerUserId === user.id),
      tokens: {
        accessToken,
        refreshToken,
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
    const roles = effectiveRoles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      type: role.isSystem ? 'SYSTEM' : 'CUSTOM',
      isSystem: role.isSystem,
    }));
    const permissionKeys = Array.from(
      new Set([
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
}
