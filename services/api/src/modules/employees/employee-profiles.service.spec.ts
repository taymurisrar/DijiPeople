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
});

function buildEmployee(
  overrides: Partial<{
    mimeType: string;
    storageKey: string | null;
  }> = {},
) {
  return {
    id: 'employee-1',
    tenantId: 'tenant-1',
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
