import { maskFieldValue } from '../../common/security/field-mask';
import {
  FieldAccessDecision,
  FieldAccessService,
  type ApplicablePolicy,
} from './field-access.service';

const rule = (
  fieldKey: string,
  visibility: string,
  extra: Partial<{
    accessMode: string;
    maskingPattern: string | null;
    customMask: string | null;
  }> = {},
) => ({
  id: `r-${fieldKey}-${visibility}`,
  fieldKey,
  visibility,
  accessMode: extra.accessMode ?? 'EDITABLE',
  maskingPattern: extra.maskingPattern ?? null,
  customMask: extra.customMask ?? null,
});

describe('maskFieldValue (BUG-3155)', () => {
  it('FULL never reveals length', () => {
    expect(maskFieldValue('1234567890123', 'FULL')).toBe(
      maskFieldValue('12', 'FULL'),
    );
  });
  it('LAST_4 keeps only the last four and fully masks short values', () => {
    expect(maskFieldValue('4210112345671', 'LAST_4')).toBe('****5671');
    expect(maskFieldValue('1234', 'LAST_4')).toBe('********');
  });
  it('PARTIAL keeps at most the outer characters', () => {
    expect(maskFieldValue('ABCDEFG', 'PARTIAL')).toBe('A****G');
    expect(maskFieldValue('AB', 'PARTIAL')).toBe('********');
  });
  it('CUSTOM uses the configured text and fails closed without one', () => {
    expect(maskFieldValue('secret', 'CUSTOM', 'N/A')).toBe('N/A');
    expect(maskFieldValue('secret', 'CUSTOM', null)).toBe('********');
  });
  it('a value that is not a string is nulled, never stringified', () => {
    expect(maskFieldValue(98765.43, 'FULL')).toBeNull();
    expect(maskFieldValue(new Date(), 'LAST_4')).toBeNull();
    expect(maskFieldValue(null, 'FULL')).toBeNull();
  });
  it('an unknown pattern fails closed', () => {
    expect(maskFieldValue('secret', 'NOPE')).toBe('********');
  });
});

describe('FieldAccessDecision (BUG-3155)', () => {
  const decide = (...policies: ApplicablePolicy[]) =>
    new FieldAccessDecision(policies);

  it('hides with a null value and keeps the key', () => {
    const d = decide({ id: 'p', rules: [rule('cnic', 'HIDDEN')] });
    const record = { cnic: '42101-1234567-1', firstName: 'A' };
    d.apply(record);
    expect(record).toEqual({ cnic: null, firstName: 'A' });
  });

  it('masks with the configured pattern', () => {
    const d = decide({
      id: 'p',
      rules: [rule('taxIdentifier', 'MASKED', { maskingPattern: 'LAST_4' })],
    });
    const record = { taxIdentifier: 'NTN-0099887' };
    d.apply(record);
    expect(record.taxIdentifier).toBe('****9887');
  });

  it('the most restrictive rule wins across policies', () => {
    const d = decide(
      {
        id: 'a',
        rules: [rule('cnic', 'MASKED', { maskingPattern: 'LAST_4' })],
      },
      { id: 'b', rules: [rule('cnic', 'HIDDEN')] },
      { id: 'c', rules: [rule('cnic', 'VISIBLE')] },
    );
    expect(d.effect('cnic').kind).toBe('HIDDEN');
  });

  it('a VISIBLE rule alone restricts nothing', () => {
    const d = decide({ id: 'a', rules: [rule('cnic', 'VISIBLE')] });
    const record = { cnic: 'x' };
    d.apply(record);
    expect(record.cnic).toBe('x');
    expect(d.restrictedFields()).toEqual([]);
  });

  it('applies to nested groups that carry the same columns', () => {
    const d = decide({ id: 'p', rules: [rule('cnic', 'HIDDEN')] });
    const record = {
      id: 'e1',
      personalInfo: { cnic: 'secret' },
      employmentInfo: { hireDate: 'd' },
    };
    d.apply(record, ['personalInfo', 'employmentInfo']);
    expect(record.personalInfo.cnic).toBeNull();
  });

  it('does not touch a nested group that was not declared', () => {
    const d = decide({ id: 'p', rules: [rule('cnic', 'HIDDEN')] });
    const record = { other: { cnic: 'kept' } };
    d.apply(record, ['personalInfo']);
    expect(record.other.cnic).toBe('kept');
  });

  it('read-only and restricted fields are write-restricted', () => {
    const d = decide({
      id: 'p',
      rules: [
        rule('phone', 'VISIBLE', { accessMode: 'READ_ONLY' }),
        rule('cnic', 'HIDDEN'),
      ],
    });
    expect(d.isWriteRestricted('phone')).toBe(true);
    expect(d.isWriteRestricted('cnic')).toBe(true);
    expect(d.isWriteRestricted('firstName')).toBe(false);
  });
});

describe('FieldAccessService.applicablePolicies (BUG-3155)', () => {
  const makePrisma = (policies: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(policies);
    return {
      findMany,
      prisma: { fieldSecurityPolicy: { findMany } },
    };
  };
  const user = {
    userId: 'u1',
    tenantId: 'tenant-a',
    roleKeys: ['MANAGER'],
    accessContext: { teamIds: ['team-1'] },
  } as never;

  it('always scopes the policy query to the caller tenant', async () => {
    const { prisma, findMany } = makePrisma([]);
    await new FieldAccessService(prisma as never).applicablePolicies(
      user,
      'employees',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          entityKey: 'employees',
          isActive: true,
        },
      }),
    );
  });

  it('keeps unscoped policies and those matching the caller role or team only', async () => {
    const policy = (
      id: string,
      roles: string[],
      teams: string[],
    ): Record<string, unknown> => ({
      id,
      rules: [],
      roles: roles.map((key) => ({ role: { key } })),
      teams: teams.map((teamId) => ({ teamId })),
    });
    const { prisma } = makePrisma([
      policy('unscoped', [], []),
      policy('role-hit', ['MANAGER'], []),
      policy('role-miss', ['HR'], []),
      policy('team-hit', [], ['team-1']),
      policy('team-miss', [], ['team-9']),
    ]);
    const result = await new FieldAccessService(
      prisma as never,
    ).applicablePolicies(user, 'employees');
    expect(result.map((p) => p.id)).toEqual([
      'unscoped',
      'role-hit',
      'team-hit',
    ]);
  });

  it('memoises per request and table', async () => {
    const { prisma, findMany } = makePrisma([]);
    const service = new FieldAccessService(prisma as never);
    await service.forRequest(user, 'employees');
    await service.forRequest(user, 'employees');
    await service.forRequest(user, 'employeeCompensations');
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
