import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeGender,
  OnboardingStatus,
  OnboardingTaskStatus,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationRepository } from '../organization/organization.repository';
import { RecruitmentRepository } from '../recruitment/recruitment.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersRepository } from '../users/users.repository';
import {
  EMPLOYEE_DRAFT_LIFECYCLE,
  EMPLOYEE_READY_FOR_ACTIVATION_LIFECYCLE,
} from '../employees/employee-lifecycle.constants';
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

type DraftEmployeeCandidate = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  personalEmail?: string | null;
  phone: string;
  dateOfBirth: Date | null;
  gender: EmployeeGender | null;
  nationalityCountryId: string | null;
  nationality: string | null;
  currentCountryId: string | null;
  currentStateProvinceId: string | null;
  currentCityId: string | null;
  currentCountry: string | null;
  currentStateProvince: string | null;
  currentCity: string | null;
};

type DraftEmployeeSource = {
  employeeCode?: string | null;
  workEmail?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  locationId?: string | null;
  reportingManagerEmployeeId?: string | null;
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly recruitmentRepository: RecruitmentRepository,
    private readonly usersRepository: UsersRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findTemplates(tenantId: string) {
    const templates = await this.ensurePredefinedTemplates(tenantId);

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
    await this.validateTaskBlueprintUsers(
      currentUser.tenantId,
      dto.taskBlueprints,
    );

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
      items: await Promise.all(
        items.map((item) => this.mapOnboardingWithReadiness(item)),
      ),
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
      throw new NotFoundException(
        'Onboarding record was not found for this tenant.',
      );
    }

    return this.mapOnboardingWithReadiness(onboarding);
  }

  async hardDeleteOnboardings(
    currentUser: AuthenticatedUser,
    onboardingIds: string[],
  ) {
    const uniqueOnboardingIds = [...new Set(onboardingIds.filter(Boolean))];

    if (uniqueOnboardingIds.length === 0) {
      throw new BadRequestException(
        'Select at least one onboarding record to delete.',
      );
    }

    const result = await this.onboardingRepository.deleteOnboardings(
      currentUser.tenantId,
      uniqueOnboardingIds,
    );

    if (result.count === 0) {
      throw new NotFoundException(
        'No onboarding records were found to delete.',
      );
    }

    return {
      deleted: result.count,
      requested: uniqueOnboardingIds.length,
    };
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

    const existing =
      await this.onboardingRepository.findActiveOnboardingByCandidate(
        currentUser.tenantId,
        dto.candidateId,
      );

    if (existing) {
      throw new ConflictException(
        'This candidate already has an active onboarding record.',
      );
    }

    const templates = await this.ensurePredefinedTemplates(
      currentUser.tenantId,
    );
    const template = dto.templateId
      ? await this.onboardingRepository.findTemplateById(
          currentUser.tenantId,
          dto.templateId,
        )
      : (templates.find((item) => item.isDefault && item.isActive) ?? null);

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
    await this.validateOnboardingOwner(currentUser.tenantId, dto.ownerUserId);

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const onboardingOwnerUserId = dto.ownerUserId ?? currentUser.userId;

    const onboardingId = await this.prisma.$transaction(async (tx) => {
      const onboarding = await this.onboardingRepository.createOnboarding(
        {
          tenantId: currentUser.tenantId,
          candidateId: candidate.id,
          templateId: template?.id,
          title:
            dto.title?.trim() ??
            `New hire onboarding - ${candidate.firstName} ${candidate.lastName}`,
          status: 'NOT_STARTED',
          ownerUserId: onboardingOwnerUserId,
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

      if (dto.createEmployee ?? true) {
        const draftEmployee = await this.findOrCreateDraftEmployee(
          currentUser,
          onboarding,
          candidate,
          dto,
          tx,
        );

        await this.onboardingRepository.updateOnboarding(
          currentUser.tenantId,
          onboarding.id,
          {
            employeeId: draftEmployee.id,
            updatedById: currentUser.userId,
          },
          tx,
        );
      }

      const generatedBlueprints =
        taskBlueprints.length > 0
          ? taskBlueprints
          : buildDefaultChecklistBlueprints(onboardingOwnerUserId);

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
                : (dueDate ?? undefined),
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

    const onboarding = await this.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );
    await this.emitAssignedTaskNotifications(currentUser, onboarding);
    return onboarding;
  }

  async updateTask(
    currentUser: AuthenticatedUser,
    onboardingId: string,
    taskId: string,
    dto: UpdateOnboardingTaskDto,
  ) {
    const existingOnboarding =
      await this.onboardingRepository.findOnboardingById(
        currentUser.tenantId,
        onboardingId,
      );

    if (!existingOnboarding) {
      throw new NotFoundException(
        'Onboarding record was not found for this tenant.',
      );
    }

    const task = await this.onboardingRepository.findTaskById(
      currentUser.tenantId,
      onboardingId,
      taskId,
    );

    if (!task) {
      throw new NotFoundException(
        'Onboarding task was not found for this record.',
      );
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
        ? (task.completedAt ?? new Date())
        : dto.status && dto.status !== OnboardingTaskStatus.COMPLETED
          ? null
          : task.completedAt;

    const previousAssignedUserId = task.assignedUserId;

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
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() ?? null }
          : {}),
        completedAt,
        updatedById: currentUser.userId,
      },
    );

    const refreshed = await this.onboardingRepository.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (!refreshed) {
      throw new NotFoundException(
        'Onboarding record was not found for this tenant.',
      );
    }

    await this.syncOnboardingStatus(
      currentUser.tenantId,
      onboardingId,
      refreshed,
    );

    const onboarding = await this.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (dto.assignedUserId && dto.assignedUserId !== previousAssignedUserId) {
      const assignedTask = onboarding.tasks.find((item) => item.id === taskId);
      if (assignedTask) {
        await this.emitOnboardingTaskAssignedNotification(
          currentUser,
          onboarding,
          assignedTask,
        );
      }
    }

    return onboarding;
  }

  private async emitAssignedTaskNotifications(
    currentUser: AuthenticatedUser,
    onboarding: ReturnType<OnboardingService['mapOnboarding']>,
  ) {
    for (const task of onboarding.tasks) {
      if (!task.assignedUserId) continue;
      await this.emitOnboardingTaskAssignedNotification(
        currentUser,
        onboarding,
        task,
      );
    }
  }

  private emitOnboardingTaskAssignedNotification(
    currentUser: AuthenticatedUser,
    onboarding: ReturnType<OnboardingService['mapOnboarding']>,
    task: ReturnType<OnboardingService['mapOnboarding']>['tasks'][number],
  ) {
    if (!task.assignedUserId) return null;

    return this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'employee.onboarding.task.assigned',
      moduleKey: 'employee',
      actorUserId: currentUser.userId,
      relatedEntityType: 'onboardingTask',
      relatedEntityId: task.id,
      relatedRecordNumber: task.title,
      metadata: {
        recipientUserId: task.assignedUserId,
        onboardingId: onboarding.id,
        onboardingTitle: onboarding.title,
        taskId: task.id,
        taskTitle: task.title,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/onboarding/${onboarding.id}?taskId=${encodeURIComponent(task.id)}`,
      },
    });
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
      throw new NotFoundException(
        'Onboarding record was not found for this tenant.',
      );
    }

    if (onboarding.employeeId && !onboarding.employee?.isDraftProfile) {
      throw new ConflictException(
        'This onboarding record already has an employee.',
      );
    }

    if (!onboarding.candidate) {
      throw new BadRequestException(
        'Only candidate-backed onboarding records can be converted.',
      );
    }

    const blockers = await this.getOnboardingReadinessBlockers(onboarding);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `Complete onboarding before converting to employee. ${blockers.join(' ')}`,
      );
    }

    const candidate = onboarding.candidate;
    const linkedDraft = this.resolveOnboardingDraftEmployee(onboarding);

    if (!candidate) {
      throw new BadRequestException(
        'Candidate details are required before conversion can continue.',
      );
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      const existingDraft = onboarding.employee?.isDraftProfile
        ? await tx.employee.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              id: onboarding.employee.id,
              isDraftProfile: true,
            },
          })
        : await tx.employee.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              sourceCandidateId: candidate.id,
              isDraftProfile: true,
            },
            orderBy: [{ updatedAt: 'desc' }],
          });

      const employeeCode =
        existingDraft?.employeeCode ?? candidate.id.slice(0, 8).toUpperCase();
      const workEmail =
        onboarding.targetWorkEmail ??
        existingDraft?.email ??
        linkedDraft?.email ??
        candidate.email;
      const hireDate =
        onboarding.plannedJoiningDate ??
        existingDraft?.hireDate ??
        linkedDraft?.hireDate ??
        new Date();
      const departmentId =
        onboarding.targetDepartmentId ??
        existingDraft?.departmentId ??
        linkedDraft?.departmentId;
      const designationId =
        onboarding.targetDesignationId ??
        existingDraft?.designationId ??
        linkedDraft?.designationId;
      const locationId =
        onboarding.targetLocationId ??
        existingDraft?.locationId ??
        linkedDraft?.locationId;
      const managerEmployeeId =
        onboarding.targetReportingManagerEmployeeId ??
        existingDraft?.managerEmployeeId ??
        linkedDraft?.managerEmployeeId;

      const created = existingDraft
        ? await tx.employee.update({
            where: { id: existingDraft.id },
            data: {
              firstName: candidate.firstName,
              middleName: candidate.middleName,
              lastName: candidate.lastName,
              email: workEmail,
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
              hireDate,
              departmentId,
              designationId,
              locationId,
              managerEmployeeId,
              ...EMPLOYEE_READY_FOR_ACTIVATION_LIFECYCLE,
              ownerUserId:
                existingDraft.ownerUserId ??
                this.resolveDraftOwnerId(currentUser, onboarding),
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
              email: workEmail,
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
              hireDate,
              departmentId,
              designationId,
              locationId,
              managerEmployeeId,
              ...EMPLOYEE_READY_FOR_ACTIVATION_LIFECYCLE,
              sourceCandidateId: candidate.id,
              ownerUserId: this.resolveDraftOwnerId(currentUser, onboarding),
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
      onboarding: await this.findOnboardingById(
        currentUser.tenantId,
        onboardingId,
      ),
    };
  }

  async ensureDraftEmployeeForOnboarding(
    currentUser: AuthenticatedUser,
    onboardingId: string,
  ) {
    const onboarding = await this.onboardingRepository.findOnboardingById(
      currentUser.tenantId,
      onboardingId,
    );

    if (!onboarding) {
      throw new NotFoundException(
        'Onboarding record was not found for this tenant.',
      );
    }

    if (!onboarding.candidate) {
      throw new BadRequestException(
        'Only candidate-backed onboarding records can have an employee draft.',
      );
    }

    if (onboarding.candidate.currentStatus !== 'HIRED') {
      throw new BadRequestException(
        'Employee draft is available only after the candidate is hired.',
      );
    }

    const candidate = onboarding.candidate;
    const existingDraft = this.resolveOnboardingDraftEmployee(onboarding);

    if (existingDraft) {
      if (onboarding.employeeId !== existingDraft.id) {
        await this.onboardingRepository.updateOnboarding(
          currentUser.tenantId,
          onboarding.id,
          {
            employeeId: existingDraft.id,
            updatedById: currentUser.userId,
          },
        );
      }

      return { employeeId: existingDraft.id };
    }

    const createdDraft = await this.prisma.$transaction(async (tx) => {
      const draft = await this.findOrCreateDraftEmployee(
        currentUser,
        onboarding,
        candidate,
        {
          workEmail: onboarding.targetWorkEmail,
          departmentId: onboarding.targetDepartmentId,
          designationId: onboarding.targetDesignationId,
          locationId: onboarding.targetLocationId,
          reportingManagerEmployeeId:
            onboarding.targetReportingManagerEmployeeId,
        },
        tx,
      );

      await this.onboardingRepository.updateOnboarding(
        currentUser.tenantId,
        onboarding.id,
        {
          employeeId: draft.id,
          updatedById: currentUser.userId,
        },
        tx,
      );

      return draft;
    });

    return { employeeId: createdDraft.id };
  }

  private async clearDefaultTemplates(tenantId: string, keepId?: string) {
    const templates = await this.ensurePredefinedTemplates(tenantId);

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

    const readyForConversion = await this.isReadyForConversion(onboarding);
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
      } else if (
        completedRequiredTasks.length > 0 ||
        onboarding.tasks.length > 0
      ) {
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

  private async isReadyForConversion(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    return (await this.getOnboardingReadinessBlockers(onboarding)).length === 0;
  }

  private async validateOnboardingOwner(
    tenantId: string,
    ownerUserId?: string | null,
  ) {
    if (!ownerUserId) return;

    const owner = await this.usersRepository.findByIdWithAccess(ownerUserId);
    if (!owner || owner.tenantId !== tenantId) {
      throw new BadRequestException(
        'Onboarding owner does not belong to this tenant.',
      );
    }
  }

  private async getOnboardingReadinessBlockers(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    const blockers: string[] = [];
    const draftEmployee = this.resolveOnboardingDraftEmployee(onboarding);
    const departmentId =
      onboarding.targetDepartmentId ?? draftEmployee?.departmentId ?? null;
    const designationId =
      onboarding.targetDesignationId ?? draftEmployee?.designationId ?? null;
    const reportingManagerEmployeeId =
      onboarding.targetReportingManagerEmployeeId ??
      draftEmployee?.managerEmployeeId ??
      null;
    const workEmail =
      onboarding.targetWorkEmail ??
      onboarding.employee?.email ??
      draftEmployee?.email ??
      onboarding.candidate?.email ??
      null;
    const joiningDate =
      onboarding.plannedJoiningDate ?? draftEmployee?.hireDate ?? null;
    const requiredTasks = onboarding.tasks.filter((task) => task.isRequired);
    const incompleteRequiredTasks = requiredTasks.filter(
      (task) => task.status !== OnboardingTaskStatus.COMPLETED,
    );

    if (!onboarding.candidate) {
      blockers.push('Candidate link is missing.');
    }

    if (incompleteRequiredTasks.length > 0) {
      blockers.push(
        'Required onboarding checklist items are still incomplete.',
      );
    }

    if (!departmentId) {
      blockers.push('Department is not assigned.');
    }

    if (!designationId) {
      blockers.push('Designation is not assigned.');
    }

    if (
      !reportingManagerEmployeeId &&
      !(await this.canSkipReportingManager(onboarding))
    ) {
      blockers.push('Reporting manager is not assigned.');
    }

    if (!isTruthyString(workEmail)) {
      blockers.push('Work email is not prepared.');
    }

    if (!joiningDate) {
      blockers.push('Joining date is not confirmed.');
    }

    if (onboarding.employeeId && !onboarding.employee?.isDraftProfile) {
      blockers.push('Employee has already been created.');
    }

    return blockers;
  }

  private resolveOnboardingDraftEmployee(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    if (onboarding.employee?.isDraftProfile) return onboarding.employee;
    return onboarding.candidate?.draftEmployees[0] ?? null;
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
            currentDesignation: onboarding.candidate.currentDesignation,
            draftEmployee: onboarding.candidate.draftEmployees[0]
              ? {
                  id: onboarding.candidate.draftEmployees[0].id,
                  employeeCode:
                    onboarding.candidate.draftEmployees[0].employeeCode,
                  firstName: onboarding.candidate.draftEmployees[0].firstName,
                  lastName: onboarding.candidate.draftEmployees[0].lastName,
                  fullName: `${onboarding.candidate.draftEmployees[0].firstName} ${onboarding.candidate.draftEmployees[0].lastName}`,
                  email: onboarding.candidate.draftEmployees[0].email,
                  employmentStatus:
                    onboarding.candidate.draftEmployees[0].employmentStatus,
                  status: onboarding.candidate.draftEmployees[0].status,
                  subStatus: onboarding.candidate.draftEmployees[0].subStatus,
                  ownerUserId:
                    onboarding.candidate.draftEmployees[0].ownerUserId,
                  isDraftProfile:
                    onboarding.candidate.draftEmployees[0].isDraftProfile,
                }
              : null,
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
            status: onboarding.employee.status,
            subStatus: onboarding.employee.subStatus,
            ownerUserId: onboarding.employee.ownerUserId,
            isDraftProfile: onboarding.employee.isDraftProfile,
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
        isReadyForConversion: false,
        blockers: [] as string[],
      },
    };
  }

  private async mapOnboardingWithReadiness(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    const mapped = this.mapOnboarding(onboarding);
    const blockers = await this.getOnboardingReadinessBlockers(onboarding);
    return {
      ...mapped,
      readiness: {
        isReadyForConversion: blockers.length === 0,
        blockers,
      },
    };
  }

  private async ensurePredefinedTemplates(tenantId: string) {
    const existing = await this.onboardingRepository.findTemplates(tenantId);
    if (existing.length > 0) return existing;

    for (const template of PREDEFINED_ONBOARDING_TEMPLATES) {
      await this.onboardingRepository.createTemplate({
        tenantId,
        name: template.name,
        description: template.description,
        taskBlueprints:
          template.taskBlueprints as unknown as Prisma.InputJsonValue,
        isDefault: template.isDefault,
        isActive: true,
        createdById: null,
        updatedById: null,
      });
    }

    return this.onboardingRepository.findTemplates(tenantId);
  }

  private async findOrCreateDraftEmployee(
    currentUser: AuthenticatedUser,
    onboarding: {
      id: string;
      plannedJoiningDate: Date | null;
      ownerUserId?: string | null;
    },
    candidate: DraftEmployeeCandidate,
    dto: DraftEmployeeSource,
    tx: Prisma.TransactionClient,
  ) {
    const existingDraft = await tx.employee.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        sourceCandidateId: candidate.id,
        isDraftProfile: true,
        isDeleted: false,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        ownerUserId: true,
        status: true,
        subStatus: true,
        employmentStatus: true,
      },
    });

    if (existingDraft) {
      if (
        !existingDraft.ownerUserId ||
        existingDraft.status !== EMPLOYEE_DRAFT_LIFECYCLE.status ||
        existingDraft.subStatus !== EMPLOYEE_DRAFT_LIFECYCLE.subStatus ||
        existingDraft.employmentStatus !==
          EMPLOYEE_DRAFT_LIFECYCLE.employmentStatus
      ) {
        await tx.employee.update({
          where: { id: existingDraft.id },
          data: {
            ...EMPLOYEE_DRAFT_LIFECYCLE,
            ownerUserId:
              existingDraft.ownerUserId ??
              this.resolveDraftOwnerId(currentUser, onboarding),
            updatedById: currentUser.userId,
          },
          select: { id: true },
        });
      }

      return { id: existingDraft.id };
    }

    return tx.employee.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeCode:
          dto.employeeCode?.trim() ||
          `ONB-${candidate.id.slice(0, 8).toUpperCase()}`,
        firstName: candidate.firstName,
        middleName: candidate.middleName,
        lastName: candidate.lastName,
        email: dto.workEmail?.trim() || null,
        personalEmail: candidate.personalEmail ?? candidate.email,
        phone: candidate.phone?.trim() || 'pending',
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
        departmentId: dto.departmentId,
        designationId: dto.designationId,
        locationId: dto.locationId,
        managerEmployeeId: dto.reportingManagerEmployeeId,
        ...EMPLOYEE_DRAFT_LIFECYCLE,
        sourceCandidateId: candidate.id,
        ownerUserId: this.resolveDraftOwnerId(currentUser, onboarding),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      select: { id: true },
    });
  }

  private async canSkipReportingManager(
    onboarding: EmployeeOnboardingWithRelations,
  ) {
    if (isTopLevelOnboarding(onboarding)) return true;

    const employees = await this.prisma.employee.count({
      where: {
        tenantId: onboarding.tenantId,
        isDeleted: false,
        isDraftProfile: false,
        ...(onboarding.employeeId
          ? { id: { not: onboarding.employeeId } }
          : {}),
      },
    });

    return employees === 0;
  }

  private resolveDraftOwnerId(
    currentUser: AuthenticatedUser,
    onboarding: { ownerUserId?: string | null },
  ) {
    return onboarding.ownerUserId ?? currentUser.userId;
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
      description:
        'Collect required identity, contract, and compliance documents.',
      dueOffsetDays: 1,
      assignedUserId: ownerUserId,
    },
    {
      title: 'Compensation confirmed',
      description:
        'Verify the agreed salary, pay frequency, and benefits summary.',
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
      description:
        'Prepare official work email or confirm provisioning approach.',
      dueOffsetDays: 3,
      assignedUserId: ownerUserId,
    },
    {
      title: 'System access prepared',
      description:
        'Provision login, permissions, and initial application access.',
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

const PREDEFINED_ONBOARDING_TEMPLATES: Array<{
  name: string;
  description: string;
  isDefault: boolean;
  taskBlueprints: OnboardingTaskBlueprintDto[];
}> = [
  {
    name: 'Standard employee onboarding',
    description:
      'General-purpose checklist for converting a hired candidate into an active employee.',
    isDefault: true,
    taskBlueprints: buildDefaultChecklistBlueprints(),
  },
  {
    name: 'Executive / top-level onboarding',
    description:
      'Lean onboarding path for CEO, founder, director, or first-employee profiles where a reporting manager is not applicable.',
    isDefault: false,
    taskBlueprints: [
      {
        title: 'Offer and mandate confirmed',
        description:
          'Confirm appointment terms, designation authority, and joining expectations.',
        dueOffsetDays: 0,
      },
      {
        title: 'Board or owner approval documented',
        description:
          'Attach or confirm the approval record for the top-level appointment.',
        dueOffsetDays: 1,
      },
      {
        title: 'Executive employee profile draft completed',
        description:
          'Complete work email, designation, department, location, and statutory profile data.',
        dueOffsetDays: 2,
      },
      {
        title: 'System and approval authority prepared',
        description:
          'Provision tenant-level access and workflow authority according to governance policy.',
        dueOffsetDays: 3,
      },
    ],
  },
  {
    name: 'Remote employee onboarding',
    description:
      'Checklist for remote or hybrid employees with stronger emphasis on access, documents, and equipment readiness.',
    isDefault: false,
    taskBlueprints: [
      {
        title: 'Remote work details confirmed',
        description:
          'Confirm work mode, address, time zone, and remote attendance expectations.',
        dueOffsetDays: 0,
      },
      {
        title: 'Identity and compliance documents received',
        description:
          'Collect identification, contract, and employment eligibility documents.',
        dueOffsetDays: 1,
      },
      {
        title: 'Equipment and access prepared',
        description:
          'Prepare hardware, account access, security policy acknowledgment, and software setup.',
        dueOffsetDays: 2,
      },
      {
        title: 'Reporting manager and team intro scheduled',
        description: 'Assign manager and schedule first-week team orientation.',
        dueOffsetDays: 3,
      },
      {
        title: 'Payroll and employee profile draft completed',
        description:
          'Capture payroll details and complete the draft employee profile before activation.',
        dueOffsetDays: 4,
      },
    ],
  },
];

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

function isTopLevelOnboarding(onboarding: EmployeeOnboardingWithRelations) {
  const text = [
    onboarding.title,
    onboarding.candidate?.currentDesignation,
    onboarding.employee?.employmentStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\b(ceo|chief executive|founder|owner|president|managing director|top[- ]level)\b/.test(
    text,
  );
}

function addDays(date: Date, offset: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
}
