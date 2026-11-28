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

describe('FieldAccessDecision.screenWrite (BUG-3155)', () => {
  const d = new FieldAccessDecision([
    {
      id: 'p',
      rules: [
        rule('cnic', 'HIDDEN'),
        rule('taxIdentifier', 'MASKED', { maskingPattern: 'LAST_4' }),
        rule('phone', 'VISIBLE', { accessMode: 'READ_ONLY' }),
      ],
    },
  ]);
  const stored = {
    cnic: '4210112345671',
    taxIdentifier: 'NTN-0099887',
    phone: '0300',
  };

  it('drops an echoed null/mask/stored value so the stored value survives', () => {
    const payload: Record<string, unknown> = {
      cnic: null,
      taxIdentifier: '****9887',
      phone: '0300',
      firstName: 'A',
    };
    expect(d.screenWrite(payload, stored, Object.keys(payload))).toEqual([]);
    expect(payload).toEqual({ firstName: 'A' });
  });

  it('reports a genuine change instead of dropping it', () => {
    const payload: Record<string, unknown> = {
      cnic: '9999999999999',
      taxIdentifier: 'NTN-NEW',
      phone: '0311',
    };
    expect(d.screenWrite(payload, stored, Object.keys(payload)).sort()).toEqual(
      ['cnic', 'phone', 'taxIdentifier'],
    );
  });

  it('leaves unrestricted fields alone', () => {
    const payload: Record<string, unknown> = { firstName: 'B' };
    expect(d.screenWrite(payload, stored, ['firstName'])).toEqual([]);
    expect(payload).toEqual({ firstName: 'B' });
  });
});

describe('FieldAccessService.applicablePolicies (BUG-3155)', () => {
  const makePrisma = (policies: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(policies);
    const findFirst = jest
      .fn()
      .mockResolvedValue(policies.length ? { id: 'any' } : null);
    return {
      findMany,
      prisma: { fieldSecurityPolicy: { findMany, findFirst } },
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
    expect(findMany).not.toHaveBeenCalled(); // no policy: one flat statement
  });

  it('scopes the full policy query to the caller tenant', async () => {
    const { prisma, findMany } = makePrisma([
      { id: 'p', rules: [], roles: [], teams: [] },
    ]);
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
    expect(prisma.fieldSecurityPolicy.findFirst).toHaveBeenCalledTimes(2);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('FieldAccessDecision.screenWrite aliases and typed echoes (BUG-3155)', () => {
  const d = new FieldAccessDecision([
    {
      id: 'p',
      rules: [
        rule('email', 'HIDDEN'),
        rule('hireDate', 'VISIBLE', { accessMode: 'READ_ONLY' }),
        rule('basicSalary', 'VISIBLE', { accessMode: 'READ_ONLY' }),
      ],
    },
  ]);

  it('screens a DTO key through its column alias (workEmail -> email)', () => {
    const payload: Record<string, unknown> = { workEmail: 'new@example.com' };
    const forbidden = d.screenWrite(
      payload,
      { email: 'old@example.com' },
      ['workEmail'],
      {
        workEmail: 'email',
      },
    );
    expect(forbidden).toEqual(['workEmail']);
  });

  it('without the alias the same key would slip through (why the alias exists)', () => {
    const payload: Record<string, unknown> = { workEmail: 'new@example.com' };
    expect(
      d.screenWrite(payload, { email: 'old@example.com' }, ['workEmail']),
    ).toEqual([]);
  });

  it('a read-only echo of a Date or Decimal-like value is accepted, a change is not', () => {
    const stored = {
      hireDate: new Date('2024-01-15T00:00:00.000Z'),
      basicSalary: '1000.50',
    };
    const echo: Record<string, unknown> = {
      hireDate: '2024-01-15',
      basicSalary: 1000.5,
    };
    expect(d.screenWrite(echo, stored, Object.keys(echo))).toEqual([]);
    const change: Record<string, unknown> = {
      hireDate: '2024-01-16',
      basicSalary: 1000.51,
    };
    expect(d.screenWrite(change, stored, Object.keys(change)).sort()).toEqual([
      'basicSalary',
      'hireDate',
    ]);
  });
});

describe('read-only echo comparison is not lossy (BUG-3155)', () => {
  const ro = new FieldAccessDecision([
    {
      id: 'p',
      rules: [
        rule('customData', 'VISIBLE', { accessMode: 'READ_ONLY' }),
        rule('amount', 'VISIBLE', { accessMode: 'READ_ONLY' }),
        rule('flag', 'VISIBLE', { accessMode: 'READ_ONLY' }),
      ],
    },
  ]);
  const screen = (
    payload: Record<string, unknown>,
    stored: Record<string, unknown>,
  ) => ro.screenWrite(payload, stored, Object.keys(payload));

  it('a changed JSON object or array is a change, an identical one is an echo', () => {
    expect(screen({ customData: { a: 2 } }, { customData: { a: 1 } })).toEqual([
      'customData',
    ]);
    expect(screen({ customData: [1, 2] }, { customData: '1,2' })).toEqual([
      'customData',
    ]);
    expect(screen({ customData: { a: 1 } }, { customData: { a: 1 } })).toEqual(
      [],
    );
  });

  it('decimals that differ past 15 digits are different; trailing zeros are not', () => {
    expect(screen({ amount: '1000.00' }, { amount: '1000' })).toEqual([]);
    expect(
      screen(
        { amount: '1234567890.1234567' },
        { amount: '1234567890.1234568' },
      ),
    ).toEqual(['amount']);
  });

  it('a boolean never equals its string form', () => {
    expect(screen({ flag: 'true' }, { flag: true })).toEqual(['flag']);
  });
});
