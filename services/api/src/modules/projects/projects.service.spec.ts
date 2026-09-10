import { NotFoundException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppError } from '../../common/errors/app-error';
import { ProjectsService } from './projects.service';

describe('ProjectsService scoped reads', () => {
  const projectsRepository = {
    findById: jest.fn(),
    findByTenant: jest.fn(),
    countDependents: jest.fn(),
    delete: jest.fn(),
  };
  const employeesRepository = {
    findByUserIdAndTenant: jest.fn(),
  };
  const auditService = { log: jest.fn() };
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

/*
 * BUG-2007 - projects can now be deleted, tenant-scoped and refused when
 * dependent data exists rather than cascading away assignment, timesheet or
 * cost-allocation history silently.
 */
describe('ProjectsService.remove', () => {
  const projectsRepository = {
    findById: jest.fn(),
    countDependents: jest.fn(),
    delete: jest.fn(),
  };
  const employeesRepository = {};
  const auditService = { log: jest.fn() };
  let service: ProjectsService;
  const user = buildUser(SecurityAccessLevel.TENANT);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectsService(
      projectsRepository as never,
      employeesRepository as never,
      auditService as never,
    );
  });

  it('refuses when the project was not found for this tenant', async () => {
    projectsRepository.findById.mockResolvedValue(null);

    await expect(service.remove(user, 'project-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(projectsRepository.countDependents).not.toHaveBeenCalled();
    expect(projectsRepository.delete).not.toHaveBeenCalled();
  });

  it('refuses with a reasoned error when dependent data exists, instead of cascading', async () => {
    projectsRepository.findById.mockResolvedValue({ id: 'project-1' });
    projectsRepository.countDependents.mockResolvedValue({
      assignments: 2,
      timesheetEntries: 0,
      payrollCostAllocationLines: 0,
    });

    const error: unknown = await service
      .remove(user, 'project-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).errorCode).toBe('PROJECT_DELETE_HAS_DEPENDENTS');
    expect(projectsRepository.delete).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('deletes and audits when nothing depends on the project', async () => {
    const existing = { id: 'project-1', name: 'Atlas' };
    projectsRepository.findById.mockResolvedValue(existing);
    projectsRepository.countDependents.mockResolvedValue({
      assignments: 0,
      timesheetEntries: 0,
      payrollCostAllocationLines: 0,
    });
    projectsRepository.delete.mockResolvedValue({ count: 1 });

    const result = await service.remove(user, 'project-1');

    expect(result).toEqual({ success: true });
    expect(projectsRepository.delete).toHaveBeenCalledWith(
      user.tenantId,
      'project-1',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: user.tenantId,
        action: 'PROJECT_DELETED',
        entityType: 'Project',
        entityId: 'project-1',
        beforeSnapshot: existing,
        afterSnapshot: null,
      }),
    );
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
