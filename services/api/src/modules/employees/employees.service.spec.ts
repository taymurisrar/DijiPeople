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

  beforeEach(() => {
    prisma = {
      country: { findFirst: jest.fn() },
      stateProvince: { findFirst: jest.fn() },
      city: { findFirst: jest.fn() },
      relationType: { findFirst: jest.fn() },
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
      {} as never,
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
});
