import { ConflictException } from '@nestjs/common';
import { DuplicateRuleEngine } from './duplicate-rule-engine';

describe('DuplicateRuleEngine', () => {
  let findFirst: jest.Mock;
  let engine: DuplicateRuleEngine;

  beforeEach(() => {
    findFirst = jest.fn();
    engine = new DuplicateRuleEngine({ employee: { findFirst } } as never);
  });

  it('scopes employee duplicate checks to the current tenant', async () => {
    findFirst.mockResolvedValue(null);

    await engine.checkEmployeeDuplicates({
      tenantId: 'tenant-a',
      payload: { email: 'test@example.com' },
      rules: [
        {
          key: 'email',
          label: 'Email',
          enabled: true,
          severity: 'BLOCK',
          value: (payload) => payload.email,
          buildWhere: (value) => ({ personalEmail: value }),
        },
      ],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [{ tenantId: 'tenant-a' }, { personalEmail: 'test@example.com' }],
      },
      select: { id: true },
    });
  });

  it('excludes the current employee during update checks', async () => {
    findFirst.mockResolvedValue(null);

    await engine.checkEmployeeDuplicates({
      tenantId: 'tenant-a',
      excludeEmployeeId: 'employee-1',
      payload: { cnic: 'QID-1' },
      rules: [
        {
          key: 'nationalId',
          label: 'National identity value',
          enabled: true,
          severity: 'BLOCK',
          value: (payload) => payload.cnic,
          buildWhere: (value) => ({ cnic: value }),
        },
      ],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { tenantId: 'tenant-a' },
          { cnic: 'QID-1' },
          { id: { not: 'employee-1' } },
        ],
      },
      select: { id: true },
    });
  });

  it('keeps BLOCK behavior intact', async () => {
    findFirst.mockResolvedValue({ id: 'employee-2' });

    await expect(
      engine.checkEmployeeDuplicates({
        tenantId: 'tenant-a',
        payload: { email: 'test@example.com' },
        rules: [
          {
            key: 'email',
            label: 'Email',
            enabled: true,
            severity: 'BLOCK',
            value: (payload) => payload.email,
            buildWhere: (value) => ({ personalEmail: value }),
          },
        ],
      }),
    ).rejects.toThrow(new ConflictException('Email already exists on another employee.'));
  });
});
