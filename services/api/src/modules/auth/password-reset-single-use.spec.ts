import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * DP-QA-031. A password-reset link works once. The token pins the credential it
 * was issued against (`pwv`); the first reset moves `passwordChangedAt`, so a
 * replay - sequential or concurrent - is refused.
 */
function build(passwordChangedAt: Date | null) {
  let current = passwordChangedAt;
  const token = (claims: Record<string, unknown>) => JSON.stringify(claims);

  const userApi = {
    findFirst: jest.fn(async () => ({ passwordChangedAt: current })),
    findUnique: jest.fn(async () => ({ identityId: null })),
    // Conditional write: matches only while the credential is unchanged.
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { passwordChangedAt: Date | null };
        data: { passwordChangedAt: Date };
      }) => {
        const same =
          (where.passwordChangedAt?.getTime() ?? 0) ===
          (current?.getTime() ?? 0);
        if (!same) return { count: 0 };
        current = data.passwordChangedAt;
        return { count: 1 };
      },
    ),
  };
  const tx = {
    user: userApi,
    refreshToken: { updateMany: jest.fn() },
    userIdentity: { updateMany: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = {
    user: userApi,
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };
  const jwt = {
    verify: jest.fn((t: string) => JSON.parse(t) as Record<string, unknown>),
  };
  const policy = {
    assertPasswordMeetsPolicy: jest.fn(),
    assertPasswordNotReused: jest.fn(),
    recordPasswordChange: jest.fn(),
  };

  const service = Object.create(AuthService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    prisma,
    jwtService: jwt,
    configService: { get: jest.fn(() => 'secret') },
    passwordPolicyService: policy,
  });

  const reset = (
    claims: Record<string, unknown>,
    password = 'Str0ng!Passw0rd',
  ) =>
    (
      AuthService.prototype.resetPassword as (
        t: string,
        p: string,
      ) => Promise<unknown>
    ).call(service, token(claims), password) as Promise<unknown>;

  return { reset, userApi, policy, getCurrent: () => current };
}

const claims = (pwv: number) => ({
  type: 'password-reset',
  sub: 'u1',
  tenantId: 't1',
  pwv,
});

describe('password reset tokens are single-use (DP-QA-031)', () => {
  it('accepts a token issued against the current credential', async () => {
    const { reset } = build(null);
    await expect(reset(claims(0))).resolves.toEqual({ ok: true });
  });

  it('refuses the same token a second time (replay)', async () => {
    const { reset } = build(null);
    await reset(claims(0));
    await expect(reset(claims(0), 'Another!Passw0rd2')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets exactly one of two concurrent requests with the same token win', async () => {
    const { reset, getCurrent } = build(new Date(1_700_000_000_000));
    const results = await Promise.allSettled([
      reset(claims(1_700_000_000_000), 'First!Passw0rd-1'),
      reset(claims(1_700_000_000_000), 'Second!Passw0rd-2'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(getCurrent()?.getTime()).toBeGreaterThan(1_700_000_000_000);
  });

  it('refuses an older link once a newer reset (or any password change) happened', async () => {
    const { reset } = build(new Date(2_000));
    await expect(reset(claims(1_000))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token that is not a password-reset token', async () => {
    const { reset } = build(null);
    await expect(
      reset({ type: 'access', sub: 'u1', tenantId: 't1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a legacy token without pwv works only if the password has not changed since it was signed', async () => {
    const issuedAt = 1_700_000_000; // seconds
    const fresh = build(new Date(issuedAt * 1000 - 5_000));
    await expect(
      fresh.reset({
        type: 'password-reset',
        sub: 'u1',
        tenantId: 't1',
        iat: issuedAt,
      }),
    ).resolves.toEqual({ ok: true });

    const stale = build(new Date(issuedAt * 1000 + 5_000));
    await expect(
      stale.reset({
        type: 'password-reset',
        sub: 'u1',
        tenantId: 't1',
        iat: issuedAt,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
