import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AgentService } from './agent.service';
import type { AgentLoginDto } from './dto/agent-auth.dto';

/**
 * BUG-0033 — the desktop agent login must not answer "does this address exist?"
 *
 * The endpoint is `@Public()` and covers every tenant at once, so any observable
 * difference between a missing account and a wrong password enumerates the whole
 * platform. These assertions pin all three channels that leaked it, plus the
 * cross-tenant resolution defect found while fixing them.
 */
describe('agent login does not enumerate accounts', () => {
  const PASSWORD = 'CorrectHorse1!';
  let passwordHash: string;
  let otherHash: string;

  beforeAll(async () => {
    // Cost 12 to match how the product hashes user passwords.
    passwordHash = await bcrypt.hash(PASSWORD, 12);
    otherHash = await bcrypt.hash('SomethingElse9!', 12);
  });

  function buildService(users: unknown[]) {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(users) },
    };
    return {
      service: new AgentService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      ),
      prisma,
    };
  }

  const dto = (email: string, password: string) =>
    ({
      email,
      password,
      deviceFingerprint: 'fingerprint-0001',
    }) as AgentLoginDto;

  it('returns the same message whether the address exists or the password is wrong', async () => {
    const { service: noSuchUser } = buildService([]);
    const { service: wrongPassword } = buildService([
      {
        id: 'u1',
        tenantId: 't1',
        passwordHash: otherHash,
        tenant: {},
        employee: {},
      },
    ]);

    const absent = await noSuchUser
      .login(dto('nobody@example.com', PASSWORD))
      .catch((e: Error) => e);
    const mismatch = await wrongPassword
      .login(dto('real@example.com', PASSWORD))
      .catch((e: Error) => e);

    expect(absent).toBeInstanceOf(UnauthorizedException);
    expect(mismatch).toBeInstanceOf(UnauthorizedException);
    // The whole defect was that these two differed.
    expect((absent as Error).message).toBe((mismatch as Error).message);
    expect((absent as Error).message).toBe('Invalid credentials.');
  });

  it('never names the reason in the failure message', async () => {
    const { service } = buildService([]);

    const error = await service
      .login(dto('nobody@example.com', PASSWORD))
      .catch((e: Error) => e);

    // The original strings, either of which re-opens the oracle.
    expect((error as Error).message).not.toMatch(/not found/i);
    expect((error as Error).message).not.toMatch(/password/i);
  });

  it('spends bcrypt time on an address that does not exist', async () => {
    // Without this the missing-user path returns in microseconds and the timing
    // enumerates exactly what the message no longer does.
    const { service } = buildService([]);

    const started = process.hrtime.bigint();
    await service
      .login(dto('nobody@example.com', PASSWORD))
      .catch(() => undefined);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    // A cost-12 comparison is ~250 ms; anything near zero means no work happened.
    expect(elapsedMs).toBeGreaterThan(50);
  });

  it('resolves the account by password when one address exists in two tenants', async () => {
    /*
     * `User` is unique on [tenantId, email], not on email, so a contractor
     * employed by two tenants has two rows. The old `findFirst` returned an
     * arbitrary one and could refuse them their own account.
     */
    const { service } = buildService([
      {
        id: 'other-tenant',
        tenantId: 't1',
        status: 'ACTIVE',
        passwordHash: otherHash,
        tenant: { status: 'ACTIVE' },
        employee: null,
      },
      {
        id: 'mine',
        tenantId: 't2',
        status: 'ACTIVE',
        passwordHash,
        tenant: { status: 'ACTIVE' },
        employee: null,
      },
    ]);

    const error = await service
      .login(dto('shared@example.com', PASSWORD))
      .catch((e: Error) => e);

    // Reaching the linked-employee check proves the correct row was selected:
    // the wrong row would have failed the password and said Invalid credentials.
    expect((error as Error).message).toMatch(/linked employee profile/i);
  });

  it('looks the address up without assuming e-mail is globally unique', async () => {
    const { service, prisma } = buildService([]);

    await service
      .login(dto('Someone@Example.COM ', PASSWORD))
      .catch(() => undefined);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'someone@example.com' } }),
    );
  });
});
