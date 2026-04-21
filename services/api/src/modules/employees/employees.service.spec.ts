import { BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';

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

    service = new EmployeesService(
      prisma as never,
      employeesRepository as never,
      organizationRepository as never,
      usersRepository as never,
      rolesRepository as never,
      permissionsService as never,
      {} as never,
      auditService as never,
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
      employmentStatus: 'ACTIVE',
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
          roleKeys: ['hr'],
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
});
