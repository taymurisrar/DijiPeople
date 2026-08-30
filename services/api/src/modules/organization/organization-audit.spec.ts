import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
import { OrganizationService } from './organization.service';
import type { AuditService } from '../audit/audit.service';

/**
 * BUG-2044 — no file in this module referenced `AuditService` at all, so
 * department and designation writes had no audit path to omit.
 *
 * Organizational placement is half of "who put this person here", and the
 * departments and designations an employee is placed into were created and
 * changed with no record of by whom.
 */

const currentUser = {
  tenantId: 'tenant-1',
  userId: 'actor-1',
  roleIds: ['role-1'],
  roleKeys: ['system-admin'],
  permissionKeys: ['organization.manage'],
  rolePrivileges: [],
  accessContext: {},
} as never;

function createService(overrides: Record<string, unknown> = {}) {
  const auditService = {
    log: jest.fn<Promise<unknown>, Parameters<AuditService['log']>>(),
  };
  const organizationRepository = {
    findOrganizations: jest.fn(async () => [
      {
        id: 'organization-1',
        tenantId: 'tenant-1',
        parentOrganizationId: null,
      },
    ]),
    findBusinessUnits: jest.fn(async () => [
      {
        id: 'business-unit-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        parentBusinessUnitId: null,
      },
    ]),
    findDepartments: jest.fn(async () => [
      {
        id: 'department-1',
        tenantId: 'tenant-1',
        businessUnitId: 'business-unit-1',
        name: 'Engineering',
        status: 'ACTIVE',
        isActive: true,
      },
    ]),
    createDepartment: jest.fn(async () => ({
      id: 'department-1',
      tenantId: 'tenant-1',
      name: 'Engineering',
      businessUnitId: 'business-unit-1',
    })),
    updateDepartment: jest.fn(async () => ({ count: 1 })),
    findDepartmentById: jest.fn(async () => ({
      id: 'department-1',
      tenantId: 'tenant-1',
      name: 'Engineering',
      businessUnitId: 'business-unit-1',
      status: 'ACTIVE',
      isActive: true,
    })),
    createDesignation: jest.fn(async () => ({
      id: 'designation-1',
      tenantId: 'tenant-1',
      name: 'Staff Engineer',
      isActive: true,
    })),
    updateDesignation: jest.fn(async () => ({ count: 1 })),
    findDesignationById: jest.fn(async () => ({
      id: 'designation-1',
      tenantId: 'tenant-1',
      name: 'Staff Engineer',
      level: 'L5',
      isActive: true,
    })),
    countDepartmentTeams: jest.fn(async () => 0),
    countDepartmentEmployees: jest.fn(async () => 0),
    ...overrides,
  };
  const prisma = {
    employee: {
      findFirst: jest.fn(async () => ({ id: 'employee-1' })),
      count: jest.fn(async () => 0),
    },
    user: { findFirst: jest.fn(async () => ({ id: 'user-1' })) },
    tenant: { findUnique: jest.fn(async () => ({ ownerUserId: 'user-1' })) },
    designation: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    employeeLevel: { findFirst: jest.fn(async () => null) },
    jobOpening: { count: jest.fn(async () => 0) },
  };

  const service = new OrganizationService(
    organizationRepository as never,
    prisma as never,
    auditService as never,
  );

  return { service, auditService, organizationRepository, prisma };
}

describe('organization structure auditing', () => {
  it('writes an audit row when a department is created', async () => {
    const { service, auditService } = createService();

    await service.createDepartment(currentUser, {
      name: 'Engineering',
      businessUnitId: 'business-unit-1',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'actor-1',
        action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
        entityType: 'Department',
        entityId: 'department-1',
        afterSnapshot: expect.objectContaining({
          name: 'Engineering',
        }) as Record<string, unknown>,
      }),
    );
  });

  it('writes an audit row with both snapshots when a department changes', async () => {
    const { service, auditService } = createService();

    await service.updateDepartment(currentUser, 'department-1', {
      name: 'Platform Engineering',
    } as never);

    const entry = auditService.log.mock.calls[0]?.[0] as {
      action: string;
      beforeSnapshot?: unknown;
      afterSnapshot?: unknown;
    };
    expect(entry.action).toBe(AUDIT_ACTIONS.DEPARTMENT_UPDATED);
    expect(entry.beforeSnapshot).toBeDefined();
    expect(entry.afterSnapshot).toBeDefined();
  });

  it('records deleting a department as the status change it actually is', async () => {
    /*
     * `deleteDepartment()` delegates to `updateDepartment()` — the row survives
     * as INACTIVE/ARCHIVED. Auditing it as DEPARTMENT_UPDATED is what happened,
     * so there is deliberately no DEPARTMENT_DELETED action.
     */
    const { service, auditService } = createService();

    await service.deleteDepartment(currentUser, 'department-1');

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
        entityId: 'department-1',
      }),
    );
  });

  it('does not audit a department deletion that was refused', async () => {
    const { service, auditService } = createService({
      countDepartmentEmployees: jest.fn(async () => 4),
    });

    await expect(
      service.deleteDepartment(currentUser, 'department-1'),
    ).rejects.toThrow();

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('writes an audit row when a designation is created', async () => {
    const { service, auditService } = createService();

    await service.createDesignation(currentUser, {
      name: 'Staff Engineer',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DESIGNATION_CREATED,
        entityType: 'Designation',
        entityId: 'designation-1',
      }),
    );
  });

  it('writes an audit row when a designation changes', async () => {
    const { service, auditService } = createService();

    await service.updateDesignation(currentUser, 'designation-1', {
      name: 'Principal Engineer',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DESIGNATION_UPDATED,
        entityType: 'Designation',
        entityId: 'designation-1',
        beforeSnapshot: expect.objectContaining({
          name: 'Staff Engineer',
        }) as Record<string, unknown>,
      }),
    );
  });

  it('writes an audit row when a designation is deleted', async () => {
    const { service, auditService } = createService();

    await service.deleteDesignation(currentUser, 'designation-1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DESIGNATION_DELETED,
        entityType: 'Designation',
        entityId: 'designation-1',
      }),
    );
  });

  it('audits against the tenant of the acting user, never one from the payload', async () => {
    /*
     * An audit row written under the wrong tenant is worse than no audit row:
     * it puts one tenant's activity into another tenant's compliance log.
     */
    const { service, auditService } = createService();

    await service.createDepartment(currentUser, {
      name: 'Engineering',
      businessUnitId: 'business-unit-1',
      tenantId: 'tenant-2',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });
});
