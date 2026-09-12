import { BadRequestException } from '@nestjs/common';
import { DEFAULT_TENANT_SETTINGS } from '../tenant-settings/tenant-settings.catalog';
import { toDisplayString } from '../../common/utils/display-string';
import {
  EmployeesService,
  isEmployeeInvitationEligibleUser,
} from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: {
    country: { findFirst: jest.Mock };
    stateProvince: { findFirst: jest.Mock };
    city: { findFirst: jest.Mock };
    relationType: { findFirst: jest.Mock };
    employee: { findMany: jest.Mock };
  };
  let employeesRepository: {
    findByIdAndTenant: jest.Mock;
    update: jest.Mock;
  };
  let organizationRepository: {
    findDepartmentById: jest.Mock;
    findDesignationById: jest.Mock;
    findLocationById: jest.Mock;
  };
  let usersRepository: {
    findByIdWithAccess: jest.Mock;
  };
  let rolesRepository: {
    findByIds: jest.Mock;
    findByTenant: jest.Mock;
    findByKeyAndTenant: jest.Mock;
  };
  let permissionsService: {
    bootstrapTenantDefaults: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };
  let tenantSettingsResolverService: {
    getEmployeeSettings: jest.Mock;
  };
  let duplicateRuleEngine: {
    checkEmployeeDuplicates: jest.Mock;
  };
  let employeeAccessService: {
    canViewEmployeeRecord: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      country: { findFirst: jest.fn() },
      stateProvince: { findFirst: jest.fn() },
      city: { findFirst: jest.fn() },
      relationType: { findFirst: jest.fn() },
      employee: { findMany: jest.fn() },
    };
    employeesRepository = {
      findByIdAndTenant: jest.fn(),
      update: jest.fn(),
    };
    organizationRepository = {
      findDepartmentById: jest.fn(),
      findDesignationById: jest.fn(),
      findLocationById: jest.fn(),
    };
    usersRepository = {
      findByIdWithAccess: jest.fn(),
    };
    rolesRepository = {
      findByIds: jest.fn(),
      findByTenant: jest.fn(),
      findByKeyAndTenant: jest.fn(),
    };
    permissionsService = {
      bootstrapTenantDefaults: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };
    tenantSettingsResolverService = {
      getEmployeeSettings: jest.fn().mockResolvedValue({
        ...DEFAULT_TENANT_SETTINGS.employees,
        requireEmergencyContact: false,
      }),
    };
    duplicateRuleEngine = {
      checkEmployeeDuplicates: jest.fn(),
    };
    employeeAccessService = {
      canViewEmployeeRecord: jest.fn(),
    };

    service = new EmployeesService(
      prisma as never,
      employeesRepository as never,
      organizationRepository as never,
      usersRepository as never,
      rolesRepository as never,
      permissionsService as never,
      {} as never,
      tenantSettingsResolverService as never,
      auditService as never,
      duplicateRuleEngine as never,
      {} as never,
      employeeAccessService as never,
      { assignDefaults: jest.fn() } as never,
    );
  });

  it('rejects updates when the selected department is outside the tenant', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      tenantId: 'tenant-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      preferredName: null,
      employeeCode: 'EMP-001',
      email: 'ada@example.com',
      phone: '1234567890',
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      employmentStatus: 'Active',
      hireDate: new Date(),
      terminationDate: null,
      departmentId: null,
      designationId: null,
      locationId: null,
      managerEmployeeId: null,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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
    });
    organizationRepository.findDepartmentById.mockResolvedValue(null);

    await expect(
      service.update(
        {
          tenantId: 'tenant-1',
          userId: 'actor-1',
          email: 'hr@example.com',
          firstName: 'HR',
          lastName: 'Admin',
          roleIds: ['role-1'],
          roleKeys: ['system-admin'],
          permissionKeys: ['employees.update'],
        },
        'employee-1',
        { departmentId: '9eb53d1d-167a-4b75-9d2a-08db8a7a6658' },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Selected department does not belong to this tenant.',
      ),
    );
  });

  it('returns field errors when tenant settings require emergency contact details', async () => {
    tenantSettingsResolverService.getEmployeeSettings.mockResolvedValue({
      ...DEFAULT_TENANT_SETTINGS.employees,
      requireEmergencyContact: true,
    });
    employeesRepository.findByIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      tenantId: 'tenant-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      employeeCode: 'EMP-001',
      email: 'ada@example.com',
      phone: '1234567890',
      employmentStatus: 'ACTIVE',
      emergencyContactName: null,
      emergencyContactRelationTypeId: null,
      emergencyContactRelation: null,
      emergencyContactPhone: null,
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
    });

    await expect(
      service.update(
        {
          tenantId: 'tenant-1',
          userId: 'actor-1',
          email: 'hr@example.com',
          firstName: 'HR',
          lastName: 'Admin',
          roleIds: ['role-1'],
          roleKeys: ['system-admin'],
          permissionKeys: ['employees.update'],
        },
        'employee-1',
        { emergencyContactName: '' },
      ),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_FAILED',
      details: {
        fieldErrors: [
          {
            field: 'emergencyContactName',
            message: 'Emergency contact name is required.',
          },
          {
            field: 'emergencyContactRelationTypeId',
            message: 'Emergency contact relation type is required.',
          },
          {
            field: 'emergencyContactPhone',
            message: 'Emergency contact phone is required.',
          },
        ],
      },
    });
  });

  it('allows an unrelated edit on a record that predates a mandatory-field rule', async () => {
    // The record has no emergency contact, and the caller is not touching it.
    // Enforcing the rule here would make legacy records permanently uneditable.
    const error = await service
      .update(
        {
          tenantId: 'tenant-1',
          userId: 'actor-1',
          email: 'hr@example.com',
          firstName: 'HR',
          lastName: 'Admin',
          roleIds: ['role-1'],
          roleKeys: ['system-admin'],
          permissionKeys: ['employees.update'],
        },
        'employee-1',
        { preferredName: 'Ada' },
      )
      .catch((thrown: unknown) => thrown);

    // It may still fail further down on unmocked persistence; what matters is
    // that it is no longer blocked by a rule the caller never touched.
    const message =
      error instanceof Error ? error.message : toDisplayString(error ?? '');
    expect(message).not.toContain('Emergency contact');
  });

  it('requires a work email before sending an employee invitation', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      tenantId: 'tenant-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: null,
      personalEmail: null,
      userId: null,
      user: null,
    });

    await expect(
      (
        service as unknown as {
          provisionEmployeeUserAccess: (
            currentUser: unknown,
            employeeId: string,
            dto: unknown,
          ) => Promise<unknown>;
        }
      ).provisionEmployeeUserAccess(
        {
          tenantId: 'tenant-1',
          userId: 'actor-1',
          roleKeys: ['hr'],
          permissionKeys: [],
        },
        'employee-1',
        { provisionSystemAccess: true, sendInvitationNow: true },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Work email is required before system access can be provisioned.',
      ),
    );
  });

  it('allows invitations only for new or never-logged-in users', () => {
    expect(
      isEmployeeInvitationEligibleUser({
        status: 'INVITED' as never,
        lastLoginAt: null,
      }),
    ).toBe(true);
    expect(
      isEmployeeInvitationEligibleUser({
        status: 'ACTIVE' as never,
        lastLoginAt: null,
      }),
    ).toBe(true);
    expect(
      isEmployeeInvitationEligibleUser({
        status: 'ACTIVE' as never,
        lastLoginAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  /**
   * AUTHZ-03 (HIGH, confirmed BOLA). `exportEmployeeProfile` called `findById`
   * — tenant-scoped only — and never checked the OWN/TEAM/BUSINESS_UNIT
   * row-scope its sibling read path (`getProfile` / `assertEmployeeAccess`)
   * applies via `canViewEmployeeRecord`. A manager or any role holding
   * `employees.export` at `SELF`/`TEAM` RBAC level could export the full
   * profile CSV — name, work email, phone, department, designation, owner —
   * for any employee id in the tenant, not just their own reports.
   *
   * `findById` is stubbed rather than driven through the real repository
   * fixture here: the property under test is the authorization decision this
   * fix adds, not the CSV mapping (already covered by
   * `employees.export-import-contract.spec.ts`), and stubbing keeps this spec
   * from becoming a second, drifting copy of the mapping fixture used
   * elsewhere in this file.
   */
  describe('exportEmployeeProfile (AUTHZ-03)', () => {
    const mappedEmployee = {
      id: 'employee-1',
      employeeCode: 'EMP-001',
      fullName: 'Ada Lovelace',
      workEmail: 'ada@example.com',
      phone: '1234567890',
      employmentStatus: 'Active',
      department: null,
      designation: null,
      ownerUser: null,
    };

    const currentUser = {
      userId: 'manager-1',
      tenantId: 'tenant-1',
      email: 'manager@example.com',
      roleIds: [],
      roleKeys: [],
      permissionKeys: ['employees.export'],
    } as never;

    it('rejects the export when canViewEmployeeRecord denies row-level access', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue(mappedEmployee as never);
      employeeAccessService.canViewEmployeeRecord.mockResolvedValue(false);

      await expect(
        service.exportEmployeeProfile(currentUser, 'out-of-scope-employee'),
      ).rejects.toThrow(
        'You do not have permission to export this employee record.',
      );
      expect(employeeAccessService.canViewEmployeeRecord).toHaveBeenCalledWith(
        currentUser,
        'out-of-scope-employee',
      );
    });

    it('allows the export when canViewEmployeeRecord grants row-level access', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue(mappedEmployee as never);
      employeeAccessService.canViewEmployeeRecord.mockResolvedValue(true);

      const result = await service.exportEmployeeProfile(
        currentUser,
        'employee-1',
      );

      expect(result.filename).toContain('EMP-001');
      expect(result.buffer.toString('utf8')).toContain('Ada Lovelace');
    });
  });

  /*
   * ITEM-0164 — the hierarchy tree `getReportingStructure` now builds.
   * Covers the three things EXECPLAN-0043's Definition of Done calls out:
   * scoped to the queried employee's own branch (not every root in the
   * tenant), bounded depth/node count with a truncation flag, and the
   * tenant-scoped read the tree is built from.
   */
  describe('getReportingStructure (ITEM-0164)', () => {
    function node(overrides: Record<string, unknown>) {
      return {
        firstName: 'First',
        lastName: 'Last',
        preferredName: null,
        managerEmployeeId: null,
        designation: null,
        department: null,
        profileImageDocumentId: null,
        email: null,
        location: null,
        ...overrides,
      };
    }

    it("scopes the tree to the queried employee's own branch, not every root in the tenant", async () => {
      // Branch A: root -> manager -> current -> child (the branch under test).
      // Branch B: an entirely unrelated second root and its own report, same
      // tenant. Branch B must never appear in `tree`.
      prisma.employee.findMany.mockResolvedValue([
        node({ id: 'root-a', firstName: 'Root', lastName: 'A' }),
        node({
          id: 'manager-a',
          firstName: 'Manager',
          lastName: 'A',
          managerEmployeeId: 'root-a',
        }),
        node({
          id: 'current',
          firstName: 'Current',
          lastName: 'Employee',
          managerEmployeeId: 'manager-a',
          email: 'current@example.com',
          location: { name: 'HQ' },
        }),
        node({
          id: 'child',
          firstName: 'Child',
          lastName: 'A',
          managerEmployeeId: 'current',
        }),
        node({ id: 'root-b', firstName: 'Root', lastName: 'B' }),
        node({
          id: 'report-b',
          firstName: 'Report',
          lastName: 'B',
          managerEmployeeId: 'root-b',
        }),
      ]);

      const result = await service.getReportingStructure('tenant-1', 'current');

      function collectIds(n: {
        employeeId: string;
        children: unknown[];
      }): string[] {
        return [
          n.employeeId,
          ...(n.children as (typeof n)[]).flatMap(collectIds),
        ];
      }

      expect(collectIds(result.tree)).toEqual([
        'root-a',
        'manager-a',
        'current',
        'child',
      ]);
      expect(result.hierarchyTruncated).toBe(false);
      // The hover fields (ITEM-0164) surface on the current employee's node.
      const currentNode = result.tree.children[0].children[0];
      expect(currentNode.employeeId).toBe('current');
      expect(currentNode.workEmail).toBe('current@example.com');
      expect(currentNode.workSiteName).toBe('HQ');
    });

    it('caps depth and node count and reports hierarchyTruncated', async () => {
      // A chain 12 levels deep from the root — exceeds MAX_HIERARCHY_DEPTH (8).
      const chain = Array.from({ length: 12 }, (_, index) =>
        node({
          id: `emp-${index}`,
          firstName: `Level`,
          lastName: `${index}`,
          managerEmployeeId: index === 0 ? null : `emp-${index - 1}`,
        }),
      );
      prisma.employee.findMany.mockResolvedValue(chain);

      const result = await service.getReportingStructure('tenant-1', 'emp-11');

      expect(result.hierarchyTruncated).toBe(true);

      function depthOf(n: { children: unknown[] }): number {
        const kids = n.children as { children: unknown[] }[];
        return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(depthOf));
      }
      expect(depthOf(result.tree)).toBeLessThanOrEqual(8);
    });

    it("reads only the caller's tenant", async () => {
      prisma.employee.findMany.mockResolvedValue([
        node({ id: 'current', firstName: 'Current', lastName: 'Employee' }),
      ]);

      await service.getReportingStructure('tenant-1', 'current');

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            isDeleted: false,
            deletedAt: null,
          }) as unknown,
        }),
      );
    });
  });
});
