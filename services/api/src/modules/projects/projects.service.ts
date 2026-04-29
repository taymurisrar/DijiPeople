import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { EmployeesRepository } from '../employees/employees.repository';
import { AssignProjectEmployeeDto } from './dto/assign-project-employee.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ProjectWithRelations,
  ProjectsRepository,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly employeesRepository: EmployeesRepository,
  ) {}

  async findByTenant(tenantId: string, query: ProjectQueryDto) {
    const { items, total } = await this.projectsRepository.findByTenant(
      tenantId,
      query,
    );

    return {
      items: items.map((project) => this.mapProject(project)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        search: query.search ?? null,
        status: query.status ?? null,
      },
    };
  }

  async findAssignedProjectsForCurrentUser(currentUser: AuthenticatedUser) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    return this.projectsRepository.findActiveAssignedProjectsForEmployee(
      currentUser.tenantId,
      employee.id,
    );
  }

  async findById(tenantId: string, projectId: string) {
    const project = await this.projectsRepository.findById(tenantId, projectId);

    if (!project) {
      throw new NotFoundException('Project was not found for this tenant.');
    }

    return this.mapProject(project);
  }

  findAssignedProjectsForEmployee(tenantId: string, employeeId: string) {
    return this.projectsRepository.findActiveAssignedProjectsForEmployee(
      tenantId,
      employeeId,
    );
  }

  async create(currentUser: AuthenticatedUser, dto: CreateProjectDto) {
    validateProjectDates(dto.startDate, dto.endDate);

    try {
      const project = await this.projectsRepository.create({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase(),
        description: dto.description?.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status ?? 'PLANNING',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapProject(project);
    } catch (error) {
      handleProjectWriteError(error);
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    projectId: string,
    dto: UpdateProjectDto,
  ) {
    const existing = await this.projectsRepository.findById(
      currentUser.tenantId,
      projectId,
    );

    if (!existing) {
      throw new NotFoundException('Project was not found for this tenant.');
    }

    validateProjectDates(
      dto.startDate ?? existing.startDate?.toISOString(),
      dto.endDate ?? existing.endDate?.toISOString(),
    );

    try {
      const result = await this.projectsRepository.update(
        currentUser.tenantId,
        projectId,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code?.trim().toUpperCase() ?? null }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() ?? null }
            : {}),
          ...(dto.startDate !== undefined
            ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
            : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedById: currentUser.userId,
        },
      );

      if (result.count === 0) {
        throw new NotFoundException('Project was not found for this tenant.');
      }

      return this.findById(currentUser.tenantId, projectId);
    } catch (error) {
      handleProjectWriteError(error);
    }
  }

  async assignEmployee(
    currentUser: AuthenticatedUser,
    projectId: string,
    dto: AssignProjectEmployeeDto,
  ) {
    const project = await this.projectsRepository.findById(
      currentUser.tenantId,
      projectId,
    );

    if (!project) {
      throw new NotFoundException('Project was not found for this tenant.');
    }

    const employee =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        currentUser.tenantId,
        dto.employeeId,
      );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }

    const existing = await this.projectsRepository.findAssignment(
      currentUser.tenantId,
      projectId,
      dto.employeeId,
    );

    if (existing) {
      await this.projectsRepository.updateAssignment(
        currentUser.tenantId,
        existing.id,
        {
          roleOnProject: dto.roleOnProject?.trim() ?? null,
          allocationPercent: dto.allocationPercent ?? null,
          billableFlag: dto.billableFlag ?? existing.billableFlag,
          updatedById: currentUser.userId,
        },
      );
    } else {
      await this.projectsRepository.createAssignment({
        tenantId: currentUser.tenantId,
        projectId,
        employeeId: dto.employeeId,
        roleOnProject: dto.roleOnProject?.trim(),
        allocationPercent: dto.allocationPercent,
        billableFlag: dto.billableFlag ?? false,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    }

    return this.findById(currentUser.tenantId, projectId);
  }

  private mapProject(project: ProjectWithRelations) {
    return {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      code: project.code,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      assignedEmployees: project.assignments.map((assignment) => ({
        id: assignment.id,
        employeeId: assignment.employeeId,
        roleOnProject: assignment.roleOnProject,
        allocationPercent: assignment.allocationPercent,
        billableFlag: assignment.billableFlag,
        employee: {
          id: assignment.employee.id,
          employeeCode: assignment.employee.employeeCode,
          firstName: assignment.employee.firstName,
          lastName: assignment.employee.lastName,
          preferredName: assignment.employee.preferredName,
          fullName: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
          department: assignment.employee.department,
          designation: assignment.employee.designation,
        },
      })),
    };
  }
}

function validateProjectDates(
  startDate?: string | null,
  endDate?: string | null,
) {
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new BadRequestException(
      'Project end date cannot be earlier than start date.',
    );
  }
}

function handleProjectWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'Project name or code is already in use for this tenant.',
    );
  }

  throw error;
}
