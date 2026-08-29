import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeEmploymentStatus,
  EmployeeBenefitAssignmentSource,
  Prisma,
  SecurityPrivilege,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertCsvUpload,
  parseCsvRows,
  type CsvImportResult,
  type CsvImportRowError,
  type ParsedCsvRow,
} from '../../common/utils/csv.util';
import { AppError } from '../../common/errors/app-error';
import { ENTITY_KEYS, ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { normalizeEmail } from '../../common/utils/email.util';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { hasAnyRole } from '../../common/security/role-matching';
import { canManageEmployeeAccountActions } from '../../common/security/employee-account-actions';
import {
  canEditEmployeeRecord,
  ELEVATED_TENANT_ROLE_KEYS,
  hasElevatedTenantRole,
} from '../../common/security/elevated-tenant-roles';
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
import { EmployeeAccessService } from './employee-access.service';
import {
  EmployeeSettingsResolved,
  TenantSettingsResolverService,
} from '../tenant-settings/tenant-settings-resolver.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { BulkDeleteEmployeesDto } from './dto/bulk-delete-employees.dto';
import { BenefitsService } from '../benefits/benefits.service';
import {
  EMPLOYEE_DRAFT_LIFECYCLE,
  EMPLOYEE_RECORD_STATUS,
  EMPLOYEE_RECORD_SUB_STATUS,
} from './employee-lifecycle.constants';

type UploadedImportFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
};

type CsvFile = {
  filename: string;
  buffer: Buffer;
};

const EMPLOYEE_OWNER_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.HR,
]);
const EMPLOYEE_OWNER_ROLES = [
  ROLE_KEYS.GLOBAL_ADMIN,
  'global administrator',
  ROLE_KEYS.SYSTEM_ADMIN,
  'system administrator',
  ROLE_KEYS.HR,
  'hr',
  'hr-manager',
  'hr manager',
] as const;

const EMPLOYEE_EXPORT_COLUMN_LABELS: Record<string, string> = {
  employeeCode: 'Employee Code',
  fullName: 'Full Name',
  workEmail: 'Work Email',
  phone: 'Phone',
  employmentStatus: 'Employment Status',
  departmentId: 'Department',
  department: 'Department',
  designationId: 'Designation',
  designation: 'Designation',
  reportingManagerEmployeeId: 'Reporting Manager',
  reportingManager: 'Reporting Manager',
  ownerUserId: 'Owner',
  ownerName: 'Owner',
  ownerEmail: 'Owner Email',
  hireDate: 'Hire Date',
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isEmployeeInvitationEligibleUser(user: {
  status: UserStatus;
  lastLoginAt?: Date | null;
}) {
  return user.status !== UserStatus.ACTIVE || !user.lastLoginAt;
}

function getUpdateDtoValue<Dto extends object, Key extends keyof Dto, Fallback>(
  dto: Dto,
  key: Key,
  fallback: Fallback,
) {
  return Object.prototype.hasOwnProperty.call(dto, key) ? dto[key] : fallback;
}

/** Whether the caller explicitly sent any of these fields in a partial update. */
function touchesAny<Dto extends object>(
  dto: Dto,
  ...keys: Array<keyof Dto>
): boolean {
  return keys.some((key) =>
    Object.prototype.hasOwnProperty.call(dto, key as PropertyKey),
  );
}

function employeeValidationError(
  message: string,
  fieldErrors: Array<{ field: string; message: string }>,
) {
  return new AppError('VALIDATION_FAILED', {
    message,
    details: { fieldErrors },
  });
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function emergencyContactFieldErrors(input: {
  emergencyContactName?: string | null;
  emergencyContactRelationTypeId?: string | null;
  emergencyContactPhone?: string | null;
}) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.emergencyContactName?.trim()) {
    errors.push({
      field: 'emergencyContactName',
      message: 'Emergency contact name is required.',
    });
  }
  if (!input.emergencyContactRelationTypeId?.trim()) {
    errors.push({
      field: 'emergencyContactRelationTypeId',
      message: 'Emergency contact relation type is required.',
    });
  }
  if (!input.emergencyContactPhone?.trim()) {
    errors.push({
      field: 'emergencyContactPhone',
      message: 'Emergency contact phone is required.',
    });
  }
  return errors;
}

function formatDateForFilename(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeComparableEmail(value?: string | null) {
  return value?.trim().toLowerCase() || undefined;
}

function normalizeComparableValue(value?: string | null) {
  return value?.trim() || undefined;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function exportRowKey(column: string) {
  const map: Record<string, string> = {
    departmentId: 'department',
    designationId: 'designation',
    reportingManagerEmployeeId: 'reportingManager',
    ownerUserId: 'ownerName',
  };

  return map[column] ?? column;
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
    private readonly employeeAccessService: EmployeeAccessService,
    private readonly benefitsService: BenefitsService,
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
      const { employee, isReportingManager } =
        await this.employeeAccessService.getCurrentEmployeeContext(currentUser);
      const directReports =
        employee && isReportingManager
          ? await this.employeesRepository.findByTenant(
              tenantId,
              {
                ...query,
                reportingManagerEmployeeId: employee.id,
              },
              { managerEmployeeId: employee.id },
            )
          : { items: employee ? [employee] : [], total: employee ? 1 : 0 };
      const items = directReports.items.map((item) => this.mapEmployee(item));

      return {
        items,
        meta: {
          page: 1,
          pageSize: query.pageSize,
          total: directReports.total,
          totalPages: Math.max(
            1,
            Math.ceil(directReports.total / query.pageSize),
          ),
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
      ROLE_KEYS.CEO,
      ...ELEVATED_TENANT_ROLE_KEYS,
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

  async getCurrentEmployeeContext(currentUser: AuthenticatedUser) {
    const { employee, isReportingManager } =
      await this.employeeAccessService.getCurrentEmployeeContext(currentUser);

    return {
      employee: employee ? this.mapEmployee(employee) : null,
      isReportingManager,
    };
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

  async getReportingStructure(tenantId: string, employeeId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, isDeleted: false, deletedAt: null },
      select: reportingNodeSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const current = employees.find((employee) => employee.id === employeeId);
    if (!current) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const reportingLine: ReturnType<typeof mapReportingNode>[] = [];
    let managerId = current.managerEmployeeId;
    const reportingLineVisited = new Set<string>([current.id]);
    while (managerId) {
      if (reportingLineVisited.has(managerId)) break;
      reportingLineVisited.add(managerId);
      const manager = byId.get(managerId);
      if (!manager) break;
      reportingLine.unshift(mapReportingNode(manager));
      managerId = manager.managerEmployeeId;
    }

    const directReports = employees
      .filter((employee) => employee.managerEmployeeId === current.id)
      .map(mapReportingNode);

    const childrenByManagerId = new Map<string | null, typeof employees>();
    for (const employee of employees) {
      const key =
        employee.managerEmployeeId && byId.has(employee.managerEmployeeId)
          ? employee.managerEmployeeId
          : null;
      childrenByManagerId.set(key, [
        ...(childrenByManagerId.get(key) ?? []),
        employee,
      ]);
    }

    const buildTree = (
      employee: (typeof employees)[number],
      visited = new Set<string>(),
    ): ReportingTreeNode => ({
      ...mapReportingNode(employee),
      children: visited.has(employee.id)
        ? []
        : (childrenByManagerId.get(employee.id) ?? []).map((child) =>
            buildTree(child, new Set([...visited, employee.id])),
          ),
    });

    return {
      currentEmployee: mapReportingNode(current),
      reportingLine,
      directReports,
      fullTree: (childrenByManagerId.get(null) ?? []).map((employee) =>
        buildTree(employee),
      ),
    };
  }

  async getProjectAllocations(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.findById(currentUser.tenantId, employeeId);
    const assignments = await this.prisma.projectAssignment.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { startDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      projectId: assignment.projectId,
      projectName: assignment.project.name,
      projectCode: assignment.project.code,
      customerName: assignment.project.customer?.name ?? null,
      allocationType: assignment.allocationType,
      allocationValue:
        assignment.allocationType === 'HOURS'
          ? assignment.allocationHours?.toString()
          : assignment.allocationPercent,
      allocationPercent: assignment.allocationPercent,
      allocationHours: assignment.allocationHours?.toString() ?? null,
      billable: assignment.billableFlag,
      billableFlag: assignment.billableFlag,
      effectiveFrom: assignment.startDate,
      effectiveTo: assignment.endDate,
      status: assignment.status,
      updatedAt: assignment.updatedAt,
    }));
  }

  private async resolveEmployeeCodeForCreate(
    tenantId: string,
    dto: CreateEmployeeDto,
    settings: EmployeeSettingsResolved,
    tx: Prisma.TransactionClient,
  ) {
    const manualEmployeeCode = dto.employeeCode?.trim();

    if (!settings.autoGenerateEmployeeId) {
      if (!manualEmployeeCode) {
        throw new BadRequestException('Employee code is required.');
      }

      return manualEmployeeCode.toUpperCase();
    }

    // An explicitly supplied code wins even when generation is enabled.
    // Migrations carry existing payroll and badge identifiers, and silently
    // replacing them with a generated sequence would rewrite the natural key
    // the customer recognises. Uniqueness is still enforced downstream.
    if (manualEmployeeCode) {
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
          value: (payload) => normalizeComparableEmail(payload.personalEmail),
          buildWhere: (value) => ({
            personalEmail: value,
          }),
        },
        {
          /*
           * BUG-1974 — the control existed on the Duplicate Prevention section
           * and no rule was ever built from it. `Employee.email` is the work
           * email; `personalEmail` above is the other one.
           */
          key: 'workEmail',
          label: 'Work email',
          enabled: employeeSettings.preventDuplicateWorkEmail,
          severity: 'BLOCK',
          value: (payload) => normalizeComparableEmail(payload.workEmail),
          buildWhere: (value) => ({
            email: value,
          }),
        },
        {
          key: 'phone',
          label: 'Phone number',
          enabled: employeeSettings.preventDuplicateByPhoneNumber,
          severity: employeeSettings.warnOnPossibleDuplicate ? 'WARN' : 'BLOCK',
          value: (payload) => normalizeComparableValue(payload.phone),
          buildWhere: (value) => ({
            phone: value,
          }),
        },
        {
          key: 'nationalId',
          label: 'National identity value',
          enabled: employeeSettings.preventDuplicateByNationalId,
          severity: 'BLOCK',
          value: (payload) => normalizeComparableValue(payload.cnic),
          buildWhere: (value) => ({
            cnic: value,
          }),
        },
      ],
    });

    return { conflicts };
  }

  /**
   * Employee reads are filtered by business-unit scope, so a record created
   * without one is invisible to everybody except elevated roles — including the
   * person who just created it, who then has no way to find or fix it. When the
   * caller does not supply a scope, inherit it from the chosen department and
   * fall back to the creator's own business unit.
   */
  private async resolveCreateScopeDefaults(
    tenantId: string,
    currentUser: AuthenticatedUser,
    dto: CreateEmployeeDto,
  ): Promise<{ businessUnitId?: string; organizationId?: string }> {
    if (dto.businessUnitId && dto.organizationId) {
      return {};
    }

    let businessUnitId = dto.businessUnitId ?? null;

    if (!businessUnitId && dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId },
        select: { businessUnitId: true },
      });
      businessUnitId = department?.businessUnitId ?? null;
    }

    if (!businessUnitId) {
      const creator = await this.prisma.user.findFirst({
        where: { id: currentUser.userId, tenantId },
        select: { businessUnitId: true },
      });
      businessUnitId = creator?.businessUnitId ?? null;
    }

    if (!businessUnitId) {
      return {};
    }

    let organizationId = dto.organizationId ?? null;

    if (!organizationId) {
      const businessUnit = await this.prisma.businessUnit.findFirst({
        where: { id: businessUnitId, tenantId },
        select: { organizationId: true },
      });
      organizationId = businessUnit?.organizationId ?? null;
    }

    return {
      ...(dto.businessUnitId ? {} : { businessUnitId }),
      ...(dto.organizationId || !organizationId ? {} : { organizationId }),
    };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmployeeDto) {
    const tenantId = currentUser.tenantId;
    const employeeSettings =
      await this.tenantSettingsResolverService.getEmployeeSettings(tenantId);

    this.assertEmployeeSettingsRulesForCreate(dto, employeeSettings);
    await this.assertEmployeeDuplicateRules(tenantId, dto, employeeSettings);

    const scopeDefaults = await this.resolveCreateScopeDefaults(
      tenantId,
      currentUser,
      dto,
    );

    const createDto: CreateEmployeeDto = {
      ...dto,
      ...scopeDefaults,
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

    if (dto.ownerUserId && dto.ownerUserId !== currentUser.userId) {
      await this.assertAssignableOwner(currentUser, dto.ownerUserId);
    }
    await this.assertActiveWorkSchedule(tenantId, dto.defaultWorkScheduleId);

    const referenceContext = await this.validateReferences(
      tenantId,
      dto.reportingManagerEmployeeId,
      dto.userId,
      createDto.organizationId,
      createDto.businessUnitId,
      dto.departmentId,
      dto.teamId,
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
      employeeSettings,
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

    await this.assignDefaultBenefitsSafely(
      currentUser,
      createdEmployeeId,
      EmployeeBenefitAssignmentSource.HIRING,
      new Date(createDto.hireDate),
    );

    return this.findById(tenantId, createdEmployeeId);
  }

  /**
   * Confirms the editor may act on this specific record.
   *
   * Editing is limited to the records the user can already see, so a manager
   * edits their own reporting line while HR and the administrator roles keep
   * their wider scope.
   */
  private async assertEmployeeWriteScope(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (hasElevatedTenantRole(currentUser)) {
      return;
    }

    const visible = await this.employeesRepository.findByIdAndTenant(
      currentUser.tenantId,
      employeeId,
      await this.employeeAccessService.buildReadableEmployeeWhere(currentUser),
    );

    if (!visible) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to edit this employee record.',
      });
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    if (!canEditEmployeeRecord(currentUser)) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to edit this employee record.',
      });
    }

    const tenantId = currentUser.tenantId;

    // The role gate above says the user may edit employees; it does not say
    // which ones. Without this, any editor role could update every record in
    // the tenant regardless of business unit or reporting line.
    await this.assertEmployeeWriteScope(currentUser, employeeId);

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
    this.preserveUnchangedDependentLookups(dto, employee);
    this.assertEmployeeSettingsRulesForUpdate(dto, employee, employeeSettings);
    await this.assertEmployeeDuplicateRules(
      tenantId,
      {
        employeeCode: dto.employeeCode ?? employee.employeeCode,
        firstName: dto.firstName ?? employee.firstName,
        lastName: dto.lastName ?? employee.lastName,
        phone: dto.phone ?? employee.phone,
        personalEmail: getUpdateDtoValue(
          dto,
          'personalEmail',
          employee.personalEmail ?? undefined,
        ),
        cnic: getUpdateDtoValue(dto, 'cnic', employee.cnic ?? undefined),
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
      dto.organizationId !== undefined
        ? dto.organizationId
        : dto.businessUnitId !== undefined ||
            dto.departmentId !== undefined ||
            dto.teamId !== undefined
          ? (employee.organizationId ?? undefined)
          : undefined,
      dto.businessUnitId !== undefined
        ? dto.businessUnitId
        : dto.departmentId !== undefined || dto.teamId !== undefined
          ? (employee.businessUnitId ?? undefined)
          : undefined,
      dto.departmentId !== undefined
        ? dto.departmentId
        : dto.teamId !== undefined
          ? (employee.departmentId ?? undefined)
          : undefined,
      dto.teamId,
      dto.designationId !== undefined
        ? dto.designationId
        : dto.employeeLevelId !== undefined
          ? (employee.designationId ?? undefined)
          : undefined,
      dto.employeeLevelId,
      dto.locationId,
      dto.officialJoiningLocationId,
      dto.nationalityCountryId,
      dto.countryId,
      dto.stateProvinceId,
      dto.cityId,
      dto.emergencyContactRelationTypeId,
      dto.workEmail,
      employeeSettings,
      employeeId,
    );
    this.validateDateRules(dto);

    if (hasNonEmptyString(dto.ownerUserId)) {
      await this.assertAssignableOwner(currentUser, dto.ownerUserId);
    }
    await this.assertActiveWorkSchedule(tenantId, dto.defaultWorkScheduleId);

    try {
      const result = await this.employeesRepository.update(
        tenantId,
        employeeId,
        removeUndefinedValues(
          this.buildUpdateData(
            dto,
            currentUser.userId,
            referenceContext.linkedUserEmail,
            referenceContext,
            {
              isDraftProfile: employee.isDraftProfile,
              status: employee.status,
              subStatus: employee.subStatus,
            },
          ),
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

      if (
        dto.employeeLevelId !== undefined &&
        dto.employeeLevelId !== employee.employeeLevelId
      ) {
        await this.assignDefaultBenefitsSafely(
          currentUser,
          employeeId,
          EmployeeBenefitAssignmentSource.PROMOTION,
          new Date(),
        );
      }

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

  async bulkDelete(
    currentUser: AuthenticatedUser,
    dto: BulkDeleteEmployeesDto,
  ) {
    const ids = [...new Set(dto.ids)];

    if (ids.length === 0) {
      return {
        success: false,
        deletedCount: 0,
        message: 'No employee records were selected.',
      };
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId: currentUser.tenantId,
        id: {
          in: ids,
        },
        isDeleted: false,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        employmentStatus: true,
        ownerUserId: true,
      },
    });

    if (employees.length === 0) {
      return {
        success: false,
        deletedCount: 0,
        message: 'No matching employee records were found.',
      };
    }

    const employeeIds = employees.map((employee) => employee.id);
    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: employeeIds,
          },
        },
        data: {
          deletedAt,
          deletedById: currentUser.userId,
          isDeleted: true,
          updatedAt: deletedAt,
        },
      });

      for (const employee of employees) {
        await tx.auditLog.create({
          data: {
            tenantId: currentUser.tenantId,
            actorUserId: currentUser.userId,
            entityType: 'Employee',
            entityId: employee.id,
            action: 'EMPLOYEE_ARCHIVED',
            beforeSnapshot: {
              employeeCode: employee.employeeCode,
              employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
              previousEmploymentStatus: employee.employmentStatus,
              ownerUserId: employee.ownerUserId,
            },
            afterSnapshot: {
              deletedAt: deletedAt.toISOString(),
              deletedById: currentUser.userId,
              isDeleted: true,
            },
          },
        });
      }
    });

    return {
      success: true,
      deletedCount: employeeIds.length,
      deletedIds: employeeIds,
      message: `${employeeIds.length} employee record${
        employeeIds.length === 1 ? '' : 's'
      } deleted successfully.`,
    };
  }

  async assignOwner(
    currentUser: AuthenticatedUser,
    employeeIds: string[],
    ownerUserId: string,
  ) {
    this.assertOwnerAssignmentRole(currentUser);

    const ids = [...new Set(employeeIds)];

    if (ids.length === 0) {
      throw new BadRequestException('Select at least one employee.');
    }

    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        tenantId: currentUser.tenantId,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: {
              key: { in: Array.from(EMPLOYEE_OWNER_ROLE_KEYS) },
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userRoles: {
          select: {
            role: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });

    if (!owner) {
      throw new BadRequestException(
        'Owner user was not found for this tenant.',
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId: currentUser.tenantId,
        id: { in: ids },
        isDeleted: false,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        ownerUserId: true,
      },
    });

    if (employees.length !== ids.length) {
      throw new NotFoundException(
        'One or more employee records were not found for this tenant.',
      );
    }

    const assignedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: {
          tenantId: currentUser.tenantId,
          id: { in: ids },
          isDeleted: false,
          deletedAt: null,
        },
        data: {
          ownerUserId: owner.id,
          updatedById: currentUser.userId,
          updatedAt: assignedAt,
        },
      });

      for (const employee of employees) {
        await tx.auditLog.create({
          data: {
            tenantId: currentUser.tenantId,
            actorUserId: currentUser.userId,
            action: 'EMPLOYEE_OWNER_ASSIGNED',
            entityType: 'Employee',
            entityId: employee.id,
            beforeSnapshot: {
              ownerUserId: employee.ownerUserId,
            },
            afterSnapshot: {
              ownerUserId: owner.id,
              ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
              ownerEmail: owner.email,
            },
          },
        });
      }
    });

    return {
      success: true,
      assignedCount: ids.length,
      employeeIds: ids,
      owner: {
        id: owner.id,
        fullName: `${owner.firstName} ${owner.lastName}`.trim(),
        email: owner.email,
      },
    };
  }

  async getOwnerOptions(
    currentUser: AuthenticatedUser,
    query = '',
    page = 1,
    pageSize = 25,
  ) {
    this.assertOwnerAssignmentRole(currentUser);
    const search = query.trim();
    const normalizedPage = Number.isFinite(page) ? Math.max(1, page) : 1;
    const normalizedPageSize = Number.isFinite(pageSize)
      ? Math.min(100, Math.max(1, pageSize))
      : 25;

    const where: Prisma.UserWhereInput = {
      tenantId: currentUser.tenantId,
      status: UserStatus.ACTIVE,
      userRoles: {
        some: {
          role: {
            key: { in: Array.from(EMPLOYEE_OWNER_ROLE_KEYS) },
          },
        },
      },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userRoles: {
            select: {
              role: {
                select: {
                  key: true,
                },
              },
            },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (normalizedPage - 1) * normalizedPageSize,
        take: normalizedPageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        roleKeys: user.userRoles.map((userRole) => userRole.role.key),
      })),
      meta: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
      },
    };
  }

  private assertOwnerAssignmentRole(currentUser: AuthenticatedUser) {
    if (hasAnyRole(currentUser.roleKeys, EMPLOYEE_OWNER_ROLES)) {
      return;
    }

    throw new ForbiddenException(
      'Only Global Admin, System Admin, HR, or HR Manager can assign Employee owners.',
    );
  }

  private async assertAssignableOwner(
    currentUser: AuthenticatedUser,
    ownerUserId: string,
  ) {
    this.assertOwnerAssignmentRole(currentUser);

    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        tenantId: currentUser.tenantId,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: {
              key: { in: Array.from(EMPLOYEE_OWNER_ROLE_KEYS) },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException(
        'Owner user was not found for this tenant.',
      );
    }
  }

  private async assertActiveWorkSchedule(
    tenantId: string,
    workScheduleId?: string | null,
  ) {
    if (!hasNonEmptyString(workScheduleId)) return;
    const schedule = await this.prisma.workSchedule.findFirst({
      where: {
        id: workScheduleId,
        tenantId,
        isActive: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!schedule) {
      throw new BadRequestException(
        'Selected default work schedule is not active for this tenant.',
      );
    }
  }

  /**
   * Imports employees from a CSV produced by the export template.
   *
   * Each row is routed through `create`, so imported records get the same
   * validation, duplicate rules, employee-code generation and business-unit
   * defaulting as one created through the UI. Rows are independent: a bad row
   * is reported with its line number and the rest still import, which is what
   * makes a partial file usable instead of all-or-nothing.
   */
  async importEmployees(
    currentUser: AuthenticatedUser,
    file: UploadedImportFile | undefined,
  ): Promise<CsvImportResult> {
    let rows: ParsedCsvRow[];
    try {
      const validated = assertCsvUpload(file, 'Employee');
      rows = parseCsvRows(validated.buffer.toString('utf8'), 'Employee');
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Employee import failed.',
      );
    }

    const [departments, designations, relationTypes] = await Promise.all([
      this.organizationRepository.findDepartments(currentUser.tenantId, {}),
      this.organizationRepository.findDesignations(currentUser.tenantId, {}),
      // Tenant settings can require an emergency contact relation *type*, which
      // is a lookup id rather than free text, so names are resolved like
      // department and designation are.
      // Relation types ship as a global lookup (tenantId null) that a tenant
      // may extend with its own, so both scopes are matched.
      this.prisma.relationType.findMany({
        where: {
          OR: [{ tenantId: null }, { tenantId: currentUser.tenantId }],
        },
        select: { id: true, name: true },
      }),
    ]);

    const departmentByName = new Map(
      departments.map((item) => [item.name.trim().toLowerCase(), item.id]),
    );
    const designationByName = new Map(
      designations.map((item) => [item.name.trim().toLowerCase(), item.id]),
    );
    const relationTypeByName = new Map(
      relationTypes.map((item) => [item.name.trim().toLowerCase(), item.id]),
    );

    const errors: CsvImportRowError[] = [];
    let successCount = 0;

    for (const row of rows) {
      try {
        await this.create(
          currentUser,
          this.buildImportCreateDto(
            row,
            departmentByName,
            designationByName,
            relationTypeByName,
          ),
        );
        successCount += 1;
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          message:
            error instanceof Error
              ? error.message
              : 'Row could not be imported.',
        });
      }
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEES_IMPORTED',
      entityType: 'Employee',
      entityId: currentUser.tenantId,
      beforeSnapshot: null,
      afterSnapshot: {
        totalRows: rows.length,
        successCount,
        failureCount: errors.length,
      },
      sourceModule: 'employees',
    });

    return {
      totalRows: rows.length,
      successCount,
      failureCount: errors.length,
      errors,
    };
  }

  private buildImportCreateDto(
    row: ParsedCsvRow,
    departmentByName: Map<string, string>,
    designationByName: Map<string, string>,
    relationTypeByName: Map<string, string>,
  ): CreateEmployeeDto {
    const value = (key: string) => row.values[key]?.trim() || undefined;

    const departmentName = value('department');
    const designationName = value('designation');

    if (departmentName && !departmentByName.has(departmentName.toLowerCase())) {
      throw new BadRequestException(
        `Department "${departmentName}" was not found for this tenant.`,
      );
    }

    if (
      designationName &&
      !designationByName.has(designationName.toLowerCase())
    ) {
      throw new BadRequestException(
        `Designation "${designationName}" was not found for this tenant.`,
      );
    }

    const relationTypeName = value('emergencyContactRelationType');

    if (
      relationTypeName &&
      !relationTypeByName.has(relationTypeName.toLowerCase())
    ) {
      throw new BadRequestException(
        `Emergency contact relation type "${relationTypeName}" was not found for this tenant.`,
      );
    }

    return {
      firstName: value('firstName') ?? '',
      middleName: value('middleName'),
      lastName: value('lastName') ?? '',
      preferredName: value('preferredName'),
      workEmail: value('workEmail'),
      personalEmail: value('personalEmail'),
      phone: value('phone') ?? '',
      hireDate: value('hireDate') ?? '',
      employmentStatus: value('employmentStatus') as never,
      employeeType: value('employeeType') as never,
      workMode: value('workMode') as never,
      contractType: value('contractType') as never,
      ...(departmentName
        ? { departmentId: departmentByName.get(departmentName.toLowerCase()) }
        : {}),
      ...(designationName
        ? {
            designationId: designationByName.get(designationName.toLowerCase()),
          }
        : {}),
      emergencyContactName: value('emergencyContactName'),
      emergencyContactPhone: value('emergencyContactPhone'),
      emergencyContactRelation: value('emergencyContactRelation'),
      ...(relationTypeName
        ? {
            emergencyContactRelationTypeId: relationTypeByName.get(
              relationTypeName.toLowerCase(),
            ),
          }
        : {}),
    } as CreateEmployeeDto;
  }

  async exportEmployees(
    currentUser: AuthenticatedUser,
    query: EmployeeQueryDto,
  ): Promise<CsvFile> {
    const response = await this.findByTenant(currentUser, {
      ...query,
      page: 1,
      pageSize: 10000,
    });

    const selectedColumns = this.resolveExportColumns(query.columns);
    const rows = response.items.map((employee) => ({
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      workEmail: employee.workEmail ?? '',
      phone: employee.phone,
      employmentStatus: employee.employmentStatus,
      department: employee.department?.name ?? '',
      designation: employee.designation?.name ?? '',
      reportingManager: employee.reportingManager
        ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
        : '',
      ownerName: employee.ownerUser?.fullName ?? '',
      ownerEmail: employee.ownerUser?.email ?? '',
      hireDate: employee.hireDate
        ? new Date(employee.hireDate).toISOString().slice(0, 10)
        : '',
    }));
    const projectedRows = rows.map((row) =>
      Object.fromEntries(
        selectedColumns.map((column) => [
          EMPLOYEE_EXPORT_COLUMN_LABELS[column] ?? column,
          row[exportRowKey(column) as keyof typeof row],
        ]),
      ),
    );

    return {
      filename: `employees-export-${formatDateForFilename(new Date())}.csv`,
      buffer: Buffer.from(toCsv(projectedRows), 'utf8'),
    };
  }

  private resolveExportColumns(columns: readonly string[] | undefined) {
    const fallback = [
      'employeeCode',
      'fullName',
      'workEmail',
      'phone',
      'employmentStatus',
      'department',
      'designation',
      'reportingManager',
      'ownerName',
      'ownerEmail',
      'hireDate',
    ];

    if (!columns) return fallback;

    const requested = columns
      .map((column) => column.trim())
      .filter((column) => column.length > 0);
    const allowed = requested.filter(
      (column) => EMPLOYEE_EXPORT_COLUMN_LABELS[column],
    );

    return allowed.length ? allowed : fallback;
  }

  exportEmployeeTemplate(): CsvFile {
    const columns = [
      'employeeCode',
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'workEmail',
      'personalEmail',
      'phone',
      'hireDate',
      'employmentStatus',
      'employeeType',
      'workMode',
      'contractType',
      'department',
      'designation',
      'reportingManagerEmployeeCode',
      'ownerEmail',
      // Tenant employee settings can require emergency contact details, and the
      // create path rejects rows without them. Shipping the columns in the
      // template means a file filled from it can actually import.
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelation',
      'emergencyContactRelationType',
    ];

    return {
      filename: 'employees-import-template.csv',
      buffer: Buffer.from(`${columns.join(',')}\n`, 'utf8'),
    };
  }

  async exportEmployeeProfile(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ): Promise<CsvFile> {
    const employee = await this.findById(currentUser.tenantId, employeeId);
    const rows = [
      {
        section: 'Profile',
        field: 'Employee code',
        value: employee.employeeCode,
      },
      { section: 'Profile', field: 'Full name', value: employee.fullName },
      {
        section: 'Profile',
        field: 'Work email',
        value: employee.workEmail ?? '',
      },
      { section: 'Profile', field: 'Phone', value: employee.phone },
      {
        section: 'Employment',
        field: 'Status',
        value: employee.employmentStatus,
      },
      {
        section: 'Employment',
        field: 'Department',
        value: employee.department?.name ?? '',
      },
      {
        section: 'Employment',
        field: 'Designation',
        value: employee.designation?.name ?? '',
      },
      {
        section: 'Ownership',
        field: 'Owner name',
        value: employee.ownerUser?.fullName ?? '',
      },
      {
        section: 'Ownership',
        field: 'Owner email',
        value: employee.ownerUser?.email ?? '',
      },
    ];

    return {
      filename: `employee-${sanitizeFilename(employee.employeeCode || employee.id)}-export-${formatDateForFilename(new Date())}.csv`,
      buffer: Buffer.from(toCsv(rows), 'utf8'),
    };
  }

  async resendInvitation(currentUser: AuthenticatedUser, employeeId: string) {
    if (!canManageEmployeeAccountActions(currentUser)) {
      throw new ForbiddenException(
        'Only Global Admin, System Admin, and HR can send employee invitations.',
      );
    }

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
        const existingUser = await this.usersRepository.findByTenantIdAndEmail(
          tenantId,
          workEmail,
          tx,
        );

        if (existingUser) {
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

    const shouldSendInvitation =
      dto.sendInvitationNow !== false ||
      result.user.status !== UserStatus.ACTIVE;

    if (shouldSendInvitation) {
      if (!isEmployeeInvitationEligibleUser(result.user)) {
        throw new BadRequestException(
          'Invitation can only be sent to a new employee account that has not logged in yet.',
        );
      }

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
    if (canManageEmployeeAccountActions(currentUser)) {
      return;
    }

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
    organizationId?: string,
    businessUnitId?: string,
    departmentId?: string,
    teamId?: string,
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
    settings?: EmployeeSettingsResolved,
    employeeId?: string,
  ) {
    let linkedUserEmail: string | undefined;
    let nationality: string | undefined;
    let countryName: string | undefined;
    let stateProvinceName: string | undefined;
    let cityName: string | undefined;
    let effectiveEmployeeLevelId = employeeLevelId?.trim() || undefined;

    if (reportingManagerEmployeeId) {
      await this.validateManagerAssignment(
        tenantId,
        employeeId,
        reportingManagerEmployeeId,
        settings,
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

    if (organizationId) {
      const organization =
        await this.organizationRepository.findOrganizationById(
          tenantId,
          organizationId,
        );

      if (!organization) {
        throw new BadRequestException(
          'Selected organization does not belong to this tenant.',
        );
      }
    }

    if (businessUnitId) {
      const businessUnit =
        await this.organizationRepository.findBusinessUnitById(
          tenantId,
          businessUnitId,
        );

      if (!businessUnit) {
        throw new BadRequestException(
          'Selected business unit does not belong to this tenant.',
        );
      }

      if (organizationId && businessUnit.organizationId !== organizationId) {
        throw new BadRequestException(
          'Selected business unit must belong to the selected organization.',
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

      // Only a department that is itself assigned to a business unit can
      // contradict one. An unassigned department constrains nothing, and
      // treating it as a mismatch blocked every create in tenants that do not
      // map departments to business units.
      if (
        businessUnitId &&
        department.businessUnitId &&
        department.businessUnitId !== businessUnitId
      ) {
        throw new BadRequestException(
          'Selected department must belong to the selected business unit.',
        );
      }

      if (
        organizationId &&
        department.businessUnit &&
        department.businessUnit.organizationId !== organizationId
      ) {
        throw new BadRequestException(
          'Selected department must belong to the selected organization.',
        );
      }
    }

    if (teamId) {
      if (!departmentId) {
        throw new BadRequestException(
          'Department is required when assigning a team.',
        );
      }

      const team = await this.prisma.team.findFirst({
        where: {
          tenantId,
          id: teamId,
          departmentId,
          teamType: 'ORGANIZATIONAL',
          isActive: true,
        },
        select: { id: true, departmentId: true },
      });

      if (!team) {
        throw new BadRequestException(
          'Selected team does not belong to this tenant or is inactive.',
        );
      }

      if (departmentId && team.departmentId !== departmentId) {
        throw new BadRequestException(
          'Selected team must belong to the selected department.',
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

      if (designation.employeeLevelId) {
        effectiveEmployeeLevelId = designation.employeeLevelId;
      }
    }

    if (effectiveEmployeeLevelId) {
      const employeeLevel = await this.prisma.employeeLevel.findFirst({
        where: { tenantId, id: effectiveEmployeeLevelId, isActive: true },
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
      effectiveEmployeeLevelId,
    };
  }

  private async validateManagerAssignment(
    tenantId: string,
    employeeId: string | undefined,
    managerEmployeeId?: string,
    settings?: EmployeeSettingsResolved,
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
        settings?.maxReportingLevels,
      );
    }
  }

  private async assertNoCircularReporting(
    tenantId: string,
    employeeId: string,
    managerEmployeeId: string,
    maxReportingLevels = 50,
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

      if (depth > maxReportingLevels) {
        throw new BadRequestException(
          `Reporting hierarchy cannot exceed ${maxReportingLevels} levels.`,
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

  /** Employee settings resolved for a tenant, for callers outside this module. */
  async getEmployeeSettingsForTenant(tenantId: string) {
    return this.tenantSettingsResolverService.getEmployeeSettings(tenantId);
  }

  /**
   * The create-time mandatory-field rules, reported rather than thrown.
   *
   * Import validation calls this so a dry run predicts exactly what execution
   * will accept. Keeping one rule set means the two can never drift.
   */
  collectCreateSettingsIssues(
    dto: Partial<
      Pick<
        CreateEmployeeDto,
        | 'personalEmail'
        | 'emergencyContactName'
        | 'emergencyContactRelationTypeId'
        | 'emergencyContactPhone'
        | 'countryId'
        | 'businessUnitId'
        | 'departmentId'
        | 'designationId'
        | 'employeeLevelId'
        | 'hireDate'
        | 'reportingManagerEmployeeId'
        | 'locationId'
      >
    >,
    settings: EmployeeSettingsResolved,
  ): Array<{ field: string; message: string }> {
    const issues: Array<{ field: string; message: string }> = [];

    if (settings.requirePersonalEmail && !dto.personalEmail?.trim()) {
      issues.push({
        field: 'personalEmail',
        message: 'Personal email is required by tenant employee settings.',
      });
    }
    if (settings.requireEmergencyContact) {
      issues.push(...emergencyContactFieldErrors(dto));
    }
    /*
     * BUG-1974 — country, business unit and employee level were rendered under
     * "Required Fields" beside the rules below and enforced by nothing. They
     * follow the same shape as their siblings rather than a new mechanism.
     */
    if (settings.requireCountry && !dto.countryId?.trim()) {
      issues.push({
        field: 'countryId',
        message: 'Country is required by tenant employee settings.',
      });
    }
    if (settings.requireBusinessUnit && !dto.businessUnitId?.trim()) {
      issues.push({
        field: 'businessUnitId',
        message: 'Business unit is required by tenant employee settings.',
      });
    }
    if (settings.requireDepartment && !dto.departmentId?.trim()) {
      issues.push({
        field: 'departmentId',
        message: 'Department is required by tenant employee settings.',
      });
    }
    if (settings.requireEmployeeLevel && !dto.employeeLevelId?.trim()) {
      issues.push({
        field: 'employeeLevelId',
        message: 'Employee level is required by tenant employee settings.',
      });
    }
    if (settings.requireDesignation && !dto.designationId?.trim()) {
      issues.push({
        field: 'designationId',
        message: 'Designation is required by tenant employee settings.',
      });
    }
    if (settings.requireJoiningDate && !dto.hireDate) {
      issues.push({
        field: 'hireDate',
        message: 'Joining date is required by tenant employee settings.',
      });
    }
    if (
      (settings.requireReportingManager ||
        !settings.allowEmployeeWithoutManager) &&
      !dto.reportingManagerEmployeeId?.trim()
    ) {
      issues.push({
        field: 'reportingManagerEmployeeId',
        message: 'Reporting manager is required by tenant employee settings.',
      });
    }
    if (settings.requireWorkLocation && !dto.locationId?.trim()) {
      issues.push({
        field: 'locationId',
        message: 'Work location is required by tenant employee settings.',
      });
    }

    return issues;
  }

  private assertEmployeeSettingsRulesForCreate(
    dto: CreateEmployeeDto,
    settings: EmployeeSettingsResolved,
  ) {
    const issues = this.collectCreateSettingsIssues(dto, settings);

    if (issues.length === 0) {
      return;
    }

    // Emergency contact is reported as a group so the caller sees every missing
    // part at once rather than one field per attempt.
    const emergencyContactErrors = issues.filter((issue) =>
      issue.field.startsWith('emergencyContact'),
    );

    const firstOther = issues.find(
      (issue) => !issue.field.startsWith('emergencyContact'),
    );

    if (firstOther && issues.indexOf(firstOther) < issues.length) {
      const beforeEmergency =
        emergencyContactErrors.length === 0 ||
        issues.indexOf(firstOther) < issues.indexOf(emergencyContactErrors[0]);

      if (beforeEmergency) {
        throw new BadRequestException(firstOther.message);
      }
    }

    if (emergencyContactErrors.length) {
      throw employeeValidationError(
        'Emergency contact details are required by tenant employee settings.',
        emergencyContactErrors,
      );
    }

    throw new BadRequestException(issues[0].message);
  }

  private assertEmployeeSettingsRulesForUpdate(
    dto: UpdateEmployeeDto,
    employee: EmployeeWithRelations,
    settings: EmployeeSettingsResolved,
  ) {
    const nextPersonalEmail = getUpdateDtoValue(
      dto,
      'personalEmail',
      employee.personalEmail,
    );
    const nextEmergencyContactName = getUpdateDtoValue(
      dto,
      'emergencyContactName',
      employee.emergencyContactName,
    );
    const nextEmergencyContactRelationTypeId = getUpdateDtoValue(
      dto,
      'emergencyContactRelationTypeId',
      employee.emergencyContactRelationTypeId,
    );
    const nextEmergencyContactPhone = getUpdateDtoValue(
      dto,
      'emergencyContactPhone',
      employee.emergencyContactPhone,
    );
    const nextDepartmentId = getUpdateDtoValue(
      dto,
      'departmentId',
      employee.departmentId,
    );
    const nextDesignationId = getUpdateDtoValue(
      dto,
      'designationId',
      employee.designationId,
    );
    const nextManagerId = getUpdateDtoValue(
      dto,
      'reportingManagerEmployeeId',
      employee.managerEmployeeId,
    );
    const nextLocationId = getUpdateDtoValue(
      dto,
      'locationId',
      employee.locationId,
    );
    const nextHireDate = getUpdateDtoValue(dto, 'hireDate', employee.hireDate);
    const nextRecordStatus = dto.status ?? employee.status;
    const nextStatus =
      dto.employmentStatus ??
      (nextRecordStatus === EMPLOYEE_RECORD_STATUS.ACTIVE
        ? EmployeeEmploymentStatus.ACTIVE
        : employee.employmentStatus);

    // A mandatory-field rule is enforced only on the fields this request
    // actually sends. Records that predate a rule, or arrived incomplete
    // through an import, stay editable: changing an unrelated field must not
    // demand data the caller never touched. Clearing a required field is still
    // rejected, so the rule holds for everything going forward.
    if (
      settings.requirePersonalEmail &&
      !nextPersonalEmail?.trim() &&
      touchesAny(dto, 'personalEmail')
    ) {
      throw new BadRequestException(
        'Personal email is required by tenant employee settings.',
      );
    }
    if (
      settings.requireEmergencyContact &&
      touchesAny(
        dto,
        'emergencyContactName',
        'emergencyContactRelationTypeId',
        'emergencyContactPhone',
      )
    ) {
      const fieldErrors = emergencyContactFieldErrors({
        emergencyContactName: nextEmergencyContactName,
        emergencyContactRelationTypeId: nextEmergencyContactRelationTypeId,
        emergencyContactPhone: nextEmergencyContactPhone,
      });
      if (fieldErrors.length) {
        throw employeeValidationError(
          'Emergency contact details are required by tenant employee settings.',
          fieldErrors,
        );
      }
    }
    if (
      settings.requireDepartment &&
      !nextDepartmentId &&
      touchesAny(dto, 'departmentId')
    ) {
      throw new BadRequestException(
        'Department is required by tenant employee settings.',
      );
    }
    if (
      settings.requireDesignation &&
      !nextDesignationId &&
      touchesAny(dto, 'designationId')
    ) {
      throw new BadRequestException(
        'Designation is required by tenant employee settings.',
      );
    }
    if (
      settings.requireJoiningDate &&
      !nextHireDate &&
      touchesAny(dto, 'hireDate')
    ) {
      throw new BadRequestException(
        'Joining date is required by tenant employee settings.',
      );
    }
    if (
      (settings.requireReportingManager ||
        !settings.allowEmployeeWithoutManager) &&
      !nextManagerId &&
      touchesAny(dto, 'reportingManagerEmployeeId')
    ) {
      throw new BadRequestException(
        'Reporting manager is required by tenant employee settings.',
      );
    }
    if (
      settings.requireWorkLocation &&
      !nextLocationId &&
      touchesAny(dto, 'locationId')
    ) {
      throw new BadRequestException(
        'Work location is required by tenant employee settings.',
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
      if (settings.requireJoiningDate && !nextHireDate) {
        throw new BadRequestException(
          'Joining date is required before employee activation.',
        );
      }
      if (
        (settings.requireReportingManager ||
          !settings.allowEmployeeWithoutManager) &&
        !nextManagerId
      ) {
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
    dto: Pick<
      CreateEmployeeDto,
      'personalEmail' | 'workEmail' | 'phone' | 'cnic'
    >,
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
          value: (payload) => normalizeComparableEmail(payload.personalEmail),
          buildWhere: (value) => ({
            personalEmail: value,
          }),
        },
        {
          // BUG-1974 — see `checkDuplicates`; the same rule, on the enforcing
          // path rather than the preview one.
          key: 'workEmail',
          label: 'Work email',
          enabled: settings.preventDuplicateWorkEmail,
          severity: 'BLOCK',
          value: (payload) => normalizeComparableEmail(payload.workEmail),
          buildWhere: (value) => ({
            email: value,
          }),
        },
        {
          key: 'phone',
          label: 'Phone number',
          enabled: settings.preventDuplicateByPhoneNumber,
          severity: settings.warnOnPossibleDuplicate ? 'WARN' : 'BLOCK',
          value: (payload) => normalizeComparableValue(payload.phone),
          buildWhere: (value) => ({
            phone: value,
          }),
        },
        {
          key: 'nationalId',
          label: 'National identity value',
          enabled: settings.preventDuplicateByNationalId,
          severity: 'BLOCK',
          value: (payload) => normalizeComparableValue(payload.cnic),
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
      effectiveEmployeeLevelId?: string;
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
      employmentStatus:
        dto.status === EMPLOYEE_RECORD_STATUS.DRAFT
          ? EMPLOYEE_DRAFT_LIFECYCLE.employmentStatus
          : dto.employmentStatus,
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
      organizationId: dto.organizationId?.trim(),
      departmentId: dto.departmentId?.trim(),
      teamId: dto.teamId?.trim(),
      businessUnitId: dto.businessUnitId?.trim(),
      designationId: dto.designationId?.trim(),
      employeeLevelId:
        referenceLabels?.effectiveEmployeeLevelId ??
        dto.employeeLevelId?.trim(),
      locationId: dto.locationId,
      defaultWorkScheduleId: dto.defaultWorkScheduleId,
      officialJoiningLocationId: dto.officialJoiningLocationId,
      managerEmployeeId: dto.reportingManagerEmployeeId,
      userId: dto.userId,
      noticePeriodDays: dto.noticePeriodDays,
      taxIdentifier: dto.taxIdentifier?.trim(),
      ownerUserId: dto.ownerUserId ?? actorId,
      status: dto.status ?? EMPLOYEE_RECORD_STATUS.ACTIVE,
      subStatus:
        dto.subStatus ??
        (dto.status === EMPLOYEE_RECORD_STATUS.DRAFT
          ? EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION
          : EMPLOYEE_RECORD_SUB_STATUS.OPEN),
      isDraftProfile: dto.status === EMPLOYEE_RECORD_STATUS.DRAFT,
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
      effectiveEmployeeLevelId?: string;
    },
    existingEmployee?: {
      isDraftProfile: boolean;
      status: string;
      subStatus: string;
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

    if (dto.status !== undefined) {
      data.status = dto.status;

      if (dto.status === EMPLOYEE_RECORD_STATUS.DRAFT) {
        data.isDraftProfile = true;
        if (dto.subStatus === undefined) {
          data.subStatus = EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION;
        }
        if (dto.employmentStatus === undefined) {
          data.employmentStatus = EmployeeEmploymentStatus.INACTIVE;
        }
      }

      if (
        dto.status === EMPLOYEE_RECORD_STATUS.ACTIVE &&
        existingEmployee?.isDraftProfile
      ) {
        data.isDraftProfile = false;
        if (dto.subStatus === undefined) {
          data.subStatus = EMPLOYEE_RECORD_SUB_STATUS.OPEN;
        }
        if (dto.employmentStatus === undefined) {
          data.employmentStatus = EmployeeEmploymentStatus.ACTIVE;
        }
      }
    }

    if (dto.subStatus !== undefined) {
      data.subStatus = dto.subStatus;
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
      data.country = dto.countryId
        ? (referenceLabels?.countryName ?? null)
        : null;
    }

    if (dto.stateProvinceId !== undefined) {
      data.stateProvinceId = dto.stateProvinceId ?? null;
      data.stateProvince = dto.stateProvinceId
        ? (referenceLabels?.stateProvinceName ?? null)
        : null;
    }

    if (dto.cityId !== undefined) {
      data.cityId = dto.cityId ?? null;
      data.city = dto.cityId ? (referenceLabels?.cityName ?? null) : null;
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

    if (dto.organizationId !== undefined) {
      data.organizationId = dto.organizationId?.trim() ?? null;
    }

    if (dto.departmentId !== undefined) {
      data.departmentId = dto.departmentId?.trim() ?? null;
    }

    if (dto.teamId !== undefined) {
      data.teamId = dto.teamId?.trim() ?? null;
    }

    if (dto.businessUnitId !== undefined) {
      data.businessUnitId = dto.businessUnitId?.trim() ?? null;
    }

    if (dto.designationId !== undefined) {
      data.designationId = dto.designationId?.trim() ?? null;
    }

    if (
      dto.employeeLevelId !== undefined ||
      referenceLabels?.effectiveEmployeeLevelId !== undefined
    ) {
      data.employeeLevelId =
        referenceLabels?.effectiveEmployeeLevelId ??
        dto.employeeLevelId?.trim() ??
        null;
    }

    if (dto.locationId !== undefined) {
      data.locationId = dto.locationId ?? null;
    }
    if (dto.defaultWorkScheduleId !== undefined) {
      data.defaultWorkScheduleId = dto.defaultWorkScheduleId ?? null;
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

    if (dto.ownerUserId !== undefined) {
      data.ownerUserId = dto.ownerUserId;
    }

    if (dto.noticePeriodDays !== undefined) {
      data.noticePeriodDays = dto.noticePeriodDays ?? null;
    }

    if (dto.taxIdentifier !== undefined) {
      data.taxIdentifier = dto.taxIdentifier?.trim() ?? null;
    }

    return data;
  }

  private preserveUnchangedDependentLookups(
    dto: UpdateEmployeeDto,
    employee: {
      businessUnitId: string | null;
      departmentId: string | null;
      teamId: string | null;
    },
  ) {
    const update = dto as UpdateEmployeeDto & {
      businessUnitId?: string | null;
      departmentId?: string | null;
      teamId?: string | null;
    };

    if (
      update.teamId === null &&
      employee.teamId &&
      (update.departmentId === undefined ||
        update.departmentId === null ||
        update.departmentId === employee.departmentId)
    ) {
      delete update.teamId;
    }

    if (
      update.departmentId === null &&
      employee.departmentId &&
      (update.businessUnitId === undefined ||
        update.businessUnitId === null ||
        update.businessUnitId === employee.businessUnitId)
    ) {
      delete update.departmentId;
    }
  }

  private mapEmployee(employee: EmployeeWithRelations) {
    const normalizedStatus = employee.isDraftProfile
      ? EMPLOYEE_RECORD_STATUS.DRAFT
      : employee.status;
    const normalizedSubStatus = employee.isDraftProfile
      ? employee.subStatus === EMPLOYEE_RECORD_SUB_STATUS.READY_FOR_ACTIVATION
        ? EMPLOYEE_RECORD_SUB_STATUS.READY_FOR_ACTIVATION
        : employee.subStatus === EMPLOYEE_RECORD_SUB_STATUS.ONBOARDING
          ? EMPLOYEE_RECORD_SUB_STATUS.ONBOARDING
          : EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION
      : employee.subStatus;
    const normalizedEmploymentStatus = employee.isDraftProfile
      ? EmployeeEmploymentStatus.INACTIVE
      : employee.employmentStatus;

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
      employmentStatus: normalizedEmploymentStatus,
      status: normalizedStatus,
      subStatus: normalizedSubStatus,
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
      emergencyContactRelationType: employee.emergencyContactRelationType
        ? {
            id: employee.emergencyContactRelationType.id,
            key: employee.emergencyContactRelationType.key,
            name: employee.emergencyContactRelationType.name,
            isActive: employee.emergencyContactRelationType.isActive,
          }
        : null,
      emergencyContactRelation: employee.emergencyContactRelation,
      emergencyContactPhone: employee.emergencyContactPhone,
      emergencyContactAlternatePhone: employee.emergencyContactAlternatePhone,
      organizationId: employee.organizationId,
      departmentId: employee.departmentId,
      teamId: employee.teamId,
      businessUnitId: employee.businessUnitId,
      designationId: employee.designationId,
      employeeLevelId: employee.employeeLevelId,
      locationId: employee.locationId,
      defaultWorkScheduleId: employee.defaultWorkScheduleId,
      officialJoiningLocationId: employee.officialJoiningLocationId,
      managerEmployeeId: employee.managerEmployeeId,
      reportingManagerEmployeeId: employee.managerEmployeeId,
      userId: employee.userId,
      ownerUserId: employee.ownerUserId,
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
            fullName:
              `${employee.manager.firstName} ${employee.manager.lastName}`.trim(),
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
            fullName:
              `${employee.manager.firstName} ${employee.manager.lastName}`.trim(),
            employmentStatus: employee.manager.employmentStatus,
          }
        : null,
      /*
       * True when the employee has a login that has never been used, which is
       * the only situation where sending an invitation makes sense. False when
       * there is no user account at all, since there is nothing to invite to.
       */
      hasNeverLoggedIn: Boolean(employee.user && !employee.user.lastLoginAt),
      user: employee.user
        ? {
            id: employee.user.id,
            email: employee.user.email,
            lastLoginAt: employee.user.lastLoginAt,
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
      ownerUser: employee.ownerUser
        ? {
            id: employee.ownerUser.id,
            email: employee.ownerUser.email,
            firstName: employee.ownerUser.firstName,
            lastName: employee.ownerUser.lastName,
            fullName:
              `${employee.ownerUser.firstName} ${employee.ownerUser.lastName}`.trim(),
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
      organization: employee.organization
        ? {
            id: employee.organization.id,
            name: employee.organization.name,
            code: employee.organization.code,
            isActive: employee.organization.isActive,
          }
        : null,
      businessUnit: employee.businessUnit
        ? {
            id: employee.businessUnit.id,
            name: employee.businessUnit.name,
            code: employee.businessUnit.code,
            organizationId: employee.businessUnit.organizationId,
            isActive: employee.businessUnit.isActive,
          }
        : null,
      team: employee.team
        ? {
            id: employee.team.id,
            name: employee.team.name,
            key: employee.team.key,
            departmentId: employee.team.departmentId,
            isActive: employee.team.isActive,
          }
        : null,
      designation: employee.designation
        ? {
            id: employee.designation.id,
            name: employee.designation.name,
            level: employee.designation.level,
            employeeLevelId: employee.designation.employeeLevelId,
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
      defaultWorkSchedule: employee.defaultWorkSchedule
        ? {
            id: employee.defaultWorkSchedule.id,
            name: employee.defaultWorkSchedule.name,
            code: employee.defaultWorkSchedule.code,
            isActive: employee.defaultWorkSchedule.isActive,
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

  private async assignDefaultBenefitsSafely(
    user: AuthenticatedUser,
    employeeId: string,
    source: EmployeeBenefitAssignmentSource,
    effectiveDate: Date,
  ) {
    try {
      await this.benefitsService.assignDefaults(
        user,
        employeeId,
        source,
        effectiveDate,
      );
    } catch (error) {
      await this.auditService.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'EMPLOYEE_DEFAULT_BENEFITS_ASSIGNMENT_FAILED',
        entityType: 'Employee',
        entityId: employeeId,
        sourceModule: 'benefits',
        afterSnapshot: {
          source,
          message:
            error instanceof Error
              ? error.message
              : 'Default benefit assignment failed.',
        },
      });
    }
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

const reportingNodeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  managerEmployeeId: true,
  designation: { select: { name: true } },
  department: { select: { name: true } },
  profileImageDocumentId: true,
} satisfies Prisma.EmployeeSelect;

type ReportingTreeNode = ReturnType<typeof mapReportingNode> & {
  children: ReportingTreeNode[];
};

function mapReportingNode(employee: {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  managerEmployeeId: string | null;
  designation: { name: string } | null;
  department: { name: string } | null;
  profileImageDocumentId: string | null;
}) {
  return {
    employeeId: employee.id,
    displayName:
      employee.preferredName ||
      `${employee.firstName} ${employee.lastName}`.trim(),
    jobTitle: employee.designation?.name ?? null,
    department: employee.department?.name ?? null,
    profilePhotoUrl: employee.profileImageDocumentId
      ? `/api/employees/${employee.id}/profile-image`
      : null,
    managerId: employee.managerEmployeeId,
  };
}
