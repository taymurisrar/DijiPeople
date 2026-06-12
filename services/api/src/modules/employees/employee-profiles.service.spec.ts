import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeeProfilesService } from './employee-profiles.service';

describe('EmployeeProfilesService profile images', () => {
  const currentUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'employee@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
  };

  let service: EmployeeProfilesService;
  let employeesRepository: {
    findByIdAndTenant: jest.Mock;
  };
  let storageService: {
    openFile: jest.Mock;
    fileExists: jest.Mock;
  };
  let employeeAccessService: {
    canViewEmployeeRecord: jest.Mock;
    buildReadableEmployeeWhere: jest.Mock;
    getEmployeeRecordAccess: jest.Mock;
  };

  beforeEach(() => {
    employeesRepository = {
      findByIdAndTenant: jest.fn(),
    };
    storageService = {
      openFile: jest.fn(),
      fileExists: jest.fn(),
    };
    employeeAccessService = {
      canViewEmployeeRecord: jest.fn(),
      buildReadableEmployeeWhere: jest.fn(),
      getEmployeeRecordAccess: jest.fn(),
    };

    service = new EmployeeProfilesService(
      {} as never,
      employeesRepository as never,
      {} as never,
      storageService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      employeeAccessService as never,
      {} as never,
    );
  });

  it('returns 403 for a same-tenant employee the user cannot view', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue(buildEmployee());
    employeeAccessService.canViewEmployeeRecord.mockResolvedValue(false);

    await expect(
      service.getProfileImage(currentUser as never, 'employee-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects profile-image documents that are not images', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue(
      buildEmployee({ mimeType: 'application/pdf' }),
    );
    employeeAccessService.canViewEmployeeRecord.mockResolvedValue(true);

    await expect(
      service.getProfileImage(currentUser as never, 'employee-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('hides stale image metadata when the backing blob is missing', async () => {
    storageService.fileExists.mockResolvedValue(false);

    await expect(
      (
        service as unknown as {
          buildProfileImageSummary: (employee: unknown) => Promise<unknown>;
        }
      ).buildProfileImageSummary(buildEmployee()),
    ).resolves.toBeNull();
  });

  it('uses record-level access for an employee profile instead of list scope', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue(buildEmployee());
    employeeAccessService.canViewEmployeeRecord.mockResolvedValue(true);

    await expect(
      (
        service as unknown as {
          assertEmployeeAccess: (
            user: typeof currentUser,
            employeeId: string,
          ) => Promise<unknown>;
        }
      ).assertEmployeeAccess(currentUser, 'employee-1'),
    ).resolves.toMatchObject({ id: 'employee-1' });

    expect(employeesRepository.findByIdAndTenant).toHaveBeenCalledWith(
      'tenant-1',
      'employee-1',
      {},
    );
    expect(
      employeeAccessService.buildReadableEmployeeWhere,
    ).not.toHaveBeenCalled();
    expect(employeeAccessService.canViewEmployeeRecord).toHaveBeenCalledWith(
      currentUser,
      'employee-1',
    );
  });

  it('returns 403 when record-level employee access is denied', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue(buildEmployee());
    employeeAccessService.canViewEmployeeRecord.mockResolvedValue(false);

    await expect(
      (
        service as unknown as {
          assertEmployeeAccess: (
            user: typeof currentUser,
            employeeId: string,
          ) => Promise<unknown>;
        }
      ).assertEmployeeAccess(currentUser, 'employee-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('includes the persisted owner in the employee detail response', async () => {
    employeesRepository.findByIdAndTenant.mockResolvedValue(
      buildEmployee({
        ownerUserId: 'owner-user-id',
        ownerUser: {
          id: 'owner-user-id',
          email: 'owner@dijipeople.local',
          firstName: 'Record',
          lastName: 'Owner',
        },
      }),
    );
    employeeAccessService.canViewEmployeeRecord.mockResolvedValue(true);
    employeeAccessService.getEmployeeRecordAccess.mockResolvedValue(
      'ADMIN_MANAGE',
    );
    for (const method of [
      'listEducation',
      'listHistory',
      'listLeaveHistory',
      'listEmployeeDocuments',
      'listPreviousEmployments',
      'getCurrentCompensation',
    ]) {
      (service as unknown as Record<string, jest.Mock<Promise<unknown>>>)[
        method
      ] = jest
        .fn()
        .mockResolvedValue(method === 'getCurrentCompensation' ? null : []);
    }
    (
      service as unknown as Record<string, jest.Mock<Promise<unknown>>>
    ).buildProfileImageSummary = jest.fn().mockResolvedValue(null);

    const profile = await service.getProfile(
      currentUser as never,
      'employee-1',
    );

    expect(profile.ownerUserId).toBe('owner-user-id');
    expect(profile.ownerUser).toEqual({
      id: 'owner-user-id',
      email: 'owner@dijipeople.local',
      firstName: 'Record',
      lastName: 'Owner',
      fullName: 'Record Owner',
    });
  });
});

function buildEmployee(
  overrides: Partial<{
    mimeType: string;
    storageKey: string | null;
    ownerUserId: string;
    ownerUser: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  }> = {},
) {
  return {
    id: 'employee-1',
    tenantId: 'tenant-1',
    hireDate: new Date('2024-01-01T00:00:00.000Z'),
    dateOfBirth: null,
    ownerUserId: overrides.ownerUserId ?? null,
    ownerUser: overrides.ownerUser ?? null,
    _count: {
      directReports: 0,
      educationRecords: 0,
      historyRecords: 0,
      documentLinks: 0,
      emergencyContacts: 0,
      documentReferences: 0,
    },
    profileImageDocument: {
      id: 'document-1',
      originalFileName: 'PS Photo.jpg',
      mimeType: overrides.mimeType ?? 'image/jpeg',
      sizeInBytes: 43212,
      storageKey: overrides.storageKey ?? 'tenant-1/profile-image.jpg',
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
    },
  };
}
