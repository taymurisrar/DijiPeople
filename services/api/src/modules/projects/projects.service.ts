import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
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
    private readonly auditService: AuditService,
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
        organizationId: dto.organizationId,
        businessUnitId: dto.businessUnitId,
        customerId: dto.customerId,
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase(),
        description: dto.description?.trim(),
        timezone: normalizeTimezone(dto.timezone),
        currencyCode: normalizeCurrencyCode(dto.currencyCode),
        billingType: dto.billingType ?? 'NON_BILLABLE',
        budgetHours: dto.budgetHours
          ? new Prisma.Decimal(dto.budgetHours)
          : undefined,
        budgetAmount: dto.budgetAmount
          ? new Prisma.Decimal(dto.budgetAmount)
          : undefined,
        budgetCurrencyCode: normalizeCurrencyCode(
          dto.budgetCurrencyCode ?? dto.currencyCode,
        ),
        consumedAmount: decimalOrUndefined(dto.consumedAmount),
        burnRate: decimalOrUndefined(dto.burnRate),
        plannedHours: decimalOrUndefined(dto.plannedHours ?? dto.budgetHours),
        actualHours: decimalOrUndefined(dto.actualHours),
        remainingHours: decimalOrUndefined(dto.remainingHours),
        projectHealth: dto.projectHealth ?? 'UNKNOWN',
        riskLevel: dto.riskLevel ?? 'MEDIUM',
        priority: dto.priority ?? 'NORMAL',
        deliveryStatus: dto.deliveryStatus ?? 'NOT_STARTED',
        billingStatus: dto.billingStatus ?? 'NOT_STARTED',
        allowTimesheets: dto.allowTimesheets ?? true,
        requireApproval: dto.requireApproval ?? false,
        approvalMode: dto.approvalMode ?? 'MANAGER',
        holidayCalendarId: dto.holidayCalendarId,
        workScheduleId: dto.workScheduleId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status ?? 'PLANNING',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'project.create',
        entityType: 'Project',
        entityId: project.id,
        afterSnapshot: project,
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
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId ?? null }
            : {}),
          ...(dto.businessUnitId !== undefined
            ? { businessUnitId: dto.businessUnitId ?? null }
            : {}),
          ...(dto.customerId !== undefined
            ? { customerId: dto.customerId ?? null }
            : {}),
          ...(dto.timezone !== undefined
            ? { timezone: normalizeTimezone(dto.timezone) }
            : {}),
          ...(dto.currencyCode !== undefined
            ? { currencyCode: normalizeCurrencyCode(dto.currencyCode) }
            : {}),
          ...(dto.billingType !== undefined
            ? { billingType: dto.billingType }
            : {}),
          ...(dto.budgetHours !== undefined
            ? {
                budgetHours: dto.budgetHours
                  ? new Prisma.Decimal(dto.budgetHours)
                  : null,
              }
            : {}),
          ...(dto.budgetAmount !== undefined
            ? {
                budgetAmount: dto.budgetAmount
                  ? new Prisma.Decimal(dto.budgetAmount)
                  : null,
              }
            : {}),
          ...(dto.budgetCurrencyCode !== undefined
            ? {
                budgetCurrencyCode: normalizeCurrencyCode(
                  dto.budgetCurrencyCode,
                ),
              }
            : {}),
          ...(dto.consumedAmount !== undefined
            ? { consumedAmount: decimalOrNull(dto.consumedAmount) }
            : {}),
          ...(dto.burnRate !== undefined
            ? { burnRate: decimalOrNull(dto.burnRate) }
            : {}),
          ...(dto.plannedHours !== undefined
            ? { plannedHours: decimalOrNull(dto.plannedHours) }
            : {}),
          ...(dto.actualHours !== undefined
            ? { actualHours: decimalOrNull(dto.actualHours) }
            : {}),
          ...(dto.remainingHours !== undefined
            ? { remainingHours: decimalOrNull(dto.remainingHours) }
            : {}),
          ...(dto.projectHealth !== undefined
            ? { projectHealth: dto.projectHealth }
            : {}),
          ...(dto.riskLevel !== undefined ? { riskLevel: dto.riskLevel } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.deliveryStatus !== undefined
            ? { deliveryStatus: dto.deliveryStatus }
            : {}),
          ...(dto.billingStatus !== undefined
            ? { billingStatus: dto.billingStatus }
            : {}),
          ...(dto.allowTimesheets !== undefined
            ? { allowTimesheets: dto.allowTimesheets }
            : {}),
          ...(dto.requireApproval !== undefined
            ? { requireApproval: dto.requireApproval }
            : {}),
          ...(dto.approvalMode !== undefined
            ? { approvalMode: dto.approvalMode }
            : {}),
          ...(dto.holidayCalendarId !== undefined
            ? { holidayCalendarId: dto.holidayCalendarId ?? null }
            : {}),
          ...(dto.workScheduleId !== undefined
            ? { workScheduleId: dto.workScheduleId ?? null }
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

      const updated = await this.findById(currentUser.tenantId, projectId);
      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'project.update',
        entityType: 'Project',
        entityId: projectId,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });
      return updated;
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
    validateAssignment(dto, project.startDate, project.endDate);

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
      await this.assertAllocationWithinCapacity(
        currentUser.tenantId,
        dto.employeeId,
        projectId,
        dto,
      );
      await this.projectsRepository.updateAssignment(
        currentUser.tenantId,
        existing.id,
        {
          projectRoleId: dto.projectRoleId ?? null,
          roleOnProject: dto.roleOnProject?.trim() ?? null,
          allocationPercent: dto.allocationPercent ?? null,
          allocationHours: dto.allocationHours
            ? new Prisma.Decimal(dto.allocationHours)
            : null,
          allocationType: dto.allocationType ?? 'PERCENTAGE',
          billableFlag: dto.billableFlag ?? existing.billableFlag,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          approvalManagerEmployeeId: dto.approvalManagerEmployeeId ?? null,
          status: dto.status ?? existing.status,
          currencyCode: normalizeCurrencyCode(dto.currencyCode),
          updatedById: currentUser.userId,
        },
      );
    } else {
      await this.assertAllocationWithinCapacity(
        currentUser.tenantId,
        dto.employeeId,
        projectId,
        dto,
      );
      await this.projectsRepository.createAssignment({
        tenantId: currentUser.tenantId,
        projectId,
        employeeId: dto.employeeId,
        projectRoleId: dto.projectRoleId,
        roleOnProject: dto.roleOnProject?.trim(),
        allocationPercent: dto.allocationPercent,
        allocationHours: dto.allocationHours
          ? new Prisma.Decimal(dto.allocationHours)
          : undefined,
        allocationType: dto.allocationType ?? 'PERCENTAGE',
        billableFlag: dto.billableFlag ?? false,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        approvalManagerEmployeeId: dto.approvalManagerEmployeeId,
        status: dto.status ?? 'ACTIVE',
        currencyCode: normalizeCurrencyCode(dto.currencyCode),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    }

    const updated = await this.findById(currentUser.tenantId, projectId);
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: existing ? 'project-allocation.update' : 'project-allocation.create',
      entityType: 'ProjectAssignment',
      entityId: existing?.id ?? projectId,
      beforeSnapshot: existing,
      afterSnapshot: updated.assignedEmployees.find(
        (assignment) => assignment.employeeId === dto.employeeId,
      ),
    });
    return updated;
  }

  async findProjectTimesheets(tenantId: string, projectId: string) {
    const project = await this.projectsRepository.findById(tenantId, projectId);
    if (!project) {
      throw new NotFoundException('Project was not found for this tenant.');
    }

    return this.projectsRepository.findTimesheetEntriesForProject(
      tenantId,
      projectId,
    );
  }

  private mapProject(project: ProjectWithRelations) {
    return {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      code: project.code,
      description: project.description,
      organizationId: project.organizationId,
      businessUnit: project.businessUnit,
      customer: project.customer,
      timezone: project.timezone,
      currencyCode: project.currencyCode,
      billingType: project.billingType,
      budgetHours: project.budgetHours ? Number(project.budgetHours) : null,
      budgetAmount: project.budgetAmount ? Number(project.budgetAmount) : null,
      budgetCurrencyCode: project.budgetCurrencyCode,
      consumedAmount: project.consumedAmount
        ? Number(project.consumedAmount)
        : null,
      burnRate: project.burnRate ? Number(project.burnRate) : null,
      plannedHours: project.plannedHours
        ? Number(project.plannedHours)
        : project.budgetHours
          ? Number(project.budgetHours)
          : null,
      actualHours: project.actualHours ? Number(project.actualHours) : null,
      remainingHours: project.remainingHours
        ? Number(project.remainingHours)
        : null,
      projectHealth: project.projectHealth,
      riskLevel: project.riskLevel,
      priority: project.priority,
      deliveryStatus: project.deliveryStatus,
      billingStatus: project.billingStatus,
      allowTimesheets: project.allowTimesheets,
      requireApproval: project.requireApproval,
      approvalMode: project.approvalMode,
      holidayCalendarId: project.holidayCalendarId,
      workScheduleId: project.workScheduleId,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      assignedEmployees: project.assignments.map((assignment) => ({
        id: assignment.id,
        employeeId: assignment.employeeId,
        projectRoleId: assignment.projectRoleId,
        projectRole: assignment.projectRole,
        roleOnProject: assignment.roleOnProject,
        allocationPercent: assignment.allocationPercent,
        allocationHours: assignment.allocationHours
          ? Number(assignment.allocationHours)
          : null,
        allocationType: assignment.allocationType,
        billableFlag: assignment.billableFlag,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        status: assignment.status,
        currencyCode: assignment.currencyCode,
        utilizationWarning:
          assignment.allocationType === 'PERCENTAGE' &&
          (assignment.allocationPercent ?? 0) > 100
            ? 'Allocation exceeds 100%.'
            : null,
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
      financials: {
        budgetAmount: project.budgetAmount ? Number(project.budgetAmount) : null,
        consumedAmount: project.consumedAmount
          ? Number(project.consumedAmount)
          : null,
        burnRate: project.burnRate ? Number(project.burnRate) : null,
        plannedHours: project.plannedHours
          ? Number(project.plannedHours)
          : project.budgetHours
            ? Number(project.budgetHours)
            : null,
        actualHours: project.actualHours ? Number(project.actualHours) : null,
        remainingHours: project.remainingHours
          ? Number(project.remainingHours)
          : null,
      },
    };
  }

  private async assertAllocationWithinCapacity(
    tenantId: string,
    employeeId: string,
    projectId: string,
    dto: AssignProjectEmployeeDto,
  ) {
    if ((dto.allocationType ?? 'PERCENTAGE') !== 'PERCENTAGE') return;
    const allocationPercent = dto.allocationPercent ?? 0;
    if (allocationPercent > 100) {
      throw new BadRequestException('Allocation percentage cannot exceed 100%.');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const overlapping = await this.projectsRepository.findActiveAssignmentsForEmployee(
      tenantId,
      employeeId,
      { projectIdToExclude: projectId, startDate, endDate },
    );
    const totalPercent =
      allocationPercent +
      overlapping.reduce(
        (sum, assignment) => sum + (assignment.allocationPercent ?? 0),
        0,
      );
    if (totalPercent > 100) {
      throw new BadRequestException(
        `Employee would be over-allocated at ${totalPercent}%.`,
      );
    }
  }
}

function decimalOrUndefined(value?: string | null) {
  return value ? new Prisma.Decimal(value) : undefined;
}

function decimalOrNull(value?: string | null) {
  return value ? new Prisma.Decimal(value) : null;
}

function normalizeTimezone(value?: string | null) {
  if (!value?.trim()) return null;
  const timezone = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    throw new BadRequestException('Project timezone must be a valid IANA timezone ID.');
  }
}

function normalizeCurrencyCode(value?: string | null) {
  if (!value?.trim()) return null;
  const currencyCode = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new BadRequestException('Currency code must be a valid ISO 4217 code.');
  }
  try {
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(1);
    return currencyCode;
  } catch {
    throw new BadRequestException('Currency code must be a valid ISO 4217 code.');
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

function validateAssignment(
  dto: AssignProjectEmployeeDto,
  projectStartDate?: Date | null,
  projectEndDate?: Date | null,
) {
  if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
    throw new BadRequestException(
      'Project resource end date cannot be earlier than start date.',
    );
  }

  const allocationType = dto.allocationType ?? 'PERCENTAGE';
  if (allocationType === 'PERCENTAGE' && !dto.allocationPercent) {
    throw new BadRequestException('Allocation percentage is required.');
  }

  if (allocationType === 'HOURS' && !dto.allocationHours) {
    throw new BadRequestException('Allocation hours are required.');
  }

  const resourceStart = dto.startDate ? new Date(dto.startDate) : null;
  const resourceEnd = dto.endDate ? new Date(dto.endDate) : null;

  if (resourceStart && projectStartDate && resourceStart < projectStartDate) {
    throw new BadRequestException(
      'Resource allocation cannot start before the project start date.',
    );
  }

  if (resourceEnd && projectEndDate && resourceEnd > projectEndDate) {
    throw new BadRequestException(
      'Resource allocation cannot end after the project end date.',
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
