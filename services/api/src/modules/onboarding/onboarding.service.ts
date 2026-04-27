import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingStatus,
  OnboardingTaskStatus,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationRepository } from '../organization/organization.repository';
import { RecruitmentRepository } from '../recruitment/recruitment.repository';
import { UsersRepository } from '../users/users.repository';
import { CreateEmployeeOnboardingDto } from './dto/create-employee-onboarding.dto';
import { CreateOnboardingTemplateDto } from './dto/create-onboarding-template.dto';
import { OnboardingQueryDto } from './dto/onboarding-query.dto';
import { OnboardingTaskBlueprintDto } from './dto/onboarding-task-blueprint.dto';
import { UpdateOnboardingTaskDto } from './dto/update-onboarding-task.dto';
import { UpdateOnboardingTemplateDto } from './dto/update-onboarding-template.dto';
import {
  EmployeeOnboardingWithRelations,
  OnboardingRepository,
} from './onboarding.repository';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly recruitmentRepository: RecruitmentRepository,
    private readonly usersRepository: UsersRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findTemplates(tenantId: string) {
    const templates = await this.onboardingRepository.findTemplates(tenantId);

    return templates.map((template) => ({
      id: template.id,
      tenantId: template.tenantId,
      name: template.name,
      description: template.description,
      taskBlueprints: template.taskBlueprints,
      isDefault: template.isDefault,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));
  }

  async createTemplate(
    currentUser: AuthenticatedUser,
    dto: CreateOnboardingTemplateDto,
  ) {
    await this.validateTaskBlueprintUsers(currentUser.tenantId, dto.taskBlueprints);

    try {
      if (dto.isDefault) {
        await this.clearDefaultTemplates(currentUser.tenantId);
      }

      const template = await this.onboardingRepository.createTemplate({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        taskBlueprints: dto.taskBlueprints as unknown as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return {
        id: template.id,
        tenantId: template.tenantId,
        name: template.name,
        description: template.description,
        taskBlueprints: template.taskBlueprints,
        isDefault: template.isDefault,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };
    } catch (error) {
      this.handleTemplateWriteError(error);
    }
  }

  async updateTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: UpdateOnboardingTemplateDto,
  ) {
    const existing = await this.onboardingRepository.findTemplateById(
      currentUser.tenantId,
      templateId,
    );

    if (!existing) {
      throw new NotFoundException(
        'Onboarding template was not found for this tenant.',
      );
    }

    if (dto.taskBlueprints) {
      await this.validateTaskBlueprintUsers(
        currentUser.tenantId,
        dto.taskBlueprints,
      );
    }

    try {
      if (dto.isDefault) {
        await this.clearDefaultTemplates(currentUser.tenantId, templateId);
      }

      await this.onboardingRepository.updateTemplate(
        currentUser.tenantId,
        templateId,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() ?? null }
            : {}),
          ...(dto.taskBlueprints !== undefined
            ? {
                taskBlueprints:
                  dto.taskBlueprints as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: currentUser.userId,
        },
      );

      return this.findTemplates(currentUser.tenantId);
    } catch (error) {
      this.handleTemplateWriteError(error);
    }
  }

  async findOnboardings(tenantId: string, query: OnboardingQueryDto) {
    const { items, total } = await this.onboardingRepository.findOnboardings(
      tenantId,
      query,
    );

    return {
      items: items.map((item) => this.mapOnboarding(item)),
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

  async findOnboardingById(tenantId: string, onboardingId: string) {
    const onboarding = await this.onboardingRepository.findOnboardingById(
      tenantId,
      onboardingId,
    );

    if (!onboarding) {
      throw new NotFoundException('Onboarding record was not found for this tenant.');
    }

    return this.mapOnboarding(onboarding);
  }

  async createFromCandidate(
    currentUser: AuthenticatedUser,
    dto: CreateEmployeeOnboardingDto,
  ) {
    const candidate = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      dto.candidateId,
    );

    if (!candidate) {
      throw new BadRequestException(
        'Selected candidate does not belong to this tenant.',
      );
    }

    if (!['APPROVED', 'HIRED'].includes(candidate.currentStatus)) {
      throw new BadRequestException(
        'Only approved or hired candidates can be moved into onboarding.',
      );
    }

    const existing = await this.onboardingRepository.findActiveOnboardingByCandidate(
      currentUser.tenantId,
      dto.candidateId,
    );

    if (existing) {
      throw new ConflictException(
        'This candidate already has an active onboarding record.',
      );
    }

    const template = dto.templateId
      ? await this.onboardingRepository.findTemplateById(
          currentUser.tenantId,
          dto.templateId,
        )
      : (await this.onboardingRepository.findTemplates(currentUser.tenantId)).find(
          (item) => item.isDefault && item.isActive,
        ) ?? null;

    if (dto.templateId && !template) {
      throw new BadRequestException(
        'Selected onboarding template does not belong to this tenant.',
      );
    }

    const taskBlueprints = Array.isArray(template?.taskBlueprints)
      ? (template.taskBlueprints as unknown as OnboardingTaskBlueprintDto[])
      : [];

    await this.validateTaskBlueprintUsers(currentUser.tenantId, taskBlueprints);

    await this.validateOrgReferences(
      currentUser.tenantId,
      dto.departmentId,
      dto.designationId,
      dto.locationId,
      dto.reportingManagerEmployeeId,
    );

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const onboardingId = await this.prisma.$transaction(async (tx) => {
      const onboarding = await this.onboardingRepository.createOnboarding(
        {
          tenantId: currentUser.tenantId,
          candidateId: candidate.id,
          templateId: template?.id,
          title:
            dto.title?.trim() ??
            `${candidate.firstName} ${candidate.lastName} onboarding`,
          status: 'NOT_STARTED',
          ownerUserId: dto.ownerUserId,
          startDate,
          dueDate,
          plannedJoiningDate: dto.plannedJoiningDate
            ? new Date(dto.plannedJoiningDate)
            : dto.hireDate
              ? new Date(dto.hireDate)
              : null,
          targetDepartmentId: dto.departmentId,
          targetDesignationId: dto.designationId,
          targetLocationId: dto.locationId,
          targetReportingManagerEmployeeId: dto.reportingManagerEmployeeId,
          targetWorkEmail: dto.workEmail?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      const generatedBlueprints =
        taskBlueprints.length > 0
          ? taskBlueprints
          : buildDefaultChecklistBlueprints(dto.ownerUserId);

      if (generatedBlueprints.length > 0) {
        await this.onboardingRepository.createTasks(
          generatedBlueprints.map((blueprint, index) => ({
            tenantId: currentUser.tenantId,
            employeeOnboardingId: onboarding.id,
            code: slugifyTaskCode(blueprint.title),
            checklistGroup: inferChecklistGroup(blueprint.title),
            title: blueprint.title.trim(),
            description: blueprint.description?.trim(),
            assignedUserId: blueprint.assignedUserId,
            dueDate:
              blueprint.dueOffsetDays !== undefined
                ? addDays(startDate, blueprint.dueOffsetDays)
                : dueDate ?? undefined,
            isRequired: true,
            sortOrder: index,
            createdById: currentUser.userId,
            updatedById: currentUser.userId,
          })),
          tx,
        );
      }

      return onboarding.id;
    });

    return this.findOnboardingById(currentUser.tenantId, onboardingId);
  }

  async updateTask(
    currentUser: AuthenticatedUser,
    onboardingId: string,
    taskId: string,
    dto: UpdateOnboardingTaskDto,
  ) {
    const onboarding = await this.onboardingRepository.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (!onboarding) {
      throw new NotFoundException('Onboarding record was not found for this tenant.');
    }

    const task = await this.onboardingRepository.findTaskById(
      currentUser.tenantId,
      onboardingId,
      taskId,
    );

    if (!task) {
      throw new NotFoundException('Onboarding task was not found for this record.');
    }

    if (dto.assignedUserId) {
      const assignedUser = await this.usersRepository.findByIdWithAccess(
        dto.assignedUserId,
      );

      if (!assignedUser || assignedUser.tenantId !== currentUser.tenantId) {
        throw new BadRequestException(
          'Assigned task user does not belong to this tenant.',
        );
      }
    }

    const status = dto.status ?? task.status;
    const completedAt =
      status === OnboardingTaskStatus.COMPLETED
        ? task.completedAt ?? new Date()
        : dto.status && dto.status !== OnboardingTaskStatus.COMPLETED
          ? null
          : task.completedAt;

    await this.onboardingRepository.updateTask(
      currentUser.tenantId,
      onboardingId,
      taskId,
      {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.assignedUserId !== undefined
          ? { assignedUserId: dto.assignedUserId ?? null }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        completedAt,
        updatedById: currentUser.userId,
      },
    );

    const refreshed = await this.onboardingRepository.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (!refreshed) {
      throw new NotFoundException('Onboarding record was not found for this tenant.');
    }

    await this.syncOnboardingStatus(currentUser.tenantId, onboardingId, refreshed);

    return this.findOnboardingById(currentUser.tenantId, onboardingId);
  }

  async convertToEmployee(
    currentUser: AuthenticatedUser,
    onboardingId: string,
  ) {
    const onboarding = await this.onboardingRepository.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (!onboarding) {
      throw new NotFoundException('Onboarding record was not found for this tenant.');
    }

    if (onboarding.employeeId) {
      throw new ConflictException('This onboarding record already has an employee.');
    }

    if (!onboarding.candidate) {
      throw new BadRequestException(
        'Only candidate-backed onboarding records can be converted.',
      );
    }

    const requiredIncompleteTasks = onboarding.tasks.filter(
      (task) => task.isRequired && task.status !== OnboardingTaskStatus.COMPLETED,
    );

    if (requiredIncompleteTasks.length > 0) {
      throw new BadRequestException(
        'Complete all required onboarding checklist items before converting to employee.',
      );
    }

    const candidate = onboarding.candidate;

    if (!candidate) {
      throw new BadRequestException(
        'Candidate details are required before conversion can continue.',
      );
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      const existingDraft = await tx.employee.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          sourceCandidateId: candidate.id,
          isDraftProfile: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      });

      const employeeCode =
        existingDraft?.employeeCode ?? candidate.id.slice(0, 8).toUpperCase();

      const created = existingDraft
        ? await tx.employee.update({
            where: { id: existingDraft.id },
            data: {
              firstName: candidate.firstName,
              middleName: candidate.middleName,
              lastName: candidate.lastName,
              email: onboarding.targetWorkEmail ?? candidate.email,
              phone: candidate.phone,
              dateOfBirth: candidate.dateOfBirth,
              gender: candidate.gender,
              nationalityCountryId: candidate.nationalityCountryId,
              nationality: candidate.nationality,
              countryId: candidate.currentCountryId,
              stateProvinceId: candidate.currentStateProvinceId,
              cityId: candidate.currentCityId,
              country: candidate.currentCountry,
              stateProvince: candidate.currentStateProvince,
              city: candidate.currentCity,
              hireDate: onboarding.plannedJoiningDate ?? new Date(),
              departmentId: onboarding.targetDepartmentId,
              designationId: onboarding.targetDesignationId,
              locationId: onboarding.targetLocationId,
              managerEmployeeId: onboarding.targetReportingManagerEmployeeId,
              employmentStatus: 'ACTIVE',
              isDraftProfile: false,
              updatedById: currentUser.userId,
            },
          })
        : await tx.employee.create({
            data: {
              tenantId: currentUser.tenantId,
              employeeCode,
              firstName: candidate.firstName,
              middleName: candidate.middleName,
              lastName: candidate.lastName,
              email: onboarding.targetWorkEmail ?? candidate.email,
              phone: candidate.phone,
              dateOfBirth: candidate.dateOfBirth,
              gender: candidate.gender,
              nationalityCountryId: candidate.nationalityCountryId,
              nationality: candidate.nationality,
              countryId: candidate.currentCountryId,
              stateProvinceId: candidate.currentStateProvinceId,
              cityId: candidate.currentCityId,
              country: candidate.currentCountry,
              stateProvince: candidate.currentStateProvince,
              city: candidate.currentCity,
              hireDate: onboarding.plannedJoiningDate ?? new Date(),
              departmentId: onboarding.targetDepartmentId,
              designationId: onboarding.targetDesignationId,
              locationId: onboarding.targetLocationId,
              managerEmployeeId: onboarding.targetReportingManagerEmployeeId,
              employmentStatus: 'ACTIVE',
              isDraftProfile: false,
              sourceCandidateId: candidate.id,
              createdById: currentUser.userId,
              updatedById: currentUser.userId,
            },
          });

      await this.onboardingRepository.updateOnboarding(
        currentUser.tenantId,
        onboardingId,
        {
          employeeId: created.id,
          status: OnboardingStatus.COMPLETED,
          completedAt: new Date(),
          readyForConversionAt: onboarding.readyForConversionAt ?? new Date(),
          updatedById: currentUser.userId,
        },
        tx,
      );

      return created;
    });

    return {
      employeeId: employee.id,
      onboarding: await this.findOnboardingById(currentUser.tenantId, onboardingId),
    };
  }

  private async clearDefaultTemplates(tenantId: string, keepId?: string) {
    const templates = await this.onboardingRepository.findTemplates(tenantId);

    await Promise.all(
      templates
        .filter((template) => template.isDefault && template.id !== keepId)
        .map((template) =>
          this.onboardingRepository.updateTemplate(tenantId, template.id, {
            isDefault: false,
          }),
        ),
    );
  }

  private async validateTaskBlueprintUsers(
    tenantId: string,
    taskBlueprints: OnboardingTaskBlueprintDto[],
  ) {
    for (const blueprint of taskBlueprints) {
      if (!blueprint.assignedUserId) {
        continue;
      }

      const user = await this.usersRepository.findByIdWithAccess(
        blueprint.assignedUserId,
      );

      if (!user || user.tenantId !== tenantId) {
        throw new BadRequestException(
          'Task assignee does not belong to this tenant.',
        );
      }
    }
  }

  private async validateOrgReferences(
    tenantId: string,
    departmentId?: string,
    designationId?: string,
    locationId?: string,
    reportingManagerEmployeeId?: string,
  ) {
    if (departmentId) {
      const department = await this.organizationRepository.findDepartmentById(
        tenantId,
        departmentId,
      );

      if (!department) {
        throw new BadRequestException(
          'Selected department does not belong to this tenant.',
        );
      }
    }

    if (designationId) {
      const designation = await this.organizationRepository.findDesignationById(
        tenantId,
        designationId,
      );

      if (!designation) {
        throw new BadRequestException(
          'Selected designation does not belong to this tenant.',
        );
      }
    }

    if (locationId) {
      const location = await this.organizationRepository.findLocationById(
        tenantId,
        locationId,
      );

      if (!location) {
        throw new BadRequestException(
          'Selected location does not belong to this tenant.',
        );
      }
    }

    if (reportingManagerEmployeeId) {
      const reportingManager = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          id: reportingManagerEmployeeId,
        },
        select: { id: true },
      });

      if (!reportingManager) {
        throw new BadRequestException(
          'Selected reporting manager does not belong to this tenant.',
        );
      }
    }
  }

  private async syncOnboardingStatus(
    tenantId: string,
    onboardingId: string,
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    const requiredTasks = onboarding.tasks.filter((task) => task.isRequired);
    const completedRequiredTasks = requiredTasks.filter(
      (task) => task.status === OnboardingTaskStatus.COMPLETED,
    );
    const blockedTaskExists = onboarding.tasks.some(
      (task) => task.status === OnboardingTaskStatus.CANCELLED,
    );

    const readyForConversion = this.isReadyForConversion(onboarding);
    let status = onboarding.status;
    let completedAt = onboarding.completedAt;
    let readyForConversionAt = onboarding.readyForConversionAt;

    if (
      onboarding.status !== OnboardingStatus.CANCELLED &&
      onboarding.status !== OnboardingStatus.COMPLETED
    ) {
      if (blockedTaskExists) {
        status = OnboardingStatus.BLOCKED;
        completedAt = null;
      } else if (readyForConversion) {
        status = OnboardingStatus.READY_FOR_CONVERSION;
        completedAt = null;
        readyForConversionAt = onboarding.readyForConversionAt ?? new Date();
      } else if (completedRequiredTasks.length > 0 || onboarding.tasks.length > 0) {
        status = OnboardingStatus.IN_PROGRESS;
        completedAt = null;
        readyForConversionAt = null;
      } else {
        status = OnboardingStatus.NOT_STARTED;
        completedAt = null;
        readyForConversionAt = null;
      }
    }

    if (
      status !== onboarding.status ||
      completedAt !== onboarding.completedAt ||
      readyForConversionAt !== onboarding.readyForConversionAt
    ) {
      await this.onboardingRepository.updateOnboarding(tenantId, onboardingId, {
        status,
        completedAt,
        readyForConversionAt,
      });
    }
  }

  private isReadyForConversion(onboarding: EmployeeOnboardingWithRelations) {
    return this.getOnboardingReadinessBlockers(onboarding).length === 0;
  }

  private getOnboardingReadinessBlockers(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    const blockers: string[] = [];
    const requiredTasks = onboarding.tasks.filter((task) => task.isRequired);
    const incompleteRequiredTasks = requiredTasks.filter(
      (task) => task.status !== OnboardingTaskStatus.COMPLETED,
    );

    if (!onboarding.candidate) {
      blockers.push('Candidate link is missing.');
    }

    if (incompleteRequiredTasks.length > 0) {
      blockers.push('Required onboarding checklist items are still incomplete.');
    }

    if (!onboarding.targetDepartmentId) {
      blockers.push('Department is not assigned.');
    }

    if (!onboarding.targetDesignationId) {
      blockers.push('Designation is not assigned.');
    }

    if (!onboarding.targetReportingManagerEmployeeId) {
      blockers.push('Reporting manager is not assigned.');
    }

    if (!isTruthyString(onboarding.targetWorkEmail)) {
      blockers.push('Work email is not prepared.');
    }

    if (!onboarding.plannedJoiningDate) {
      blockers.push('Joining date is not confirmed.');
    }

    if (onboarding.employeeId) {
      blockers.push('Employee has already been created.');
    }

    return blockers;
  }

  private mapOnboarding(onboarding: EmployeeOnboardingWithRelations) {
    const completedTasks = onboarding.tasks.filter(
      (task) => task.status === OnboardingTaskStatus.COMPLETED,
    ).length;
    const requiredTasks = onboarding.tasks.filter((task) => task.isRequired);
    const completedRequiredTasks = requiredTasks.filter(
      (task) => task.status === OnboardingTaskStatus.COMPLETED,
    ).length;

    return {
      id: onboarding.id,
      tenantId: onboarding.tenantId,
      candidateId: onboarding.candidateId,
      employeeId: onboarding.employeeId,
      templateId: onboarding.templateId,
      title: onboarding.title,
      status: onboarding.status,
      ownerUserId: onboarding.ownerUserId,
      startDate: onboarding.startDate,
      dueDate: onboarding.dueDate,
      completedAt: onboarding.completedAt,
      plannedJoiningDate: onboarding.plannedJoiningDate,
      readyForConversionAt: onboarding.readyForConversionAt,
      targetWorkEmail: onboarding.targetWorkEmail,
      notes: onboarding.notes,
      createdAt: onboarding.createdAt,
      updatedAt: onboarding.updatedAt,
      candidate: onboarding.candidate
        ? {
            id: onboarding.candidate.id,
            firstName: onboarding.candidate.firstName,
            lastName: onboarding.candidate.lastName,
            fullName: `${onboarding.candidate.firstName} ${onboarding.candidate.lastName}`,
            email: onboarding.candidate.email,
            phone: onboarding.candidate.phone,
            currentStatus: onboarding.candidate.currentStatus,
            nationalityCountryId: onboarding.candidate.nationalityCountryId,
            nationality: onboarding.candidate.nationality,
            currentCountryId: onboarding.candidate.currentCountryId,
            currentStateProvinceId: onboarding.candidate.currentStateProvinceId,
            currentCityId: onboarding.candidate.currentCityId,
            currentCountry: onboarding.candidate.currentCountry,
            currentStateProvince: onboarding.candidate.currentStateProvince,
            currentCity: onboarding.candidate.currentCity,
          }
        : null,
      employee: onboarding.employee
        ? {
            id: onboarding.employee.id,
            employeeCode: onboarding.employee.employeeCode,
            firstName: onboarding.employee.firstName,
            lastName: onboarding.employee.lastName,
            fullName: `${onboarding.employee.firstName} ${onboarding.employee.lastName}`,
            employmentStatus: onboarding.employee.employmentStatus,
          }
        : null,
      template: onboarding.template
        ? {
            id: onboarding.template.id,
            name: onboarding.template.name,
            description: onboarding.template.description,
            isDefault: onboarding.template.isDefault,
          }
        : null,
      targetDepartmentId: onboarding.targetDepartmentId,
      targetDesignationId: onboarding.targetDesignationId,
      targetLocationId: onboarding.targetLocationId,
      targetReportingManagerEmployeeId:
        onboarding.targetReportingManagerEmployeeId,
      tasks: onboarding.tasks.map((task) => ({
        id: task.id,
        code: task.code,
        checklistGroup: task.checklistGroup,
        title: task.title,
        description: task.description,
        assignedUserId: task.assignedUserId,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
        status: task.status,
        notes: task.notes,
        isRequired: task.isRequired,
        sortOrder: task.sortOrder,
        assignedUser: task.assignedUser
          ? {
              id: task.assignedUser.id,
              firstName: task.assignedUser.firstName,
              lastName: task.assignedUser.lastName,
              fullName: `${task.assignedUser.firstName} ${task.assignedUser.lastName}`,
              email: task.assignedUser.email,
            }
          : null,
      })),
      progress: {
        totalTasks: onboarding.tasks.length,
        completedTasks,
        requiredTasks: requiredTasks.length,
        completedRequiredTasks,
        percent:
          onboarding.tasks.length === 0
            ? 0
            : Math.round((completedTasks / onboarding.tasks.length) * 100),
      },
      readiness: {
        isReadyForConversion: this.isReadyForConversion(onboarding),
        blockers: this.getOnboardingReadinessBlockers(onboarding),
      },
    };
  }

  private handleTemplateWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Onboarding template name must be unique within the tenant.',
      );
    }

    throw error;
  }
}

function buildDefaultChecklistBlueprints(
  ownerUserId?: string,
): OnboardingTaskBlueprintDto[] {
  return [
    {
      title: 'Offer accepted',
      description: 'Confirm that the candidate has accepted the offer.',
      dueOffsetDays: 0,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Documents received',
      description: 'Collect required identity, contract, and compliance documents.',
      dueOffsetDays: 1,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Compensation confirmed',
      description: 'Verify the agreed salary, pay frequency, and benefits summary.',
      dueOffsetDays: 1,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Joining date confirmed',
      description: 'Confirm candidate joining date and communication plan.',
      dueOffsetDays: 2,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Reporting manager assigned',
      description: 'Assign the reporting manager for the new employee.',
      dueOffsetDays: 2,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Department assigned',
      description: 'Assign the employee department and business unit context.',
      dueOffsetDays: 2,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Designation assigned',
      description: 'Confirm the role title and designation mapping.',
      dueOffsetDays: 2,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Work email created',
      description: 'Prepare official work email or confirm provisioning approach.',
      dueOffsetDays: 3,
      assignedUserId: ownerUserId,
    },
    {
      title: 'System access prepared',
      description: 'Provision login, permissions, and initial application access.',
      dueOffsetDays: 3,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Payroll details captured',
      description: 'Complete bank, payroll, and compensation setup details.',
      dueOffsetDays: 4,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Employee profile draft completed',
      description: 'Prepare the employee profile for final conversion.',
      dueOffsetDays: 4,
      assignedUserId: ownerUserId,
    },
  ];
}

function slugifyTaskCode(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function inferChecklistGroup(title: string) {
  const normalized = title.toLowerCase();

  if (
    normalized.includes('offer') ||
    normalized.includes('compensation') ||
    normalized.includes('payroll')
  ) {
    return 'commercial';
  }

  if (
    normalized.includes('department') ||
    normalized.includes('designation') ||
    normalized.includes('manager')
  ) {
    return 'organization';
  }

  if (
    normalized.includes('email') ||
    normalized.includes('system') ||
    normalized.includes('access')
  ) {
    return 'access';
  }

  if (
    normalized.includes('document') ||
    normalized.includes('profile') ||
    normalized.includes('joining')
  ) {
    return 'readiness';
  }

  return 'general';
}

function isTruthyString(value?: string | null) {
  return Boolean(value?.trim());
}

function addDays(date: Date, offset: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
}
