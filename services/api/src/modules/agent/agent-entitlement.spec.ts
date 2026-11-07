import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AppError } from '../../common/errors/app-error';
import { AgentService } from './agent.service';
import type { AgentLoginDto } from './dto/agent-auth.dto';

/*
 * login/refresh are @Public(), so EntitlementGuard cannot see them. A tenant
 * off the Desktop Agent plan must not be able to mint or renew agent
 * credentials, and the refusal must come only AFTER the password is proven.
 */
describe('AgentService entitlement on public auth routes', () => {
  const PASSWORD = 'Correct-Horse-9!';
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  const user = () => ({
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.test',
    firstName: 'A',
    lastName: 'B',
    status: 'ACTIVE',
    passwordHash: hash,
    tenant: { id: 't1', name: 'T', slug: 't', status: 'ACTIVE' },
    employee: { id: 'e1' },
  });

  const dto = (password: string) =>
    ({
      email: 'a@b.test',
      password,
      deviceFingerprint: 'fp-0001',
    }) as AgentLoginDto;

  function build(assertEntitled: jest.Mock) {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([user()]) },
      employeeDevice: { upsert: jest.fn(), findFirst: jest.fn() },
    };
    const service = new AgentService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { assertEntitled } as never,
    );
    return { service, prisma };
  }

  it('refuses login for an un-entitled tenant and registers no device', async () => {
    const refuse = jest
      .fn()
      .mockRejectedValue(new AppError('TENANT_FEATURE_NOT_ENTITLED'));
    const { service, prisma } = build(refuse);

    await expect(service.login(dto(PASSWORD))).rejects.toMatchObject({
      errorCode: 'TENANT_FEATURE_NOT_ENTITLED',
    });
    expect(refuse).toHaveBeenCalledWith(
      't1',
      ['desktop-agent'],
      'POST /agent/auth/login',
    );
    expect(prisma.employeeDevice.upsert).not.toHaveBeenCalled();
  });

  it('does not reveal entitlement to a caller with the wrong password', async () => {
    const refuse = jest
      .fn()
      .mockRejectedValue(new AppError('TENANT_FEATURE_NOT_ENTITLED'));
    const { service } = build(refuse);

    await expect(
      service.login(dto('Wrong-Password-1!')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refuse).not.toHaveBeenCalled();
  });
});
