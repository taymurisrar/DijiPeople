import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalActorType,
  ApprovalMode,
  ApprovalModuleKey,
  ApprovalScopeType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  ApprovalMatrixRepository,
  ReferenceKey,
} from './approval-matrix.repository';
import {
  CreateApprovalMatrixDto,
  ListApprovalMatricesDto,
  UpdateApprovalMatrixDto,
} from './dto/approval-matrix.dto';

@Injectable()
export class ApprovalMatricesService {
  constructor(
    private readonly repository: ApprovalMatrixRepository,
    private readonly auditService: AuditService,
  ) {}

  list(tenantId: string, query: ListApprovalMatricesDto) {
    return this.repository.list(tenantId, query);
  }

  async detail(tenantId: string, id: string) {
    const matrix = await this.repository.findById(tenantId, id);
    if (!matrix)
      throw new NotFoundException('Approval matrix entry was not found.');
    return matrix;
  }

  async create(user: AuthenticatedUser, dto: CreateApprovalMatrixDto) {
    const data = this.normalizeCreate(dto);
    await this.validate(user.tenantId, data);
    await this.assertUnique(user.tenantId, data);
    const created = await this.repository.create({
      tenantId: user.tenantId,
      ...data,
      createdById: user.userId,
      updatedById: user.userId,
    });
    await this.audit(
      user,
      'APPROVAL_MATRIX_CREATED',
      created.id,
      null,
      created,
    );
    return created;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateApprovalMatrixDto,
  ) {
    const existing = await this.detail(user.tenantId, id);
    const merged = this.normalizeCreate({
      moduleKey: dto.moduleKey ?? existing.moduleKey,
      name: dto.name ?? existing.name,
      recordType: valueOrExisting(dto.recordType, existing.recordType),
      leaveTypeId: valueOrExisting(dto.leaveTypeId, existing.leaveTypeId),
      leavePolicyId: valueOrExisting(dto.leavePolicyId, existing.leavePolicyId),
      claimTypeId: valueOrExisting(dto.claimTypeId, existing.claimTypeId),
      loanPolicyId: valueOrExisting(dto.loanPolicyId, existing.loanPolicyId),
      currencyCode: valueOrExisting(dto.currencyCode, existing.currencyCode),
      organizationId: valueOrExisting(
        dto.organizationId,
        existing.organizationId,
      ),
      businessUnitId: valueOrExisting(
        dto.businessUnitId,
        existing.businessUnitId,
      ),
      departmentId: valueOrExisting(dto.departmentId, existing.departmentId),
      employeeLevelId: valueOrExisting(
        dto.employeeLevelId,
        existing.employeeLevelId,
      ),
      minimumAmount: decimalNumber(
        valueOrExisting(dto.minimumAmount, existing.minimumAmount),
      ),
      maximumAmount: decimalNumber(
        valueOrExisting(dto.maximumAmount, existing.maximumAmount),
      ),
      minimumDuration: decimalNumber(
        valueOrExisting(dto.minimumDuration, existing.minimumDuration),
      ),
      maximumDuration: decimalNumber(
        valueOrExisting(dto.maximumDuration, existing.maximumDuration),
      ),
      effectiveFrom: dateString(
        valueOrExisting(dto.effectiveFrom, existing.effectiveFrom),
      ),
      effectiveTo: dateString(
        valueOrExisting(dto.effectiveTo, existing.effectiveTo),
      ),
      conditions: valueOrExisting(
        dto.conditions,
        jsonRecord(existing.conditions),
      ),
      sequence: dto.sequence ?? existing.sequence,
      approverType: dto.approverType ?? existing.approverType,
      approverRoleId: valueOrExisting(
        dto.approverRoleId,
        existing.approverRoleId,
      ),
      approverUserId: valueOrExisting(
        dto.approverUserId,
        existing.approverUserId,
      ),
      approvalMode: dto.approvalMode ?? existing.approvalMode,
      scopeType: valueOrExisting(dto.scopeType, existing.scopeType),
      scopeId: valueOrExisting(dto.scopeId, existing.scopeId),
      isActive: dto.isActive ?? existing.isActive,
    } as unknown as CreateApprovalMatrixDto);
    await this.validate(user.tenantId, merged);
    await this.assertUnique(user.tenantId, merged, id);
    const result = await this.repository.update(user.tenantId, id, {
      ...merged,
      updatedById: user.userId,
    });
    if (!result.count)
      throw new NotFoundException('Approval matrix entry was not found.');
    const updated = await this.detail(user.tenantId, id);
    await this.audit(user, 'APPROVAL_MATRIX_UPDATED', id, existing, updated);
    return updated;
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const existing = await this.detail(user.tenantId, id);
    const result = await this.repository.deactivate(
      user.tenantId,
      id,
      user.userId,
    );
    if (!result.count)
      throw new NotFoundException('Approval matrix entry was not found.');
    await this.audit(user, 'APPROVAL_MATRIX_DEACTIVATED', id, existing, {
      ...existing,
      isActive: false,
    });
    return { ok: true };
  }

  private normalizeCreate(dto: CreateApprovalMatrixDto) {
    const moduleKey = dto.moduleKey ?? ApprovalModuleKey.LEAVE_REQUEST;
    const approverType = dto.approverType;
    return {
      moduleKey,
      name: dto.name.trim(),
      recordType: trimOrNull(dto.recordType),
      leaveTypeId:
        moduleKey === ApprovalModuleKey.LEAVE_REQUEST
          ? (dto.leaveTypeId ?? null)
          : null,
      leavePolicyId:
        moduleKey === ApprovalModuleKey.LEAVE_REQUEST
          ? (dto.leavePolicyId ?? null)
          : null,
      claimTypeId:
        moduleKey === ApprovalModuleKey.CLAIM_REQUEST
          ? (dto.claimTypeId ?? null)
          : null,
      loanPolicyId:
        moduleKey === ApprovalModuleKey.LOAN_REQUEST
          ? (dto.loanPolicyId ?? null)
          : null,
      currencyCode: trimOrNull(dto.currencyCode)?.toUpperCase() ?? null,
      organizationId: dto.organizationId ?? null,
      businessUnitId: dto.businessUnitId ?? null,
      departmentId: dto.departmentId ?? null,
      employeeLevelId: dto.employeeLevelId ?? null,
      minimumAmount: optionalDecimal(dto.minimumAmount),
      maximumAmount: optionalDecimal(dto.maximumAmount),
      minimumDuration: optionalDecimal(dto.minimumDuration),
      maximumDuration: optionalDecimal(dto.maximumDuration),
      effectiveFrom: optionalDate(dto.effectiveFrom),
      effectiveTo: optionalDate(dto.effectiveTo),
      conditions:
        dto.conditions === undefined || dto.conditions === null
          ? Prisma.DbNull
          : (dto.conditions as Prisma.InputJsonValue),
      sequence: dto.sequence,
      approverType,
      approverRoleId:
        approverType === ApprovalActorType.ROLE
          ? (dto.approverRoleId ?? null)
          : null,
      approverUserId:
        approverType === ApprovalActorType.USER
          ? (dto.approverUserId ?? null)
          : null,
      approvalMode: dto.approvalMode ?? ApprovalMode.ANY_ONE,
      scopeType: dto.scopeType ?? null,
      scopeId:
        dto.scopeType === ApprovalScopeType.TENANT
          ? null
          : (dto.scopeId ?? null),
      isActive: dto.isActive ?? true,
    };
  }

  private async validate(
    tenantId: string,
    data: ReturnType<ApprovalMatricesService['normalizeCreate']>,
  ) {
    if (data.approverType === ApprovalActorType.ROLE && !data.approverRoleId)
      throw new BadRequestException('Role approver requires a selected role.');
    if (data.approverType === ApprovalActorType.USER && !data.approverUserId)
      throw new BadRequestException('User approver requires a selected user.');
    if (
      data.scopeType &&
      data.scopeType !== ApprovalScopeType.TENANT &&
      !data.scopeId
    )
      throw new BadRequestException(
        'Scope ID is required for this approval scope.',
      );
    assertRange(data.minimumAmount, data.maximumAmount, 'amount');
    assertRange(data.minimumDuration, data.maximumDuration, 'duration');
    if (
      data.effectiveFrom &&
      data.effectiveTo &&
      data.effectiveTo < data.effectiveFrom
    )
      throw new BadRequestException(
        'effectiveTo cannot be before effectiveFrom.',
      );

    for (const key of REFERENCE_KEYS) {
      const value = data[key];
      if (typeof value !== 'string') continue;
      const found = await this.repository.findReference(tenantId, key, value);
      if (!found)
        throw new BadRequestException(`${key} does not belong to this tenant.`);
    }
    if (
      data.approverRoleId &&
      !(await this.repository.findRoleById(tenantId, data.approverRoleId))
    )
      throw new BadRequestException(
        'Selected approver role does not belong to this tenant.',
      );
    if (data.approverUserId) {
      /*
       * BUG-1969 — two predicates, two messages.
       *
       * This used to be a single `findUserById`, which filters on
       * `status: 'ACTIVE'` as well as tenant, and reported only the tenant half
       * of its own condition. An administrator naming a colleague their tenant
       * had just provisioned — status `INVITED`, returned by `GET /api/users` —
       * was told the user did not belong to this tenant, which is a false
       * statement about the caller's own data and sends them looking for a
       * cross-tenant mistake that does not exist.
       *
       * Whether an invited user may hold an approval step is a product
       * question, and it is deliberately not decided here: it is shared with
       * BUG-1968 and ITEM-0106, and the route resolver does not check the
       * status of a `USER` approver at all, so admitting one would route
       * requests to somebody who cannot sign in to act on them. The behaviour
       * is therefore unchanged; only the diagnosis is.
       */
      const approver = await this.repository.findTenantUserById(
        tenantId,
        data.approverUserId,
      );

      if (!approver)
        throw new BadRequestException(
          'Selected approver user does not belong to this tenant.',
        );

      if (approver.status !== UserStatus.ACTIVE)
        throw new BadRequestException(approverStatusMessage(approver.status));
    }
  }

  private async assertUnique(
    tenantId: string,
    data: ReturnType<ApprovalMatricesService['normalizeCreate']>,
    excludeId?: string,
  ) {
    if (!data.isActive) return;
    const duplicate = await this.repository.findConflict(
      tenantId,
      {
        moduleKey: data.moduleKey,
        recordType: data.recordType,
        leaveTypeId: data.leaveTypeId,
        leavePolicyId: data.leavePolicyId,
        claimTypeId: data.claimTypeId,
        loanPolicyId: data.loanPolicyId,
        currencyCode: data.currencyCode,
        organizationId: data.organizationId,
        businessUnitId: data.businessUnitId,
        departmentId: data.departmentId,
        employeeLevelId: data.employeeLevelId,
        minimumAmount: data.minimumAmount,
        maximumAmount: data.maximumAmount,
        minimumDuration: data.minimumDuration,
        maximumDuration: data.maximumDuration,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        sequence: data.sequence,
        approverType: data.approverType,
        approverRoleId: data.approverRoleId,
        approverUserId: data.approverUserId,
      },
      excludeId,
    );
    if (duplicate)
      throw new ConflictException(
        'An approval matrix row already exists for these conditions, sequence, and approver.',
      );
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: 'ApprovalMatrix',
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

const REFERENCE_KEYS: ReferenceKey[] = [
  'leaveTypeId',
  'leavePolicyId',
  'claimTypeId',
  'loanPolicyId',
  'organizationId',
  'businessUnitId',
  'departmentId',
  'employeeLevelId',
];

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}
/**
 * What to tell an administrator whose chosen approver is in the tenant but
 * cannot hold the step, in the vocabulary of the account rather than of the
 * query that refused it. BUG-1969.
 */
function approverStatusMessage(status: UserStatus) {
  if (status === UserStatus.INVITED) {
    return 'Selected approver user has not activated their account yet. They can be named as an approver once they accept their invitation — resend it from Settings > Users if needed.';
  }

  return 'Selected approver user account is disabled and cannot be assigned as an approver.';
}
function optionalDecimal(value?: number | null) {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value);
}
function optionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}
function assertRange(
  minimum: Prisma.Decimal | null,
  maximum: Prisma.Decimal | null,
  label: string,
) {
  if (minimum && maximum && minimum.gt(maximum))
    throw new BadRequestException(
      `Minimum ${label} cannot exceed maximum ${label}.`,
    );
}
function valueOrExisting<TValue, TExisting>(
  value: TValue | undefined,
  existing: TExisting,
): Exclude<TValue, undefined> | TExisting {
  return value === undefined ? existing : (value as Exclude<TValue, undefined>);
}
function decimalNumber(value: number | Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? undefined : Number(value);
}
function dateString(value: string | Date | null | undefined) {
  return value === null || value === undefined
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;
}
function jsonRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
