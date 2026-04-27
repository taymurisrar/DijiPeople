import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let configService: { get: jest.Mock };
  let usersService: {
    findByIdWithAccess: jest.Mock;
    markLastLogin: jest.Mock;
  };
  let permissionBootstrapService: {
    bootstrapTenantRbac: jest.Mock;
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') {
          return 'refresh-secret';
        }
        return undefined;
      }),
    };

    usersService = {
      findByIdWithAccess: jest.fn(),
      markLastLogin: jest.fn(),
    };

    permissionBootstrapService = {
      bootstrapTenantRbac: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      {
        refreshToken: {
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      } as never,
      jwtService,
      configService as unknown as ConfigService,
      {} as never,
      usersService as never,
      permissionBootstrapService as never,
      {} as never,
    );
  });

  it('rejects refresh when the user is inactive', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      type: 'refresh',
    } as never);

    usersService.findByIdWithAccess.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      status: 'INVITED',
      tenant: {
        status: 'ACTIVE',
      },
    });

    await expect(service.refresh('refresh-token')).rejects.toThrow(
      'This account is not active.',
    );
  });
});