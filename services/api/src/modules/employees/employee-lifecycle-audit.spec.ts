import { DEFAULT_TENANT_SETTINGS } from '../tenant-settings/tenant-settings.catalog';
import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
import { EmployeesService } from './employees.service';

/**
 * BUG-2044 — creating an employee and changing a reporting line wrote no audit
 * row at all.
 *
 * This service already audited update, archive, owner assignment, import and
 * access provisioning, so the two gaps read as omissions rather than policy.
 * The deeper finding on the record is that the absence of an audit call is
 * invisible: nothing failed when it was missing. These assertions are what make
 * it visible, and they fail against the code as it stood.
 */

const currentUser = {
  tenantId: 'tenant-1',
  userId: 'actor-1',
  email: 'hr@example.com',
  firstName: 'HR',
  lastName: 'Admin',
  roleIds: ['role-1'],
  roleKeys: ['system-admin'],
  permissionKeys: ['employees.create', 'employees.update'],
} as never;

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    tenantId: 'tenant-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    preferredName: null,
    employeeCode: 'EMP-0002',
    email: 'ada@example.com',
    phone: '1234567890',
    cnic: '42101-1234567-8',
    taxIdentifier: 'TAX-99881',
    dateOfBirth: null,
    gender: null,
    maritalStatus: null,
    employmentStatus: 'Active',
    hireDate: new Date('2026-01-05'),
    terminationDate: null,
    departmentId: 'department-1',
    designationId: 'designation-1',
    locationId: null,
    managerEmployeeId: null,
    userId: null,
    createdAt: new Date('2026-01-05'),
    updatedAt: new Date('2026-01-05'),
    manager: null,
    user: null,
    profileImageDocument: null,
    department: null,
    designation: null,
    location: null,
    _count: {
      directReports: 0,
      educationRecords: 0,
      historyRecords: 0,
      documentLinks: 0,
      emergencyContacts: 0,
      documentReferences: 0,
    },
    ...overrides,
  };
}

function createService() {
  const auditService = { log: jest.fn() };
  const employeesRepository = {
    findByIdAndTenant: jest.fn().mockResolvedValue(employeeRow()),
    update: jest.fn().mockResolvedValue({ count: 1 }),
    findDirectReports: jest.fn().mockResolvedValue([]),
    findHierarchyNodeByIdAndTenant: jest.fn().mockResolvedValue({
      id: 'manager-1',
      managerEmployeeId: null,
    }),
  };
  const prisma = {
    country: { findFirst: jest.fn() },
    stateProvince: { findFirst: jest.fn() },
    city: { findFirst: jest.fn() },
    relationType: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new EmployeesService(
    prisma as never,
    employeesRepository as never,
    {
      findDepartmentById: jest.fn(),
      findDesignationById: jest.fn(),
      findLocationById: jest.fn(),
      findOrganizationById: jest.fn().mockResolvedValue({
        id: 'organization-1',
        tenantId: 'tenant-1',
      }),
      findBusinessUnitById: jest.fn().mockResolvedValue({
        id: 'business-unit-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
      }),
    } as never,
    { findByIdWithAccess: jest.fn() } as never,
    {
      findByIds: jest.fn(),
      findByTenant: jest.fn(),
      findByKeyAndTenant: jest.fn(),
    } as never,
    { bootstrapTenantDefaults: jest.fn() } as never,
    {} as never,
    {
      getEmployeeSettings: jest.fn().mockResolvedValue({
        ...DEFAULT_TENANT_SETTINGS.employees,
        requireEmergencyContact: false,
      }),
    } as never,
    auditService as never,
    { checkEmployeeDuplicates: jest.fn() } as never,
    {} as never,
    {} as never,
    { assignDefaults: jest.fn() } as never,
  );

  return { service, auditService, employeesRepository, prisma };
}

const createDto = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  employeeCode: 'EMP-0002',
  hireDate: '2026-01-05',
  businessUnitId: 'business-unit-1',
  organizationId: 'organization-1',
} as never;

describe('employee lifecycle auditing', () => {
  it('writes an audit row when an employee is created', async () => {
    const { service, auditService, prisma } = createService();
    prisma.$transaction.mockResolvedValue({ id: 'employee-1' });

    await service.create(currentUser, createDto);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'actor-1',
        action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
        entityType: 'Employee',
        entityId: 'employee-1',
      }),
    );
  });

  it('carries the created employee as the after snapshot, with no before', async () => {
    /*
     * A creation has nothing before it, and saying so is more honest than an
     * empty object, which reads like a record that was emptied.
     */
    const { service, auditService, prisma } = createService();
    prisma.$transaction.mockResolvedValue({ id: 'employee-1' });

    await service.create(currentUser, createDto);

    const [entry] = auditService.log.mock.calls[0] as [
      {
        beforeSnapshot?: unknown;
        afterSnapshot?: Record<string, unknown>;
      },
    ];
    expect(entry.beforeSnapshot).toBeUndefined();
    expect(entry.afterSnapshot).toEqual(
      expect.objectContaining({ id: 'employee-1', employeeCode: 'EMP-0002' }),
    );
  });

  it('writes an audit row when a reporting manager is assigned', async () => {
    const { service, auditService, employeesRepository } = createService();
    employeesRepository.findByIdAndTenant
      .mockResolvedValueOnce(employeeRow({ managerEmployeeId: null }))
      .mockResolvedValue(employeeRow({ managerEmployeeId: 'manager-1' }));

    await service.assignManager(
      'tenant-1',
      'employee-1',
      { reportingManagerEmployeeId: 'manager-1' } as never,
      'actor-1',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'actor-1',
        action: AUDIT_ACTIONS.EMPLOYEE_REPORTING_MANAGER_ASSIGNED,
        entityType: 'Employee',
        entityId: 'employee-1',
        beforeSnapshot: { employeeId: 'employee-1', managerEmployeeId: null },
        afterSnapshot: {
          employeeId: 'employee-1',
          managerEmployeeId: 'manager-1',
        },
      }),
    );
  });

  it('records a manager being removed as a reporting-line change', async () => {
    const { service, auditService, employeesRepository } = createService();
    employeesRepository.findByIdAndTenant
      .mockResolvedValueOnce(employeeRow({ managerEmployeeId: 'manager-1' }))
      .mockResolvedValue(employeeRow({ managerEmployeeId: null }));

    await service.assignManager(
      'tenant-1',
      'employee-1',
      { reportingManagerEmployeeId: null } as never,
      'actor-1',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.EMPLOYEE_REPORTING_MANAGER_ASSIGNED,
        beforeSnapshot: {
          employeeId: 'employee-1',
          managerEmployeeId: 'manager-1',
        },
        afterSnapshot: { employeeId: 'employee-1', managerEmployeeId: null },
      }),
    );
  });

  it('does not audit a reporting-line change that was rejected', async () => {
    /*
     * A row for a change that did not happen is worse than no row. Assigning an
     * employee as their own manager throws before the write, so nothing may be
     * logged.
     */
    const { service, auditService, employeesRepository } = createService();
    employeesRepository.findByIdAndTenant.mockResolvedValue(
      employeeRow({ managerEmployeeId: null }),
    );

    await expect(
      service.assignManager(
        'tenant-1',
        'employee-1',
        { reportingManagerEmployeeId: 'employee-1' } as never,
        'actor-1',
      ),
    ).rejects.toThrow();

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
