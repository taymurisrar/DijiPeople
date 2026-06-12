import { NotFoundException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ProjectsService } from './projects.service';

describe('ProjectsService scoped reads', () => {
  const projectsRepository = {
    findById: jest.fn(),
    findByTenant: jest.fn(),
  };
  const employeesRepository = {
    findByUserIdAndTenant: jest.fn(),
  };
  const auditService = {};
  let service: ProjectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectsService(
      projectsRepository as never,
      employeesRepository as never,
      auditService as never,
    );
  });

  it('limits self-service reads to created or actively assigned projects', async () => {
    const user = buildUser(SecurityAccessLevel.SELF);
    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'employee-1',
    });
    projectsRepository.findById.mockResolvedValue(null);

    await expect(service.findByIdForUser(user, 'project-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(projectsRepository.findById).toHaveBeenCalledWith(
      user.tenantId,
      'project-1',
      {
        OR: [
          { createdById: user.userId },
          {
            assignments: {
              some: {
                employeeId: 'employee-1',
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
    );
  });

  it('keeps tenant-level project reads unrestricted', async () => {
    const user = buildUser(SecurityAccessLevel.TENANT);
    projectsRepository.findById.mockResolvedValue(null);

    await expect(service.findByIdForUser(user, 'project-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(projectsRepository.findById).toHaveBeenCalledWith(
      user.tenantId,
      'project-1',
      {},
    );
    expect(employeesRepository.findByUserIdAndTenant).not.toHaveBeenCalled();
  });
});

function buildUser(accessLevel: SecurityAccessLevel): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roleIds: ['role-1'],
    roleKeys: ['employee'],
    permissionKeys: ['projects.read'],
    rolePrivileges: [
      {
        entityKey: 'projects',
        privilege: SecurityPrivilege.READ,
        accessLevel,
        roleId: 'role-1',
      },
    ],
  };
}
