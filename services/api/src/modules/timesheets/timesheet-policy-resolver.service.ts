import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TimesheetPolicy,
  TimesheetPolicyScopeType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimesheetAuditSettingsService } from './timesheet-audit-settings.service';
import { DEFAULT_TENANT_SETTINGS } from '../tenant-settings/tenant-settings.catalog';
import {
  CreateTimesheetPolicyDto,
  UpdateTimesheetPolicyDto,
} from './dto/timesheet-policy.dto';

type JsonRecord = Record<string, unknown>;

type EmployeePolicyScope = {
  id: string;
  organizationId: string | null;
  businessUnitId: string | null;
  departmentId: string | null;
  teamId: string | null;
};

export type ResolvedTimesheetPolicy = {
  effectiveAt: string;
  employee: EmployeePolicyScope & {
    employeeCode: string;
    fullName: string;
  };
  effectivePolicy: {
    id: string;
    code: string;
    name: string;
    scopeType: TimesheetPolicyScopeType;
    scopeId: string | null;
    version: number;
  } | null;
  appliedPolicies: Array<{
    id: string;
    code: string;
    name: string;
    scopeType: TimesheetPolicyScopeType;
    scopeId: string | null;
    priority: number;
    version: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
  values: JsonRecord;
  fields: Array<{
    key: string;
    effectiveValue: unknown;
    tenantValue: unknown;
    source: string;
    sourceScope: TimesheetPolicyScopeType;
    inherited: boolean;
    policyId: string | null;
    policyVersion: number | null;
    explanation: string;
  }>;
};

const SCOPE_ORDER: readonly TimesheetPolicyScopeType[] = [
  TimesheetPolicyScopeType.TENANT,
  TimesheetPolicyScopeType.ORGANIZATION,
  TimesheetPolicyScopeType.BUSINESS_UNIT,
  TimesheetPolicyScopeType.DEPARTMENT,
  TimesheetPolicyScopeType.TEAM,
  TimesheetPolicyScopeType.EMPLOYEE,
];

@Injectable()
export class TimesheetPolicyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly timesheetAuditSettings: TimesheetAuditSettingsService,
  ) {}

  /**
   * BUG-2206 — `timesheets.auditPolicyResolution` was rendered, saved and read
   * by nothing. It gates the policy lifecycle rows below, which are the record
   * of how timesheet policy resolution is decided for a tenant. It defaults on,
   * and a settings read failure audits anyway; see
   * `TimesheetAuditSettingsService`.
   */
  private shouldAuditPolicyResolution(tenantId: string) {
    return this.timesheetAuditSettings.shouldAudit(
      tenantId,
      'auditPolicyResolution',
    );
  }

  async list(tenantId: string, enabled?: boolean) {
    const policies = await this.prisma.timesheetPolicy.findMany({
      where: {
        tenantId,
        ...(enabled === undefined ? {} : { enabled }),
      },
      orderBy: [
        { enabled: 'desc' },
        { scopeType: 'asc' },
        { priority: 'desc' },
        { version: 'desc' },
        { name: 'asc' },
      ],
    });

    return {
      items: policies.map((policy) => this.mapPolicy(policy)),
      total: policies.length,
    };
  }

  async get(tenantId: string, policyId: string) {
    const policy = await this.findPolicy(tenantId, policyId);
    return this.mapPolicy(policy);
  }

  async create(user: AuthenticatedUser, dto: CreateTimesheetPolicyDto) {
    const scope = await this.validateScope(
      user.tenantId,
      dto.scopeType,
      dto.scopeId,
    );
    const settings = this.validateOverrides(dto.settings);
    const effectiveFrom = startOfDay(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? endOfDay(dto.effectiveTo) : null;
    assertDateRange(effectiveFrom, effectiveTo);
    const code = normalizeCode(dto.code);
    const existing = await this.prisma.timesheetPolicy.findFirst({
      where: { tenantId: user.tenantId, code },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const created = await this.prisma.timesheetPolicy.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        scopeType: dto.scopeType,
        scopeId: scope.scopeId,
        ...scope.foreignKeys,
        priority: dto.priority,
        effectiveFrom,
        effectiveTo,
        enabled: dto.enabled,
        inheritUnspecified: dto.inheritUnspecified,
        version: (existing?.version ?? 0) + 1,
        settings: settings as Prisma.InputJsonValue,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    if (await this.shouldAuditPolicyResolution(user.tenantId))
      await this.auditService.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'TIMESHEET_POLICY_CREATED',
        entityType: 'TimesheetPolicy',
        entityId: created.id,
        sourceModule: 'timesheets',
        afterSnapshot: this.mapPolicy(created),
      });
    return this.mapPolicy(created);
  }

  async update(
    user: AuthenticatedUser,
    policyId: string,
    dto: UpdateTimesheetPolicyDto,
  ) {
    const existing = await this.findPolicy(user.tenantId, policyId);
    const effectiveFrom = dto.effectiveFrom
      ? startOfDay(dto.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo === undefined
        ? existing.effectiveTo
        : dto.effectiveTo
          ? endOfDay(dto.effectiveTo)
          : null;
    assertDateRange(effectiveFrom, effectiveTo);
    const settings = dto.settings
      ? this.validateOverrides(dto.settings)
      : asJsonRecord(existing.settings);

    const next = await this.prisma.$transaction(async (tx) => {
      await tx.timesheetPolicy.update({
        where: { id: existing.id },
        data: { enabled: false, updatedById: user.userId },
      });
      return tx.timesheetPolicy.create({
        data: {
          tenantId: existing.tenantId,
          name: dto.name?.trim() || existing.name,
          code: existing.code,
          description:
            dto.description === undefined
              ? existing.description
              : dto.description?.trim() || null,
          scopeType: existing.scopeType,
          scopeId: existing.scopeId,
          organizationId: existing.organizationId,
          businessUnitId: existing.businessUnitId,
          departmentId: existing.departmentId,
          teamId: existing.teamId,
          employeeId: existing.employeeId,
          priority: dto.priority ?? existing.priority,
          effectiveFrom,
          effectiveTo,
          enabled: dto.enabled ?? true,
          inheritUnspecified:
            dto.inheritUnspecified ?? existing.inheritUnspecified,
          version: existing.version + 1,
          settings: settings as Prisma.InputJsonValue,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
    });

    if (await this.shouldAuditPolicyResolution(user.tenantId))
      await this.auditService.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'TIMESHEET_POLICY_VERSION_CREATED',
        entityType: 'TimesheetPolicy',
        entityId: next.id,
        sourceModule: 'timesheets',
        beforeSnapshot: this.mapPolicy(existing),
        afterSnapshot: this.mapPolicy(next),
      });
    return this.mapPolicy(next);
  }

  async disable(user: AuthenticatedUser, policyId: string) {
    const existing = await this.findPolicy(user.tenantId, policyId);
    const updated = await this.prisma.timesheetPolicy.update({
      where: { id: existing.id },
      data: { enabled: false, updatedById: user.userId },
    });
    if (await this.shouldAuditPolicyResolution(user.tenantId))
      await this.auditService.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'TIMESHEET_POLICY_DISABLED',
        entityType: 'TimesheetPolicy',
        entityId: updated.id,
        sourceModule: 'timesheets',
        beforeSnapshot: this.mapPolicy(existing),
        afterSnapshot: this.mapPolicy(updated),
      });
    return this.mapPolicy(updated);
  }

  async resolveForEmployee(
    tenantId: string,
    employeeId: string,
    effectiveAt = new Date(),
  ): Promise<ResolvedTimesheetPolicy> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, isDeleted: false },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const tenantDefaults = structuredClone(
      DEFAULT_TENANT_SETTINGS.timesheets,
    ) as JsonRecord;
    const persisted = await this.prisma.tenantSetting.findMany({
      where: { tenantId, category: 'timesheets' },
      select: { key: true, value: true },
    });
    for (const row of persisted) tenantDefaults[row.key] = row.value;

    const policies = await this.prisma.timesheetPolicy.findMany({
      where: {
        tenantId,
        enabled: true,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
        AND: [
          {
            OR: [
              { scopeType: TimesheetPolicyScopeType.TENANT },
              scopeClause(
                TimesheetPolicyScopeType.ORGANIZATION,
                employee.organizationId,
              ),
              scopeClause(
                TimesheetPolicyScopeType.BUSINESS_UNIT,
                employee.businessUnitId,
              ),
              scopeClause(
                TimesheetPolicyScopeType.DEPARTMENT,
                employee.departmentId,
              ),
              scopeClause(TimesheetPolicyScopeType.TEAM, employee.teamId),
              scopeClause(TimesheetPolicyScopeType.EMPLOYEE, employee.id),
            ],
          },
        ],
      },
      orderBy: [{ priority: 'asc' }, { version: 'asc' }, { updatedAt: 'asc' }],
    });
    const ordered = policies.sort(comparePolicyPrecedence);
    const values = structuredClone(tenantDefaults);
    const sourceByKey = new Map<
      string,
      { policy: TimesheetPolicy; scope: TimesheetPolicyScopeType }
    >();

    for (const policy of ordered) {
      if (!policy.inheritUnspecified) {
        Object.keys(values).forEach((key) => delete values[key]);
        Object.assign(values, structuredClone(tenantDefaults));
        sourceByKey.clear();
      }
      for (const [key, value] of Object.entries(
        asJsonRecord(policy.settings),
      )) {
        values[key] = value;
        sourceByKey.set(key, { policy, scope: policy.scopeType });
      }
    }

    const keys = [
      ...new Set([...Object.keys(tenantDefaults), ...Object.keys(values)]),
    ].sort((left, right) => left.localeCompare(right));
    const effectivePolicy = ordered.length ? ordered[ordered.length - 1] : null;
    return {
      effectiveAt: effectiveAt.toISOString(),
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
        organizationId: employee.organizationId,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        teamId: employee.teamId,
      },
      effectivePolicy: effectivePolicy
        ? {
            id: effectivePolicy.id,
            code: effectivePolicy.code,
            name: effectivePolicy.name,
            scopeType: effectivePolicy.scopeType,
            scopeId: effectivePolicy.scopeId,
            version: effectivePolicy.version,
          }
        : null,
      appliedPolicies: ordered.map((policy) => ({
        id: policy.id,
        code: policy.code,
        name: policy.name,
        scopeType: policy.scopeType,
        scopeId: policy.scopeId,
        priority: policy.priority,
        version: policy.version,
        effectiveFrom: policy.effectiveFrom.toISOString(),
        effectiveTo: policy.effectiveTo?.toISOString() ?? null,
      })),
      values,
      fields: keys.map((key) => {
        const source = sourceByKey.get(key);
        const sourceLabel = source
          ? `${scopeLabel(source.scope)} — ${source.policy.name}`
          : 'Tenant default';
        return {
          key,
          effectiveValue: values[key],
          tenantValue: tenantDefaults[key],
          source: sourceLabel,
          sourceScope: source?.scope ?? TimesheetPolicyScopeType.TENANT,
          inherited: !source,
          policyId: source?.policy.id ?? null,
          policyVersion: source?.policy.version ?? null,
          explanation: source
            ? `${readableKey(key)} is overridden by ${sourceLabel} (version ${source.policy.version}).`
            : `${readableKey(key)} inherits the tenant value.`,
        };
      }),
    };
  }

  private async findPolicy(tenantId: string, policyId: string) {
    const policy = await this.prisma.timesheetPolicy.findFirst({
      where: { id: policyId, tenantId },
    });
    if (!policy) {
      throw new NotFoundException('Timesheet policy was not found.');
    }
    return policy;
  }

  private validateOverrides(input: Record<string, unknown>) {
    const allowed = new Set(Object.keys(DEFAULT_TENANT_SETTINGS.timesheets));
    const invalid = Object.keys(input).filter((key) => !allowed.has(key));
    if (invalid.length) {
      throw new BadRequestException(
        `Unsupported timesheet policy setting(s): ${invalid.join(', ')}.`,
      );
    }
    assertJsonValue(input);
    return structuredClone(input);
  }

  private async validateScope(
    tenantId: string,
    scopeType: TimesheetPolicyScopeType,
    scopeId?: string | null,
  ) {
    if (scopeType === TimesheetPolicyScopeType.TENANT) {
      if (scopeId) {
        throw new BadRequestException(
          'Tenant scope does not accept a scope record.',
        );
      }
      return { scopeId: null, foreignKeys: {} };
    }
    if (!scopeId) {
      throw new BadRequestException(
        `${scopeLabel(scopeType)} scope requires a record.`,
      );
    }

    const exists = await findScopedRecord(
      this.prisma,
      tenantId,
      scopeType,
      scopeId,
    );
    if (!exists) {
      throw new BadRequestException(
        `Selected ${scopeLabel(scopeType).toLowerCase()} does not belong to this tenant.`,
      );
    }
    return {
      scopeId,
      foreignKeys: scopeForeignKey(scopeType, scopeId),
    };
  }

  private mapPolicy(policy: TimesheetPolicy) {
    return {
      id: policy.id,
      tenantId: policy.tenantId,
      name: policy.name,
      code: policy.code,
      description: policy.description,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      priority: policy.priority,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      enabled: policy.enabled,
      inheritUnspecified: policy.inheritUnspecified,
      version: policy.version,
      settings: asJsonRecord(policy.settings),
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}

function scopeClause(
  scopeType: TimesheetPolicyScopeType,
  scopeId: string | null,
) {
  return scopeId ? { scopeType, scopeId } : { id: '__no_match__' };
}

function comparePolicyPrecedence(
  left: TimesheetPolicy,
  right: TimesheetPolicy,
) {
  const scope =
    SCOPE_ORDER.indexOf(left.scopeType) - SCOPE_ORDER.indexOf(right.scopeType);
  if (scope) return scope;
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.version !== right.version) return left.version - right.version;
  return left.updatedAt.getTime() - right.updatedAt.getTime();
}

async function findScopedRecord(
  prisma: PrismaService,
  tenantId: string,
  scopeType: TimesheetPolicyScopeType,
  scopeId: string,
) {
  const where = { id: scopeId, tenantId };
  if (scopeType === TimesheetPolicyScopeType.ORGANIZATION)
    return prisma.organization.findFirst({ where, select: { id: true } });
  if (scopeType === TimesheetPolicyScopeType.BUSINESS_UNIT)
    return prisma.businessUnit.findFirst({ where, select: { id: true } });
  if (scopeType === TimesheetPolicyScopeType.DEPARTMENT)
    return prisma.department.findFirst({ where, select: { id: true } });
  if (scopeType === TimesheetPolicyScopeType.TEAM)
    return prisma.team.findFirst({ where, select: { id: true } });
  return prisma.employee.findFirst({
    where: { ...where, isDeleted: false },
    select: { id: true },
  });
}

function scopeForeignKey(scopeType: TimesheetPolicyScopeType, scopeId: string) {
  if (scopeType === TimesheetPolicyScopeType.ORGANIZATION)
    return { organizationId: scopeId };
  if (scopeType === TimesheetPolicyScopeType.BUSINESS_UNIT)
    return { businessUnitId: scopeId };
  if (scopeType === TimesheetPolicyScopeType.DEPARTMENT)
    return { departmentId: scopeId };
  if (scopeType === TimesheetPolicyScopeType.TEAM) return { teamId: scopeId };
  return { employeeId: scopeId };
}

function asJsonRecord(value: Prisma.JsonValue): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (structuredClone(value) as JsonRecord)
    : {};
}

function assertJsonValue(
  value: unknown,
): asserts value is Prisma.InputJsonValue {
  try {
    JSON.stringify(value);
  } catch {
    throw new BadRequestException(
      'Timesheet policy settings must be valid JSON.',
    );
  }
}

function normalizeCode(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_');
  if (!code)
    throw new BadRequestException('Timesheet policy code is required.');
  return code;
}

function startOfDay(value: string) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function assertDateRange(start: Date, end: Date | null) {
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
    throw new BadRequestException('Policy effective dates are invalid.');
  }
  if (end && end < start) {
    throw new BadRequestException(
      'Policy effective-to must be on or after effective-from.',
    );
  }
}

function scopeLabel(value: TimesheetPolicyScopeType) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}
