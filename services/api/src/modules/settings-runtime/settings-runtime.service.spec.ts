import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SettingsRuntimeService } from './settings-runtime.service';

describe('SettingsRuntimeService', () => {
  const user = { tenantId: 'tenant-1', userId: 'user-1' } as never;
  const prisma = {
    tenantConfigurationRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const service = new SettingsRuntimeService(prisma as never, audit as never);

  beforeEach(() => jest.clearAllMocks());

  it('isolates list queries by tenant and registered setting key', async () => {
    prisma.tenantConfigurationRecord.findMany.mockResolvedValue([]);
    await service.list(user, 'delegation-rules');
    expect(prisma.tenantConfigurationRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', settingKey: 'delegation-rules' },
      }),
    );
  });

  it('rejects unregistered configuration keys', () => {
    expect(() => service.list(user, 'invented-module')).toThrow(
      BadRequestException,
    );
  });

  it('audits effective-dated record creation', async () => {
    const record = { id: 'record-1', settingKey: 'delegation-rules' };
    prisma.tenantConfigurationRecord.create.mockResolvedValue(record);
    audit.log.mockResolvedValue(undefined);
    await service.create(user, 'delegation-rules', {
      code: 'DLG',
      name: 'Delegation Rule',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SETTINGS_RUNTIME_RECORD_CREATED',
        entityId: 'record-1',
      }),
    );
  });

  it('maps duplicate codes to a conflict', async () => {
    prisma.tenantConfigurationRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create(user, 'delegation-rules', {
        code: 'DLG',
        name: 'Delegation',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
