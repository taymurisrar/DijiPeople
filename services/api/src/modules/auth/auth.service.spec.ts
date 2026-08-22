import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let configService: { get: jest.Mock };
  let usersService: {
    findByIdWithAccess: jest.Mock;
    findManyByEmailWithAccess: jest.Mock;
    markLastLogin: jest.Mock;
  };
  let permissionBootstrapService: {
    bootstrapTenantRbac: jest.Mock;
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
      sign: jest.fn((payload: unknown) => JSON.stringify(payload)),
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
      findManyByEmailWithAccess: jest.fn(),
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
      {} as never,
      usersService as never,
      permissionBootstrapService as never,
      {} as never,
      {} as never,
      {} as never,
      { sendEmail: jest.fn() } as never,
      { log: jest.fn() } as never,
      {
        assertPasswordMeetsPolicy: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        isLocked: jest.fn().mockReturnValue(false),
        registerFailure: jest.fn().mockResolvedValue({ locked: false }),
        registerSuccess: jest.fn().mockResolvedValue(undefined),
      } as never,
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
        status: 'Active',
      },
    });

    await expect(service.refresh('refresh-token')).rejects.toThrow(
      'This account is not active.',
    );
  });

  it('preserves remember-me on platform access and refresh tokens', () => {
    const buildPlatformAuthResponse = (
      service as unknown as {
        buildPlatformAuthResponse: (
          user: Record<string, unknown>,
          rememberMe: boolean,
        ) => { tokens: { rememberMe: boolean; refreshTokenExpiresIn: string } };
      }
    ).buildPlatformAuthResponse.bind(service);

    const result = buildPlatformAuthResponse(
      {
        id: 'platform-user-1',
        email: 'owner@example.test',
        firstName: 'Platform',
        lastName: 'Owner',
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
      },
      true,
    );

    expect(result.tokens).toMatchObject({
      rememberMe: true,
      refreshTokenExpiresIn: '30d',
    });
    /*
     * `jest.Mocked<JwtService>` keeps the real class's method *types*, so
     * reading `.sign` off it trips `@typescript-eslint/unbound-method` — right
     * for a class whose method uses `this`, and meaningless for a `jest.fn()`
     * that has none.
     *
     * Destructured off a structural cast, the shape
     * `partner-lifecycle-guards.spec.ts` already uses: the cast applies to the
     * object, so the property is read as a spy rather than as a class method.
     * Casting the *result* does not help — the rule fires on the member access
     * itself, not on the resulting type.
     */
    const { sign } = jwtService as unknown as { sign: jest.Mock };

    expect(sign).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rememberMe: true, tokenUse: 'access' }),
      expect.any(Object),
    );
    expect(sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rememberMe: true, tokenUse: 'refresh' }),
      expect.any(Object),
    );
  });
});
