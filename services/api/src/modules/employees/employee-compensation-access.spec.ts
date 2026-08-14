import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { EmployeeProfilesService } from './employee-profiles.service';

/*
 * Who may see what an employee is paid.
 *
 * getCurrentCompensation used to gate on assertEmployeeAccess alone -- the
 * employee-record read check -- and then return the whole row. Reporting
 * managers clear that check for their entire reporting subtree without holding
 * any compensation or payroll permission, so every manager could read their
 * reports' salary, bank account number, IBAN, routing number and tax
 * identifier. GET /employees/:employeeId embeds the same value through
 * getProfile, so the exposure was not limited to the compensation route.
 */

const TENANT = 'tenant-1';

const SENSITIVE_FIELDS = [
  'basicSalary',
  'bankName',
  'bankAccountTitle',
  'bankAccountNumber',
  'bankIban',
  'bankRoutingNumber',
  'taxIdentifier',
] as const;

function buildUser(
  permissionKeys: string[],
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: TENANT,
    email: 'user@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
    ...overrides,
  };
}

const compensationRow = {
  id: 'comp-1',
  tenantId: TENANT,
  employeeId: 'employee-1',
  basicSalary: new Prisma.Decimal('120000.00'),
  payFrequency: 'MONTHLY',
  effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: null,
  currency: 'USD',
  payrollStatus: 'ACTIVE',
  payrollGroup: null,
  paymentMode: 'BANK_TRANSFER',
  bankName: 'Example Bank',
  bankAccountTitle: 'Ada Lovelace',
  bankAccountNumber: '00012345678',
  bankIban: 'GB33BUKB20201555555555',
  bankRoutingNumber: '026009593',
  taxIdentifier: 'TAX-999',
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService(accessMode: string) {
  const findFirst = jest.fn(async () => compensationRow);
  const prisma = { employeeCompensation: { findFirst } };
  const employeesRepository = {
    findByIdAndTenant: jest.fn(async () => ({
      id: 'employee-1',
      tenantId: TENANT,
    })),
  };
  const employeeAccessService = {
    // The record is readable; the question under test is compensation.
    canViewEmployeeRecord: jest.fn(async () => true),
    getEmployeeRecordAccess: jest.fn(async () => accessMode),
  };

  const service = new EmployeeProfilesService(
    prisma as never,
    employeesRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    employeeAccessService as never,
    {} as never,
  );

  return { service, findFirst };
}

describe('EmployeeProfilesService compensation access', () => {
  it('hides compensation from a reporting manager with no payroll permission', async () => {
    const { service, findFirst } = createService('MANAGER_READONLY');

    const result = await service.getCurrentCompensation(
      buildUser(['employees.read']),
      'employee-1',
    );

    expect(result).toBeNull();
    // Nothing sensitive is even fetched, so it cannot leak through a log either.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('hides compensation from an HR user who can manage records but holds no compensation permission', async () => {
    const { service } = createService('HR_MANAGE');

    const result = await service.getCurrentCompensation(
      buildUser(['employees.read', 'employees.update']),
      'employee-1',
    );

    expect(result).toBeNull();
  });

  it('returns compensation to a caller holding compensation.read', async () => {
    const { service } = createService('HR_MANAGE');

    const result = await service.getCurrentCompensation(
      buildUser(['employees.read', 'compensation.read']),
      'employee-1',
    );

    expect(result).not.toBeNull();
    for (const field of SENSITIVE_FIELDS) {
      expect(result).toHaveProperty(field);
    }
    // Decimal.toString() normalises the trailing zeros away.
    expect(result?.basicSalary).toBe('120000');
  });

  it('returns compensation to a caller holding payroll.read', async () => {
    const { service } = createService('HR_MANAGE');

    const result = await service.getCurrentCompensation(
      buildUser(['payroll.read']),
      'employee-1',
    );

    expect(result).not.toBeNull();
  });

  it('returns compensation to a caller carrying the matrix privilege only', async () => {
    const { service } = createService('HR_MANAGE');

    const result = await service.getCurrentCompensation(
      buildUser([], {
        rolePrivileges: [
          {
            entityKey: 'compensation',
            privilege: 'READ',
            accessLevel: 'TENANT',
            roleId: 'role-1',
          },
        ] as AuthenticatedUser['rolePrivileges'],
      }),
      'employee-1',
    );

    expect(result).not.toBeNull();
  });

  it('lets an employee read their own compensation without any permission', async () => {
    const { service } = createService('SELF');

    const result = await service.getCurrentCompensation(
      buildUser([]),
      'employee-1',
    );

    expect(result).not.toBeNull();
    expect(result?.bankAccountNumber).toBe('00012345678');
  });

  it('is indistinguishable from having no compensation record', async () => {
    const denied = await createService('MANAGER_READONLY').service
      .getCurrentCompensation(buildUser(['employees.read']), 'employee-1');

    const { service, findFirst } = createService('SELF');
    findFirst.mockResolvedValueOnce(null as never);
    const absent = await service.getCurrentCompensation(
      buildUser([]),
      'employee-1',
    );

    expect(denied).toBeNull();
    expect(absent).toBeNull();
  });

  it('queries with an explicit select and stays scoped to the caller tenant', async () => {
    const { service, findFirst } = createService('SELF');

    await service.getCurrentCompensation(buildUser([]), 'employee-1');

    const args = findFirst.mock.calls[0][0] as unknown as {
      where: { tenantId: string; employeeId: string };
      select?: Record<string, boolean>;
    };

    expect(args.where.tenantId).toBe(TENANT);
    expect(args.where.employeeId).toBe('employee-1');
    // An absent select is what published every column of the model before.
    expect(args.select).toBeDefined();
    for (const field of SENSITIVE_FIELDS) {
      expect(args.select).toHaveProperty(field, true);
    }
  });
});
