import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeEmploymentStatus,
  Prisma,
  SecurityPrivilege,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ENTITY_KEYS, ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { normalizeEmail } from '../../common/utils/email.util';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { OrganizationRepository } from '../organization/organization.repository';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ProvisionEmployeeAccessDto } from './dto/provision-employee-access.dto';
import { TerminateEmployeeDto } from './dto/terminate-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { DuplicateRuleEngine } from '../../common/validation/duplicate-rule-engine';
import {
  EmployeeHierarchyNode,
  EmployeesRepository,
  EmployeeWithRelations,
} from './employees.repository';
import { AuditService } from '../audit/audit.service';
import {
  EmployeeSettingsResolved,
  TenantSettingsResolverService,
} from '../tenant-settings/tenant-settings-resolver.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesRepository: EmployeesRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly auditService: AuditService,
    private readonly duplicateRuleEngine: DuplicateRuleEngine,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  async findByTenant(currentUser: AuthenticatedUser, query: EmployeeQueryDto) {
    const tenantId = currentUser.tenantId;

    const employeeReadScope = buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
      currentUser,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.READ,
      {
        organizationIdField: null,
        userIdField: 'userId',
      },
    );

    if (this.isSelfServiceUser(currentUser)) {
      const employee = await this.employeesRepository.findByUserIdAndTenant(
        tenantId,
        currentUser.userId,
      );
      const items = employee ? [this.mapEmployee(employee)] : [];

      return {
        items,
        meta: {
          page: 1,
          pageSize: query.pageSize,
          total: items.length,
          totalPages: 1,
        },
        filters: {
          search: query.search ?? null,
          employmentStatus: query.employmentStatus ?? null,
          reportingManagerEmployeeId: query.reportingManagerEmployeeId ?? null,
        },
      };
    }

    let effectiveQuery = query;

    if (this.isManagerScopedUser(currentUser)) {
      const currentEmployee =
        await this.employeesRepository.findByUserIdAndTenant(
          tenantId,
          currentUser.userId,
        );

      effectiveQuery = {
        ...query,
        reportingManagerEmployeeId:
          query.reportingManagerEmployeeId ?? currentEmployee?.id,
      };
    }

    const { items, total } = await this.employeesRepository.findByTenant(
      tenantId,
      effectiveQuery,
      employeeReadScope,
    );

    return {
      items: items.map((employee) => this.mapEmployee(employee)),
      meta: {
        page: effectiveQuery.page,
        pageSize: effectiveQuery.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / effectiveQuery.pageSize)),
      },
      filters: {
        search: effectiveQuery.search ?? null,
        employmentStatus: effectiveQuery.employmentStatus ?? null,
        reportingManagerEmployeeId:
          effectiveQuery.reportingManagerEmployeeId ?? null,
      },
    };
  }

  private isSelfServiceUser(currentUser: AuthenticatedUser) {
    return (
      currentUser.roleKeys.includes(ROLE_KEYS.EMPLOYEE) &&
      currentUser.roleKeys.every((roleKey) => roleKey === ROLE_KEYS.EMPLOYEE)
    );
  }

  private isManagerScopedUser(currentUser: AuthenticatedUser) {
    const elevatedRoleKeys = new Set([
      'admin',
      ROLE_KEYS.HR,
      ROLE_KEYS.SYSTEM_ADMIN,
    ]);
    return (
      currentUser.roleKeys.includes(ROLE_KEYS.MANAGER) &&
      currentUser.roleKeys.every((roleKey) => !elevatedRoleKeys.has(roleKey))
    );
  }

  async findById(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    return this.mapEmployee(employee);
  }

  async searchForUserLinking(currentUser: AuthenticatedUser, query: string) {
    const search = query.trim();
    const accessWhere = buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
      currentUser,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.READ,
      {
        organizationIdField: null,
        userIdField: 'userId',
      },
    );

    const employees = await this.prisma.employee.findMany({
      where: {
        AND: [
          accessWhere,
          search
            ? {
                OR: [
                  { employeeCode: { contains: search, mode: 'insensitive' } },
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  {
                    department: {
                      name: { contains: search, mode: 'insensitive' },
                    },
                  },
                ],
              }
            : {},
        ],
      },
      include: {
        department: { select: { id: true, name: true } },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organization: { select: { id: true, name: true } },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 20,
    });

    return {
      items: employees.map((employee) => ({
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        departmentName: employee.department?.name ?? null,
        businessUnit: employee.businessUnit
          ? {
              id: employee.businessUnit.id,
              name: employee.businessUnit.name,
              organizationName: employee.businessUnit.organization.name,
            }
          : null,
        linkedUser: employee.user
          ? {
              id: employee.user.id,
              fullName: `${employee.user.firstName} ${employee.user.lastName}`,
              email: employee.user.email,
            }
          : null,
      })),
    };
  }

  async assignManager(
    tenantId: string,
    employeeId: string,
    dto: AssignManagerDto,
    actorId: string,
  ) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    //const beforeSnapshot = this.mapEmployee(employee);

    const managerEmployeeId = dto.reportingManagerEmployeeId ?? undefined;

    await this.validateManagerAssignment(
      tenantId,
      employeeId,
      managerEmployeeId,
    );

    await this.employeesRepository.update(tenantId, employeeId, {
      managerEmployeeId: dto.reportingManagerEmployeeId ?? null,
      updatedById: actorId,
    });

    return this.findById(tenantId, employeeId);
  }

  async getHierarchy(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const [managerChain, directReports] = await Promise.all([
      this.buildManagerChain(tenantId, employee.managerEmployeeId),
      this.employeesRepository.findDirectReports(tenantId, employeeId),
    ]);

    return {
      employee: this.mapEmployee(employee),
      managerChain: managerChain.map((node) => this.mapHierarchyNode(node)),
      directReports: directReports.map((directReport) =>
        this.mapHierarchyPreview(directReport),
      ),
    };
  }

  async getDirectReports(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const directReports = await this.employeesRepository.findDirectReports(
      tenantId,
      employeeId,
    );

    return {
      manager: this.mapHierarchyPreview(employee),
      directReports: directReports.map((directReport) =>
        this.mapHierarchyPreview(directReport),
      ),
    };
  }

  async getDirectReportsByUser(currentUser: AuthenticatedUser) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new NotFoundException(
        'No employee profile is linked to the current user.',
      );
    }

    return this.getDirectReports(currentUser.tenantId, employee.id);
  }
  private async resolveEmployeeCodeForCreate(
    tenantId: string,
    dto: CreateEmployeeDto,
    settings: EmployeeSettingsResolved,
    tx: Prisma.TransactionClient,
  ) {
    if (!settings.autoGenerateEmployeeId) {
      const manualEmployeeCode = dto.employeeCode?.trim();

      if (!manualEmployeeCode) {
        throw new BadRequestException('Employee code is required.');
      }

      return manualEmployeeCode.toUpperCase();
    }

    return this.generateNextEmployeeCode(
      tenantId,
      settings.employeeIdPrefix,
      settings.employeeIdSequenceLength,
      tx,
    );
  }

  private async generateNextEmployeeCode(
    tenantId: string,
    prefix: string | null | undefined,
    sequenceLength: number | null | undefined,
    tx: Prisma.TransactionClient,
  ) {
    const normalizedPrefix = this.normalizeEmployeeCodePrefix(prefix);
    const normalizedSequenceLength =
      this.normalizeEmployeeCodeSequenceLength(sequenceLength);

    const startsWith = `${normalizedPrefix}-`;

    const latestEmployee = await tx.employee.findFirst({
      where: {
        tenantId,
        employeeCode: {
          startsWith,
          mode: 'insensitive',
        },
      },
      orderBy: {
        employeeCode: 'desc',
      },
      select: {
        employeeCode: true,
      },
    });

    const latestSequence = latestEmployee?.employeeCode
      ? this.extractEmployeeCodeSequence(
          latestEmployee.employeeCode,
          normalizedPrefix,
        )
      : 0;

    const nextSequence = latestSequence + 1;

    return `${normalizedPrefix}-${String(nextSequence).padStart(
      normalizedSequenceLength,
      '0',
    )}`;
  }

  private normalizeEmployeeCodePrefix(prefix: string | null | undefined) {
    const normalizedPrefix = (prefix || 'EMP')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!normalizedPrefix) {
      return 'EMP';
    }

    return normalizedPrefix.slice(0, 12);
  }

  private normalizeEmployeeCodeSequenceLength(
    sequenceLength: number | null | undefined,
  ) {
    if (!Number.isFinite(sequenceLength) || !sequenceLength) {
      return 5;
    }

    return Math.min(Math.max(Math.trunc(sequenceLength), 3), 10);
  }

  private isUniqueEmployeeCodeConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(',')
      : '';

    return target.includes('employeeCode');
  }

  private extractEmployeeCodeSequence(employeeCode: string, prefix: string) {
    const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, 'i');
    const match = employeeCode.match(pattern);

    if (!match?.[1]) {
      return 0;
    }

    const sequence = Number(match[1]);

    return Number.isFinite(sequence) ? sequence : 0;
  }

  async checkDuplicates(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    const settings = await this.tenantSettingsService.getResolvedSettings(
      user.tenantId,
    );

    const employeeSettings = settings.employee;

    const conflicts = await this.duplicateRuleEngine.checkEmployeeDuplicates({
      tenantId: user.tenantId,
      payload: dto,
      rules: [
        {
          key: 'personalEmail',
          label: 'Personal email',
          enabled: employeeSettings.preventDuplicateByPersonalEmail,
          severity: 'BLOCK',
          value: (payload) => payload.personalEmail?.toLowerCase(),
          buildWhere: (value) => ({
            personalEmail: value,
          }),
        },
        {
          key: 'phone',
          label: 'Phone number',
          enabled: employeeSettings.preventDuplicateByPhoneNumber,
          severity: employeeSettings.warnOnPossibleDuplicate ? 'WARN' : 'BLOCK',
          value: (payload) => payload.phone,
          buildWhere: (value) => ({
            phone: value,
          }),
        },
        {
          key: 'nationalId',
          label: 'National identity value',
          enabled: employeeSettings.preventDuplicateByNationalId,
          severity: 'BLOCK',
          value: (payload) => payload.cnic,
          buildWhere: (value) => ({
            cnic: value,
          }),
        },
      ],
    });

    return { conflicts };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmployeeDto) {
    const tenantId = currentUser.tenantId;
    const employeeSettings =
      await this.tenantSettingsResolverService.getEmployeeSettings(tenantId);

    this.assertEmployeeSettingsRulesForCreate(dto, employeeSettings);
    await this.assertEmployeeDuplicateRules(tenantId, dto, employeeSettings);

    const createDto: CreateEmployeeDto = {
      ...dto,
      employeeType:
        dto.employeeType ?? (employeeSettings.defaultEmploymentType as never),
      workMode: dto.workMode ?? (employeeSettings.defaultWorkMode as never),
      employmentStatus:
        dto.employmentStatus ??
        (employeeSettings.defaultEmployeeStatus as never),
    };

    if (dto.provisionSystemAccess) {
      this.assertAccessProvisioningPermissions(currentUser);

      if (!dto.workEmail) {
        throw new BadRequestException(
          'Work email is required when system access is enabled.',
        );
      }
    }

    const referenceContext = await this.validateReferences(
      tenantId,
      dto.reportingManagerEmployeeId,
      dto.userId,
      dto.departmentId,
      dto.designationId,
      dto.employeeLevelId,
      dto.locationId,
      dto.officialJoiningLocationId,
      dto.nationalityCountryId,
      dto.countryId,
      dto.stateProvinceId,
      dto.cityId,
      dto.emergencyContactRelationTypeId,
      dto.workEmail,
    );

    this.validateDateRules(dto);

    const maxAttempts = employeeSettings.autoGenerateEmployeeId ? 5 : 1;
    let createdEmployeeId: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const employee = await this.prisma.$transaction(
          async (tx) => {
            const employeeCode = await this.resolveEmployeeCodeForCreate(
              tenantId,
              createDto,
              employeeSettings,
              tx,
            );

            return tx.employee.create({
              data: this.buildCreateData(
                tenantId,
                {
                  ...createDto,
                  employeeCode,
                },
                currentUser.userId,
                referenceContext.linkedUserEmail,
                referenceContext,
              ),
              select: {
                id: true,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        createdEmployeeId = employee.id;
        break;
      } catch (error) {
        if (
          employeeSettings.autoGenerateEmployeeId &&
          this.isUniqueEmployeeCodeConflict(error) &&
          attempt < maxAttempts
        ) {
          continue;
        }

        this.handleWriteError(error);
      }
    }

    if (!createdEmployeeId) {
      throw new ConflictException(
        'Unable to generate a unique employee code. Please try again.',
      );
    }

    if (dto.provisionSystemAccess) {
      await this.provisionEmployeeUserAccess(currentUser, createdEmployeeId, {
        provisionSystemAccess: true,
        sendInvitationNow: dto.sendInvitationNow,
        initialRoleIds: dto.initialRoleIds,
      });
    }

    return this.findById(tenantId, createdEmployeeId);
  }

  async update(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    const tenantId = currentUser.tenantId;
    const employeeSettings =
      await this.tenantSettingsResolverService.getEmployeeSettings(tenantId);
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const beforeSnapshot = this.mapEmployee(employee);
    this.assertEmployeeSettingsRulesForUpdate(dto, employee, employeeSettings);
    await this.assertEmployeeDuplicateRules(
      tenantId,
      {
        employeeCode: dto.employeeCode ?? employee.employeeCode,
        firstName: dto.firstName ?? employee.firstName,
        lastName: dto.lastName ?? employee.lastName,
        phone: dto.phone ?? employee.phone,
        personalEmail: dto.personalEmail ?? employee.personalEmail ?? undefined,
        cnic: dto.cnic ?? employee.cnic ?? undefined,
      } as CreateEmployeeDto,
      employeeSettings,
      employeeId,
    );

    if (dto.provisionSystemAccess) {
      this.assertAccessProvisioningPermissions(currentUser);

      if (!dto.workEmail && !employee.email) {
        throw new BadRequestException(
          'Work email is required when system access is enabled.',
        );
      }
    }

    const referenceContext = await this.validateReferences(
      tenantId,
      dto.reportingManagerEmployeeId,
      dto.userId,
      dto.departmentId,
      dto.designationId,
      dto.employeeLevelId,
      dto.locationId,
      dto.officialJoiningLocationId,
      dto.nationalityCountryId,
      dto.countryId,
      dto.stateProvinceId,
      dto.cityId,
      dto.emergencyContactRelationTypeId,
      dto.workEmail,
      employeeId,
    );
    this.validateDateRules(dto);

    try {
      const result = await this.employeesRepository.update(
        tenantId,
        employeeId,
        this.buildUpdateData(
          dto,
          currentUser.userId,
          referenceContext.linkedUserEmail,
          referenceContext,
        ),
      );

      if (result.count === 0) {
        throw new NotFoundException('Employee was not found for this tenant.');
      }

      const updatedEmployee = await this.findById(tenantId, employeeId);

      await this.auditService.log({
        tenantId,
        actorUserId: currentUser.userId,
        action: 'EMPLOYEE_UPDATED',
        entityType: 'Employee',
        entityId: employeeId,
        beforeSnapshot,
        afterSnapshot: updatedEmployee,
      });

      if (dto.provisionSystemAccess) {
        await this.provisionEmployeeUserAccess(currentUser, employeeId, {
          provisionSystemAccess: true,
          sendInvitationNow: dto.sendInvitationNow,
          initialRoleIds: dto.initialRoleIds,
        });
        return this.findById(tenantId, employeeId);
      }

      return updatedEmployee;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async provisionAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: ProvisionEmployeeAccessDto,
  ) {
    return this.provisionEmployeeUserAccess(currentUser, employeeId, dto);
  }

  async resendInvitation(currentUser: AuthenticatedUser, employeeId: string) {
    return this.provisionEmployeeUserAccess(currentUser, employeeId, {
      provisionSystemAccess: true,
      sendInvitationNow: true,
    });
  }

  async terminate(
    tenantId: string,
    employeeId: string,
    dto: TerminateEmployeeDto,
    actorId: string,
  ) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const terminationDate = dto.terminationDate
      ? new Date(dto.terminationDate)
      : new Date();

    await this.employeesRepository.update(tenantId, employeeId, {
      employmentStatus: EmployeeEmploymentStatus.TERMINATED,
      terminationDate,
      updatedById: actorId,
    });

    return this.findById(tenantId, employeeId);
  }

  private async provisionEmployeeUserAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: ProvisionEmployeeAccessDto,
  ) {
    if (!dto.provisionSystemAccess) {
      throw new BadRequestException(
        'System access provisioning was not requested.',
      );
    }

    this.assertAccessProvisioningPermissions(currentUser);

    const tenantId = currentUser.tenantId;
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const workEmail = employee.email ? normalizeEmail(employee.email) : null;

    if (!workEmail) {
      throw new BadRequestException(
        'Work email is required before system access can be provisioned.',
      );
    }

    if (
      employee.personalEmail &&
      normalizeEmail(employee.personalEmail) === workEmail
    ) {
      throw new BadRequestException(
        'Personal email cannot be used for authentication or invitation flows.',
      );
    }

    const placeholderPasswordHash = await bcrypt.hash(
      `invite-${employee.id}-${Date.now()}`,
      12,
    );
    const actor = await this.usersRepository.findByIdWithAccess(
      currentUser.userId,
    );
    const actorBusinessUnitId =
      actor && actor.tenantId === tenantId ? actor.businessUnitId : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      let user = employee.userId
        ? await this.usersRepository.findByIdWithAccess(employee.userId, tx)
        : null;

      if (!user) {
        const existingUser = await this.usersRepository.findByEmailWithAccess(
          workEmail,
          tx,
        );

        if (existingUser) {
          if (existingUser.tenantId !== tenantId) {
            throw new ConflictException(
              'This work email is already associated with another tenant user.',
            );
          }

          const linkedEmployee =
            await this.employeesRepository.findByUserIdAndTenant(
              tenantId,
              existingUser.id,
              tx,
            );

          if (linkedEmployee && linkedEmployee.id !== employee.id) {
            throw new ConflictException(
              'This work email is already linked to another employee.',
            );
          }

          user = existingUser;
        } else {
          const createdUser = await this.usersRepository.create(
            {
              tenantId,
              ...(actorBusinessUnitId
                ? { businessUnitId: actorBusinessUnitId }
                : {}),
              firstName: employee.firstName.trim(),
              lastName: employee.lastName.trim(),
              email: workEmail,
              passwordHash: placeholderPasswordHash,
              status: UserStatus.INVITED,
              createdById: currentUser.userId,
              updatedById: currentUser.userId,
            },
            tx,
          );

          user = await this.usersRepository.findByIdWithAccess(
            createdUser.id,
            tx,
          );
        }
      }

      if (!user) {
        throw new NotFoundException(
          'Unable to resolve the provisioned user account.',
        );
      }

      const roleIds = await this.resolveProvisioningRoleIds(
        tenantId,
        dto.initialRoleIds,
        user.userRoles.map((item) => item.roleId),
      );

      if (user.tenantId !== tenantId) {
        throw new ConflictException(
          'The linked user account does not belong to this tenant.',
        );
      }

      if (user.email !== workEmail) {
        throw new BadRequestException(
          'Employee work email must match the linked user authentication email.',
        );
      }

      if (user.status === UserStatus.DISABLED) {
        await this.usersRepository.update(
          user.id,
          {
            status: UserStatus.INVITED,
            updatedById: currentUser.userId,
          },
          tx,
        );
      }

      await this.usersRepository.replaceRoles(
        tenantId,
        user.id,
        roleIds,
        currentUser.userId,
        tx,
      );

      await tx.employee.update({
        where: { id: employee.id },
        data: {
          userId: user.id,
          email: workEmail,
          updatedById: currentUser.userId,
        },
      });

      const updatedUser = await this.usersRepository.findByIdWithAccess(
        user.id,
        tx,
      );

      return {
        user: updatedUser,
      };
    });

    if (!result.user) {
      throw new NotFoundException(
        'Provisioned user account could not be loaded.',
      );
    }

    let invitation: {
      invitationId: string;
      deliveryMode: 'log' | 'disabled' | 'sent';
      expiresAt: Date;
      activationLink?: string;
    } | null = null;

    if (
      dto.sendInvitationNow !== false ||
      result.user.status !== UserStatus.ACTIVE
    ) {
      invitation = await this.userInvitationsService.issueInvitation({
        tenantId,
        userId: result.user.id,
        employeeId: employee.id,
        email: workEmail,
        fullName: `${employee.firstName} ${employee.lastName}`,
        createdByUserId: currentUser.userId,
        sendNow: dto.sendInvitationNow ?? true,
      });
    }

    const updatedEmployee = await this.findById(tenantId, employee.id);

    await this.auditService.log({
      tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_SYSTEM_ACCESS_PROVISIONED',
      entityType: 'Employee',
      entityId: employee.id,
      afterSnapshot: {
        employeeId: employee.id,
        userId: result.user.id,
        workEmail,
        roleIds: result.user.userRoles.map((item) => item.roleId),
        invited: Boolean(invitation),
      },
    });

    return {
      employee: updatedEmployee,
      access: {
        userId: result.user.id,
        workEmail,
        status: result.user.status,
        roleIds: result.user.userRoles.map((item) => item.roleId),
        invitation: invitation
          ? {
              invitationId: invitation.invitationId,
              deliveryMode: invitation.deliveryMode,
              expiresAt: invitation.expiresAt,
              activationLink: invitation.activationLink,
            }
          : null,
      },
    };
  }

  private assertAccessProvisioningPermissions(currentUser: AuthenticatedUser) {
    const requiredPermissions = ['users.create', 'users.assign-roles'];
    const hasPermissions = requiredPermissions.every((permission) =>
      currentUser.permissionKeys.includes(permission),
    );

    if (!hasPermissions) {
      throw new ForbiddenException(
        'You do not have permission to provision employee system access.',
      );
    }
  }

  private async resolveProvisioningRoleIds(
    tenantId: string,
    roleIds?: string[],
    fallbackRoleIds?: string[],
  ) {
    if (roleIds && roleIds.length > 0) {
      const roles = await this.rolesRepository.findByIds(tenantId, roleIds);

      if (roles.length !== roleIds.length) {
        throw new BadRequestException(
          'One or more selected roles do not belong to this tenant.',
        );
      }

      return roleIds;
    }

    if (fallbackRoleIds && fallbackRoleIds.length > 0) {
      return fallbackRoleIds;
    }

    let employeeRole = await this.rolesRepository.findByKeyAndTenant(
      tenantId,
      'employee',
    );

    if (!employeeRole) {
      await this.permissionsService.bootstrapTenantDefaults(tenantId);
      employeeRole = await this.rolesRepository.findByKeyAndTenant(
        tenantId,
        'employee',
      );
    }

    if (!employeeRole) {
      throw new NotFoundException(
        'Default employee role is not available for this tenant.',
      );
    }

    return [employeeRole.id];
  }

  private async validateReferences(
    tenantId: string,
    reportingManagerEmployeeId?: string,
    userId?: string,
    departmentId?: string,
    designationId?: string,
    employeeLevelId?: string,
    locationId?: string,
    officialJoiningLocationId?: string,
    nationalityCountryId?: string,
    countryId?: string,
    stateProvinceId?: string,
    cityId?: string,
    emergencyContactRelationTypeId?: string,
    workEmail?: string,
    employeeId?: string,
  ) {
    let linkedUserEmail: string | undefined;
    let nationality: string | undefined;
    let countryName: string | undefined;
    let stateProvinceName: string | undefined;
    let cityName: string | undefined;

    if (reportingManagerEmployeeId) {
      await this.validateManagerAssignment(
        tenantId,
        employeeId,
        reportingManagerEmployeeId,
      );
    }

    if (userId) {
      const user = await this.usersRepository.findByIdWithAccess(userId);

      if (!user || user.tenantId !== tenantId) {
        throw new BadRequestException(
          'Selected user does not belong to this tenant.',
        );
      }

      linkedUserEmail = user.email;

      if (workEmail && normalizeEmail(workEmail) !== user.email) {
        throw new BadRequestException(
          'Work email must match the linked user authentication email.',
        );
      }
    }

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

    if (employeeLevelId) {
      const employeeLevel = await this.prisma.employeeLevel.findFirst({
        where: { tenantId, id: employeeLevelId, isActive: true },
        select: { id: true },
      });

      if (!employeeLevel) {
        throw new BadRequestException(
          'Selected employee level does not belong to this tenant or is inactive.',
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

    if (officialJoiningLocationId) {
      const location = await this.organizationRepository.findLocationById(
        tenantId,
        officialJoiningLocationId,
      );

      if (!location) {
        throw new BadRequestException(
          'Selected official joining location does not belong to this tenant.',
        );
      }
    }

    if (nationalityCountryId) {
      const country = await this.prisma.country.findFirst({
        where: { id: nationalityCountryId, isActive: true },
        select: { name: true },
      });

      if (!country) {
        throw new BadRequestException('Selected nationality is invalid.');
      }

      nationality = country.name;
    }

    if (countryId) {
      const country = await this.prisma.country.findFirst({
        where: { id: countryId, isActive: true },
        select: { id: true, name: true },
      });

      if (!country) {
        throw new BadRequestException('Selected country is invalid.');
      }

      countryName = country.name;
    }

    if (stateProvinceId) {
      const stateProvince = await this.prisma.stateProvince.findFirst({
        where: {
          id: stateProvinceId,
          isActive: true,
          ...(countryId ? { countryId } : {}),
        },
        select: { id: true, name: true },
      });

      if (!stateProvince) {
        throw new BadRequestException(
          'Selected state or province is invalid for the chosen country.',
        );
      }

      stateProvinceName = stateProvince.name;
    }

    if (cityId) {
      const city = await this.prisma.city.findFirst({
        where: {
          id: cityId,
          isActive: true,
          ...(countryId ? { countryId } : {}),
          ...(stateProvinceId ? { stateProvinceId } : {}),
        },
        select: { id: true, name: true },
      });

      if (!city) {
        throw new BadRequestException(
          'Selected city is invalid for the chosen state or country.',
        );
      }

      cityName = city.name;
    }

    if (emergencyContactRelationTypeId) {
      const relationType = await this.prisma.relationType.findFirst({
        where: {
          id: emergencyContactRelationTypeId,
          isActive: true,
          OR: [{ tenantId }, { tenantId: null }],
        },
        select: { id: true },
      });

      if (!relationType) {
        throw new BadRequestException(
          'Selected emergency contact relation type is invalid.',
        );
      }
    }

    return {
      linkedUserEmail,
      nationality,
      countryName,
      stateProvinceName,
      cityName,
    };
  }

  private async validateManagerAssignment(
    tenantId: string,
    employeeId: string | undefined,
    managerEmployeeId?: string,
  ) {
    if (!managerEmployeeId) {
      return;
    }

    if (employeeId && managerEmployeeId === employeeId) {
      throw new BadRequestException('An employee cannot be their own manager.');
    }

    const manager =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        tenantId,
        managerEmployeeId,
      );

    if (!manager) {
      throw new BadRequestException(
        'Selected manager does not belong to this tenant.',
      );
    }

    if (employeeId) {
      await this.assertNoCircularReporting(
        tenantId,
        employeeId,
        managerEmployeeId,
      );
    }
  }

  private async assertNoCircularReporting(
    tenantId: string,
    employeeId: string,
    managerEmployeeId: string,
  ) {
    const visited = new Set<string>();
    let currentManagerId: string | null | undefined = managerEmployeeId;
    let depth = 0;

    while (currentManagerId) {
      if (currentManagerId === employeeId) {
        throw new BadRequestException(
          'This reporting line would create a circular hierarchy.',
        );
      }

      if (visited.has(currentManagerId)) {
        throw new BadRequestException(
          'The existing reporting structure already contains a circular relationship.',
        );
      }

      visited.add(currentManagerId);
      depth += 1;

      if (depth > 50) {
        throw new BadRequestException(
          'Hierarchy depth is too large to validate safely.',
        );
      }

      const node =
        await this.employeesRepository.findHierarchyNodeByIdAndTenant(
          tenantId,
          currentManagerId,
        );

      if (!node) {
        throw new BadRequestException(
          'Selected manager does not belong to this tenant.',
        );
      }

      currentManagerId = node.managerEmployeeId;
    }
  }

  private assertEmployeeSettingsRulesForCreate(
    dto: CreateEmployeeDto,
    settings: EmployeeSettingsResolved,
  ) {
    if (settings.requirePersonalEmail && !dto.personalEmail?.trim()) {
      throw new BadRequestException(
        'Personal email is required by tenant employee settings.',
      );
    }
    if (settings.requireEmergencyContact && !dto.emergencyContactName?.trim()) {
      throw new BadRequestException(
        'Emergency contact details are required by tenant employee settings.',
      );
    }
    if (settings.requireDepartment && !dto.departmentId?.trim()) {
      throw new BadRequestException(
        'Department is required by tenant employee settings.',
      );
    }
    if (settings.requireDesignation && !dto.designationId?.trim()) {
      throw new BadRequestException(
        'Designation is required by tenant employee settings.',
      );
    }
    if (
      settings.requireReportingManager &&
      !dto.reportingManagerEmployeeId?.trim()
    ) {
      throw new BadRequestException(
        'Reporting manager is required by tenant employee settings.',
      );
    }
    if (settings.requireWorkLocation && !dto.locationId?.trim()) {
      throw new BadRequestException(
        'Work location is required by tenant employee settings.',
      );
    }
  }

  private assertEmployeeSettingsRulesForUpdate(
    dto: UpdateEmployeeDto,
    employee: EmployeeWithRelations,
    settings: EmployeeSettingsResolved,
  ) {
    const nextPersonalEmail = dto.personalEmail ?? employee.personalEmail;
    const nextEmergencyContactName =
      dto.emergencyContactName ?? employee.emergencyContactName;
    const nextDepartmentId = dto.departmentId ?? employee.departmentId;
    const nextDesignationId = dto.designationId ?? employee.designationId;
    const nextManagerId =
      dto.reportingManagerEmployeeId ?? employee.managerEmployeeId;
    const nextLocationId = dto.locationId ?? employee.locationId;
    const nextStatus = dto.employmentStatus ?? employee.employmentStatus;

    if (settings.requirePersonalEmail && !nextPersonalEmail?.trim()) {
      throw new BadRequestException(
        'Personal email is required by tenant employee settings.',
      );
    }
    if (settings.requireEmergencyContact && !nextEmergencyContactName?.trim()) {
      throw new BadRequestException(
        'Emergency contact details are required by tenant employee settings.',
      );
    }
    if (
      settings.preventActivationUntilMandatoryFieldsCompleted &&
      nextStatus === EmployeeEmploymentStatus.ACTIVE
    ) {
      if (settings.requireDepartment && !nextDepartmentId) {
        throw new BadRequestException(
          'Department is required before employee activation.',
        );
      }
      if (settings.requireDesignation && !nextDesignationId) {
        throw new BadRequestException(
          'Designation is required before employee activation.',
        );
      }
      if (settings.requireReportingManager && !nextManagerId) {
        throw new BadRequestException(
          'Reporting manager is required before employee activation.',
        );
      }
      if (settings.requireWorkLocation && !nextLocationId) {
        throw new BadRequestException(
          'Work location is required before employee activation.',
        );
      }
    }
  }

  private async assertEmployeeDuplicateRules(
    tenantId: string,
    dto: Pick<CreateEmployeeDto, 'personalEmail' | 'phone' | 'cnic'>,
    settings: EmployeeSettingsResolved,
    excludeEmployeeId?: string,
  ) {
    await this.duplicateRuleEngine.checkEmployeeDuplicates({
      tenantId,
      payload: dto,
      excludeEmployeeId,
      rules: [
        {
          key: 'personalEmail',
          label: 'Personal email',
          enabled: settings.preventDuplicateByPersonalEmail,
          severity: 'BLOCK',
          value: (payload) => payload.personalEmail?.toLowerCase(),
          buildWhere: (value) => ({
            personalEmail: value,
          }),
        },
        {
          key: 'phone',
          label: 'Phone number',
          enabled: settings.preventDuplicateByPhoneNumber,
          severity: settings.warnOnPossibleDuplicate ? 'WARN' : 'BLOCK',
          value: (payload) => payload.phone,
          buildWhere: (value) => ({
            phone: value,
          }),
        },
        {
          key: 'nationalId',
          label: 'National identity value',
          enabled: settings.preventDuplicateByNationalId,
          severity: 'BLOCK',
          value: (payload) => payload.cnic,
          buildWhere: (value) => ({
            cnic: value,
          }),
        },
      ],
    });
  }

  private buildCreateData(
    tenantId: string,
    dto: CreateEmployeeDto,
    actorId: string,
    linkedUserEmail?: string,
    referenceLabels?: {
      nationality?: string;
      countryName?: string;
      stateProvinceName?: string;
      cityName?: string;
    },
  ): Prisma.EmployeeUncheckedCreateInput {
    const employeeCode = dto.employeeCode?.trim();

    if (!employeeCode) {
      throw new BadRequestException('Employee code is required.');
    }

    return {
      tenantId,
      employeeCode: employeeCode.toUpperCase(),
      recordType: dto.recordType ?? 'INTERNAL_EMPLOYEE',
      firstName: dto.firstName.trim(),
      middleName: dto.middleName?.trim(),
      lastName: dto.lastName.trim(),
      preferredName: dto.preferredName?.trim(),
      email: linkedUserEmail ?? dto.workEmail?.trim().toLowerCase(),
      personalEmail: dto.personalEmail?.trim().toLowerCase(),
      phone: dto.phone.trim(),
      alternatePhone: dto.alternatePhone?.trim(),
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      maritalStatus: dto.maritalStatus,
      nationalityCountryId: dto.nationalityCountryId,
      nationality: referenceLabels?.nationality ?? dto.nationality?.trim(),
      cnic: dto.cnic?.trim(),
      bloodGroup: dto.bloodGroup?.trim().toUpperCase(),
      employmentStatus: dto.employmentStatus,
      employeeType: dto.employeeType,
      workMode: dto.workMode,
      contractType: dto.contractType,
      hireDate: new Date(dto.hireDate),
      confirmationDate: dto.confirmationDate
        ? new Date(dto.confirmationDate)
        : undefined,
      probationEndDate: dto.probationEndDate
        ? new Date(dto.probationEndDate)
        : undefined,
      terminationDate: dto.terminationDate
        ? new Date(dto.terminationDate)
        : undefined,
      addressLine1: dto.addressLine1?.trim(),
      addressLine2: dto.addressLine2?.trim(),
      countryId: dto.countryId,
      stateProvinceId: dto.stateProvinceId,
      cityId: dto.cityId,
      city: referenceLabels?.cityName ?? dto.city?.trim(),
      stateProvince:
        referenceLabels?.stateProvinceName ?? dto.stateProvince?.trim(),
      country: referenceLabels?.countryName ?? dto.country?.trim(),
      postalCode: dto.postalCode?.trim(),
      emergencyContactName: dto.emergencyContactName?.trim(),
      emergencyContactRelationTypeId: dto.emergencyContactRelationTypeId,
      emergencyContactRelation: dto.emergencyContactRelation?.trim(),
      emergencyContactPhone: dto.emergencyContactPhone?.trim(),
      emergencyContactAlternatePhone:
        dto.emergencyContactAlternatePhone?.trim(),
      departmentId: dto.departmentId?.trim(),
      businessUnitId: dto.businessUnitId?.trim(),
      designationId: dto.designationId?.trim(),
      employeeLevelId: dto.employeeLevelId?.trim(),
      locationId: dto.locationId,
      officialJoiningLocationId: dto.officialJoiningLocationId,
      managerEmployeeId: dto.reportingManagerEmployeeId,
      userId: dto.userId,
      noticePeriodDays: dto.noticePeriodDays,
      taxIdentifier: dto.taxIdentifier?.trim(),
      createdById: actorId,
      updatedById: actorId,
    };
  }

  private buildUpdateData(
    dto: UpdateEmployeeDto,
    actorId: string,
    linkedUserEmail?: string,
    referenceLabels?: {
      nationality?: string;
      countryName?: string;
      stateProvinceName?: string;
      cityName?: string;
    },
  ): Prisma.EmployeeUncheckedUpdateInput {
    const data: Prisma.EmployeeUncheckedUpdateInput = {
      updatedById: actorId,
    };

    if (dto.employeeCode !== undefined) {
      data.employeeCode = dto.employeeCode.trim().toUpperCase();
    }

    if (dto.recordType !== undefined) {
      data.recordType = dto.recordType;
    }

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }

    if (dto.middleName !== undefined) {
      data.middleName = dto.middleName?.trim() ?? null;
    }

    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }

    if (dto.preferredName !== undefined) {
      data.preferredName = dto.preferredName?.trim() ?? null;
    }

    if (dto.workEmail !== undefined || linkedUserEmail !== undefined) {
      data.email =
        linkedUserEmail ?? dto.workEmail?.trim().toLowerCase() ?? null;
    }

    if (dto.personalEmail !== undefined) {
      data.personalEmail = dto.personalEmail?.trim().toLowerCase() ?? null;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim();
    }

    if (dto.alternatePhone !== undefined) {
      data.alternatePhone = dto.alternatePhone?.trim() ?? null;
    }

    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }

    if (dto.gender !== undefined) {
      data.gender = dto.gender ?? null;
    }

    if (dto.maritalStatus !== undefined) {
      data.maritalStatus = dto.maritalStatus ?? null;
    }

    if (dto.nationalityCountryId !== undefined) {
      data.nationalityCountryId = dto.nationalityCountryId ?? null;
    }

    if (dto.nationality !== undefined) {
      data.nationality =
        referenceLabels?.nationality ?? dto.nationality?.trim() ?? null;
    }

    if (dto.cnic !== undefined) {
      data.cnic = dto.cnic?.trim() ?? null;
    }

    if (dto.bloodGroup !== undefined) {
      data.bloodGroup = dto.bloodGroup?.trim().toUpperCase() ?? null;
    }

    if (dto.employmentStatus !== undefined) {
      data.employmentStatus = dto.employmentStatus;
    }

    if (dto.employeeType !== undefined) {
      data.employeeType = dto.employeeType ?? null;
    }

    if (dto.workMode !== undefined) {
      data.workMode = dto.workMode ?? null;
    }

    if (dto.contractType !== undefined) {
      data.contractType = dto.contractType ?? null;
    }

    if (dto.hireDate !== undefined) {
      data.hireDate = new Date(dto.hireDate);
    }

    if (dto.confirmationDate !== undefined) {
      data.confirmationDate = dto.confirmationDate
        ? new Date(dto.confirmationDate)
        : null;
    }

    if (dto.probationEndDate !== undefined) {
      data.probationEndDate = dto.probationEndDate
        ? new Date(dto.probationEndDate)
        : null;
    }

    if (dto.terminationDate !== undefined) {
      data.terminationDate = dto.terminationDate
        ? new Date(dto.terminationDate)
        : null;
    }

    if (dto.addressLine1 !== undefined) {
      data.addressLine1 = dto.addressLine1?.trim() ?? null;
    }

    if (dto.addressLine2 !== undefined) {
      data.addressLine2 = dto.addressLine2?.trim() ?? null;
    }

    if (dto.countryId !== undefined) {
      data.countryId = dto.countryId ?? null;
    }

    if (dto.stateProvinceId !== undefined) {
      data.stateProvinceId = dto.stateProvinceId ?? null;
    }

    if (dto.cityId !== undefined) {
      data.cityId = dto.cityId ?? null;
    }

    if (dto.city !== undefined) {
      data.city = referenceLabels?.cityName ?? dto.city?.trim() ?? null;
    }

    if (dto.stateProvince !== undefined) {
      data.stateProvince =
        referenceLabels?.stateProvinceName ?? dto.stateProvince?.trim() ?? null;
    }

    if (dto.country !== undefined) {
      data.country =
        referenceLabels?.countryName ?? dto.country?.trim() ?? null;
    }

    if (dto.postalCode !== undefined) {
      data.postalCode = dto.postalCode?.trim() ?? null;
    }

    if (dto.emergencyContactName !== undefined) {
      data.emergencyContactName = dto.emergencyContactName?.trim() ?? null;
    }

    if (dto.emergencyContactRelationTypeId !== undefined) {
      data.emergencyContactRelationTypeId =
        dto.emergencyContactRelationTypeId ?? null;
    }

    if (dto.emergencyContactRelation !== undefined) {
      data.emergencyContactRelation =
        dto.emergencyContactRelation?.trim() ?? null;
    }

    if (dto.emergencyContactPhone !== undefined) {
      data.emergencyContactPhone = dto.emergencyContactPhone?.trim() ?? null;
    }

    if (dto.emergencyContactAlternatePhone !== undefined) {
      data.emergencyContactAlternatePhone =
        dto.emergencyContactAlternatePhone?.trim() ?? null;
    }

    if (dto.departmentId !== undefined) {
      data.departmentId = dto.departmentId?.trim() ?? null;
    }

    if (dto.businessUnitId !== undefined) {
      data.businessUnitId = dto.businessUnitId?.trim() ?? null;
    }

    if (dto.designationId !== undefined) {
      data.designationId = dto.designationId?.trim() ?? null;
    }

    if (dto.employeeLevelId !== undefined) {
      data.employeeLevelId = dto.employeeLevelId?.trim() ?? null;
    }

    if (dto.locationId !== undefined) {
      data.locationId = dto.locationId ?? null;
    }

    if (dto.officialJoiningLocationId !== undefined) {
      data.officialJoiningLocationId = dto.officialJoiningLocationId ?? null;
    }

    if (dto.reportingManagerEmployeeId !== undefined) {
      data.managerEmployeeId = dto.reportingManagerEmployeeId ?? null;
    }

    if (dto.userId !== undefined) {
      data.userId = dto.userId ?? null;
    }

    if (dto.noticePeriodDays !== undefined) {
      data.noticePeriodDays = dto.noticePeriodDays ?? null;
    }

    if (dto.taxIdentifier !== undefined) {
      data.taxIdentifier = dto.taxIdentifier?.trim() ?? null;
    }

    return data;
  }

  private mapEmployee(employee: EmployeeWithRelations) {
    return {
      id: employee.id,
      tenantId: employee.tenantId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName: [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(' '),
      profileImageDocumentId: employee.profileImageDocumentId,
      workEmail: employee.email,
      personalEmail: employee.personalEmail,
      phone: employee.phone,
      alternatePhone: employee.alternatePhone,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      nationalityCountryId: employee.nationalityCountryId,
      nationality: employee.nationality,
      cnic: employee.cnic,
      bloodGroup: employee.bloodGroup,
      employmentStatus: employee.employmentStatus,
      employeeType: employee.employeeType,
      workMode: employee.workMode,
      contractType: employee.contractType,
      hireDate: employee.hireDate,
      confirmationDate: employee.confirmationDate,
      probationEndDate: employee.probationEndDate,
      terminationDate: employee.terminationDate,
      addressLine1: employee.addressLine1,
      addressLine2: employee.addressLine2,
      countryId: employee.countryId,
      stateProvinceId: employee.stateProvinceId,
      cityId: employee.cityId,
      city: employee.cityLookup?.name ?? employee.city,
      stateProvince:
        employee.stateProvinceLookup?.name ?? employee.stateProvince,
      country: employee.countryLookup?.name ?? employee.country,
      postalCode: employee.postalCode,
      emergencyContactName: employee.emergencyContactName,
      emergencyContactRelationTypeId: employee.emergencyContactRelationTypeId,
      emergencyContactRelation: employee.emergencyContactRelation,
      emergencyContactPhone: employee.emergencyContactPhone,
      emergencyContactAlternatePhone: employee.emergencyContactAlternatePhone,
      departmentId: employee.departmentId,
      designationId: employee.designationId,
      employeeLevelId: employee.employeeLevelId,
      locationId: employee.locationId,
      officialJoiningLocationId: employee.officialJoiningLocationId,
      managerEmployeeId: employee.managerEmployeeId,
      reportingManagerEmployeeId: employee.managerEmployeeId,
      userId: employee.userId,
      noticePeriodDays: employee.noticePeriodDays,
      taxIdentifier: employee.taxIdentifier,
      isDraftProfile: employee.isDraftProfile,
      sourceCandidateId: employee.sourceCandidateId,
      sourceApplicationId: employee.sourceApplicationId,
      sourceJobOpeningId: employee.sourceJobOpeningId,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      manager: employee.manager
        ? {
            id: employee.manager.id,
            employeeCode: employee.manager.employeeCode,
            firstName: employee.manager.firstName,
            lastName: employee.manager.lastName,
            preferredName: employee.manager.preferredName,
            employmentStatus: employee.manager.employmentStatus,
          }
        : null,
      reportingManager: employee.manager
        ? {
            id: employee.manager.id,
            employeeCode: employee.manager.employeeCode,
            firstName: employee.manager.firstName,
            lastName: employee.manager.lastName,
            preferredName: employee.manager.preferredName,
            employmentStatus: employee.manager.employmentStatus,
          }
        : null,
      user: employee.user
        ? {
            id: employee.user.id,
            email: employee.user.email,
            firstName: employee.user.firstName,
            lastName: employee.user.lastName,
            status: employee.user.status,
            roles: employee.user.userRoles.map((userRole) => ({
              id: userRole.role.id,
              key: userRole.role.key,
              name: userRole.role.name,
            })),
          }
        : null,
      profileImage: employee.profileImageDocument
        ? {
            id: employee.profileImageDocument.id,
            fileName: employee.profileImageDocument.originalFileName,
            mimeType: employee.profileImageDocument.mimeType,
            size: employee.profileImageDocument.sizeInBytes,
          }
        : null,
      department: employee.department
        ? {
            id: employee.department.id,
            name: employee.department.name,
            code: employee.department.code,
            isActive: employee.department.isActive,
          }
        : null,
      designation: employee.designation
        ? {
            id: employee.designation.id,
            name: employee.designation.name,
            level: employee.designation.level,
            isActive: employee.designation.isActive,
          }
        : null,
      employeeLevel: employee.employeeLevel
        ? {
            id: employee.employeeLevel.id,
            code: employee.employeeLevel.code,
            name: employee.employeeLevel.name,
            rank: employee.employeeLevel.rank,
            description: employee.employeeLevel.description,
            isActive: employee.employeeLevel.isActive,
          }
        : null,
      location: employee.location
        ? {
            id: employee.location.id,
            name: employee.location.name,
            city: employee.location.city,
            state: employee.location.state,
            country: employee.location.country,
            timezone: employee.location.timezone,
            isActive: employee.location.isActive,
          }
        : null,
      officialJoiningLocation: employee.officialJoiningLocation
        ? {
            id: employee.officialJoiningLocation.id,
            name: employee.officialJoiningLocation.name,
            city: employee.officialJoiningLocation.city,
            state: employee.officialJoiningLocation.state,
            country: employee.officialJoiningLocation.country,
            timezone: employee.officialJoiningLocation.timezone,
            isActive: employee.officialJoiningLocation.isActive,
          }
        : null,
      counts: {
        directReports: employee._count.directReports,
        educationRecords: employee._count.educationRecords,
        historyRecords: employee._count.historyRecords,
        documents: employee._count.documentLinks,
        emergencyContacts: employee._count.emergencyContacts,
        documentReferences: employee._count.documentReferences,
      },
    };
  }

  private async buildManagerChain(
    tenantId: string,
    managerEmployeeId?: string | null,
  ) {
    const chain: EmployeeHierarchyNode[] = [];
    const visited = new Set<string>();
    let currentManagerId = managerEmployeeId;
    let depth = 0;

    while (currentManagerId) {
      if (visited.has(currentManagerId)) {
        break;
      }

      visited.add(currentManagerId);
      depth += 1;

      if (depth > 50) {
        break;
      }

      const manager =
        await this.employeesRepository.findHierarchyNodeByIdAndTenant(
          tenantId,
          currentManagerId,
        );

      if (!manager) {
        break;
      }

      chain.push(manager);
      currentManagerId = manager.managerEmployeeId;
    }

    return chain.reverse();
  }

  private mapHierarchyNode(employee: EmployeeHierarchyNode) {
    return {
      id: employee.id,
      tenantId: employee.tenantId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      employmentStatus: employee.employmentStatus,
      managerEmployeeId: employee.managerEmployeeId,
    };
  }

  private mapHierarchyPreview(employee: EmployeeWithRelations) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      employmentStatus: employee.employmentStatus,
      email: employee.email,
      phone: employee.phone,
      managerEmployeeId: employee.managerEmployeeId,
      designation: employee.designation
        ? {
            id: employee.designation.id,
            name: employee.designation.name,
            level: employee.designation.level,
          }
        : null,
      department: employee.department
        ? {
            id: employee.department.id,
            name: employee.department.name,
            code: employee.department.code,
          }
        : null,
    };
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : '';

      if (target.includes('employeeCode')) {
        throw new ConflictException(
          'Employee code is already in use for this tenant.',
        );
      }

      if (target.includes('email')) {
        throw new ConflictException(
          'Employee work email is already in use for this tenant.',
        );
      }

      if (target.includes('personalEmail')) {
        throw new ConflictException(
          'Employee personal email is already in use for this tenant.',
        );
      }

      if (target.includes('userId')) {
        throw new ConflictException(
          'This user is already linked to another employee.',
        );
      }
    }

    throw error;
  }

  private validateDateRules(
    dto: Pick<
      CreateEmployeeDto | UpdateEmployeeDto,
      | 'dateOfBirth'
      | 'hireDate'
      | 'confirmationDate'
      | 'probationEndDate'
      | 'terminationDate'
    >,
  ) {
    const today = new Date();

    if (dto.dateOfBirth) {
      const dateOfBirth = new Date(dto.dateOfBirth);

      if (dateOfBirth > today) {
        throw new BadRequestException('Date of birth cannot be in the future.');
      }
    }

    if (dto.hireDate && dto.terminationDate) {
      if (new Date(dto.terminationDate) < new Date(dto.hireDate)) {
        throw new BadRequestException(
          'Termination date cannot be before hire date.',
        );
      }
    }

    if (dto.hireDate && dto.confirmationDate) {
      if (new Date(dto.confirmationDate) < new Date(dto.hireDate)) {
        throw new BadRequestException(
          'Confirmation date cannot be before hire date.',
        );
      }
    }

    if ('probationEndDate' in dto && dto.probationEndDate && dto.hireDate) {
      if (new Date(dto.probationEndDate) < new Date(dto.hireDate)) {
        throw new BadRequestException(
          'Probation end date cannot be before hire date.',
        );
      }
    }
  }
}
