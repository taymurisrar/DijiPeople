import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClaimApprovalStatus,
  ClaimApprovalStep,
  ClaimRequestStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateClaimSubTypeDto,
  CreateClaimTypeDto,
  UpdateClaimSubTypeDto,
  UpdateClaimTypeDto,
} from './dto/claim-catalog.dto';
import {
  ClaimActionDto,
  ClaimQueryDto,
  CreateClaimLineItemDto,
  CreateClaimRequestDto,
  RejectClaimDto,
  UpdateClaimLineItemDto,
  UpdateClaimRequestDto,
} from './dto/claim-request.dto';

const claimInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      userId: true,
    },
  },
  lineItems: {
    include: {
      claimType: true,
      claimSubType: true,
      receiptDocument: {
        select: {
          id: true,
          title: true,
          originalFileName: true,
          mimeType: true,
        },
      },
    },
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
  },
  approvals: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ClaimRequestInclude;

type ClaimWithRelations = Prisma.ClaimRequestGetPayload<{
  include: typeof claimInclude;
}>;

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listTypes(tenantId: string) {
    return this.prisma.claimType.findMany({
      where: { tenantId },
      include: { subTypes: { orderBy: { code: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async getType(tenantId: string, id: string) {
    const item = await this.prisma.claimType.findFirst({
      where: { tenantId, id },
      include: { subTypes: { orderBy: { code: 'asc' } } },
    });
    if (!item) throw new NotFoundException('Claim type was not found.');
    return item;
  }

  async createType(user: AuthenticatedUser, dto: CreateClaimTypeDto) {
    try {
      const created = await this.prisma.claimType.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit(
        user,
        'CLAIM_TYPE_CREATED',
        'ClaimType',
        created.id,
        null,
        created,
      );
      return created;
    } catch (error) {
      handleUnique(error, 'Claim type code already exists.');
    }
  }

  async updateType(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateClaimTypeDto,
  ) {
    const existing = await this.getType(user.tenantId, id);
    try {
      const updated = await this.prisma.claimType.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: emptyToNull(dto.description) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.audit(
        user,
        'CLAIM_TYPE_UPDATED',
        'ClaimType',
        id,
        existing,
        updated,
      );
      return updated;
    } catch (error) {
      handleUnique(error, 'Claim type code already exists.');
    }
  }

  async deactivateType(user: AuthenticatedUser, id: string) {
    const existing = await this.getType(user.tenantId, id);
    const updated = await this.prisma.claimType.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(
      user,
      'CLAIM_TYPE_DEACTIVATED',
      'ClaimType',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async createSubType(
    user: AuthenticatedUser,
    claimTypeId: string,
    dto: CreateClaimSubTypeDto,
  ) {
    const claimType = await this.getActiveClaimType(user.tenantId, claimTypeId);
    try {
      const created = await this.prisma.claimSubType.create({
        data: {
          tenantId: user.tenantId,
          claimTypeId: claimType.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          requiresReceipt: dto.requiresReceipt ?? false,
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit(
        user,
        'CLAIM_SUBTYPE_CREATED',
        'ClaimSubType',
        created.id,
        null,
        created,
      );
      return created;
    } catch (error) {
      handleUnique(
        error,
        'Claim subtype code already exists for this claim type.',
      );
    }
  }

  listSubTypes(tenantId: string, claimTypeId: string) {
    return this.prisma.claimSubType.findMany({
      where: { tenantId, claimTypeId },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async updateSubType(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateClaimSubTypeDto,
  ) {
    const existing = await this.findSubTypeOrThrow(user.tenantId, id);
    if (dto.claimTypeId) {
      await this.getActiveClaimType(user.tenantId, dto.claimTypeId);
    }
    try {
      const updated = await this.prisma.claimSubType.update({
        where: { id },
        data: {
          ...(dto.claimTypeId !== undefined
            ? { claimTypeId: dto.claimTypeId }
            : {}),
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: emptyToNull(dto.description) }
            : {}),
          ...(dto.requiresReceipt !== undefined
            ? { requiresReceipt: dto.requiresReceipt }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.audit(
        user,
        'CLAIM_SUBTYPE_UPDATED',
        'ClaimSubType',
        id,
        existing,
        updated,
      );
      return updated;
    } catch (error) {
      handleUnique(
        error,
        'Claim subtype code already exists for this claim type.',
      );
    }
  }

  async deactivateSubType(user: AuthenticatedUser, id: string) {
    const existing = await this.findSubTypeOrThrow(user.tenantId, id);
    const updated = await this.prisma.claimSubType.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(
      user,
      'CLAIM_SUBTYPE_DEACTIVATED',
      'ClaimSubType',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async listClaims(user: AuthenticatedUser, query: ClaimQueryDto) {
    const claims = await this.prisma.claimRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: claimInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return claims.map(mapClaim);
  }

  async listMyClaims(user: AuthenticatedUser) {
    const employee = await this.findEmployeeForUser(user.tenantId, user.userId);
    const claims = await this.prisma.claimRequest.findMany({
      where: { tenantId: user.tenantId, employeeId: employee.id },
      include: claimInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return claims.map(mapClaim);
  }

  async getClaim(user: AuthenticatedUser, id: string, self = false) {
    const claim = await this.findClaimOrThrow(user.tenantId, id);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    return mapClaim(claim);
  }

  async createClaim(
    user: AuthenticatedUser,
    dto: CreateClaimRequestDto,
    self = false,
  ) {
    const employeeId = self
      ? (await this.findEmployeeForUser(user.tenantId, user.userId)).id
      : (dto.employeeId ??
        (await this.findEmployeeForUser(user.tenantId, user.userId)).id);
    await this.assertEmployeeInTenant(user.tenantId, employeeId);
    const created = await this.prisma.claimRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        submittedByUserId: user.userId,
        title: dto.title.trim(),
        description: emptyToNull(dto.description),
        currencyCode: normalizeCurrency(dto.currencyCode),
      },
      include: claimInclude,
    });
    await this.audit(
      user,
      'CLAIM_CREATED',
      'ClaimRequest',
      created.id,
      null,
      created,
    );
    return mapClaim(created);
  }

  async updateClaim(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateClaimRequestDto,
    self = false,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, id);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    this.assertDraftEditable(claim);
    const updated = await this.prisma.claimRequest.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: emptyToNull(dto.description) }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
      },
      include: claimInclude,
    });
    return mapClaim(updated);
  }

  async addLineItem(
    user: AuthenticatedUser,
    claimId: string,
    dto: CreateClaimLineItemDto,
    self = false,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    this.assertDraftEditable(claim);
    const data = await this.buildLineItemData(user.tenantId, claim, dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.claimLineItem.create({ data });
      return this.recalculateClaimTotals(user.tenantId, claimId, tx);
    });
    return mapClaim(updated);
  }

  async updateLineItem(
    user: AuthenticatedUser,
    claimId: string,
    lineItemId: string,
    dto: UpdateClaimLineItemDto,
    self = false,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    this.assertDraftEditable(claim);
    const line = await this.findLineItemOrThrow(
      user.tenantId,
      claimId,
      lineItemId,
    );
    const merged = {
      claimTypeId: dto.claimTypeId ?? line.claimTypeId,
      claimSubTypeId:
        dto.claimSubTypeId === undefined
          ? (line.claimSubTypeId ?? undefined)
          : (dto.claimSubTypeId ?? undefined),
      transactionDate:
        dto.transactionDate ?? line.transactionDate.toISOString(),
      vendor: dto.vendor ?? line.vendor ?? undefined,
      description: dto.description ?? line.description ?? undefined,
      amount: dto.amount ?? Number(line.amount),
      approvedAmount:
        dto.approvedAmount === undefined
          ? line.approvedAmount === null
            ? undefined
            : Number(line.approvedAmount)
          : (dto.approvedAmount ?? undefined),
      currencyCode: dto.currencyCode ?? line.currencyCode,
      receiptDocumentId:
        dto.receiptDocumentId === undefined
          ? (line.receiptDocumentId ?? undefined)
          : (dto.receiptDocumentId ?? undefined),
    };
    const data = await this.buildLineItemData(user.tenantId, claim, merged);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.claimLineItem.update({ where: { id: lineItemId }, data });
      return this.recalculateClaimTotals(user.tenantId, claimId, tx);
    });
    return mapClaim(updated);
  }

  async deleteLineItem(
    user: AuthenticatedUser,
    claimId: string,
    lineItemId: string,
    self = false,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    this.assertDraftEditable(claim);
    await this.findLineItemOrThrow(user.tenantId, claimId, lineItemId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.claimLineItem.delete({ where: { id: lineItemId } });
      return this.recalculateClaimTotals(user.tenantId, claimId, tx);
    });
    return mapClaim(updated);
  }

  async submitClaim(user: AuthenticatedUser, claimId: string, self = false) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    if (claim.status !== ClaimRequestStatus.DRAFT) {
      throw new ConflictException('Only draft claims can be submitted.');
    }
    if (!claim.lineItems.length)
      throw new BadRequestException('Claim must have at least one line item.');
    const updated = await this.prisma.claimRequest.update({
      where: { id: claimId },
      data: { status: ClaimRequestStatus.SUBMITTED, submittedAt: new Date() },
      include: claimInclude,
    });
    await this.audit(
      user,
      'CLAIM_SUBMITTED',
      'ClaimRequest',
      claimId,
      claim,
      updated,
    );
    return mapClaim(updated);
  }

  approveManager(
    user: AuthenticatedUser,
    claimId: string,
    dto: ClaimActionDto,
  ) {
    return this.approve(user, claimId, dto, ClaimApprovalStep.MANAGER);
  }

  approvePayroll(
    user: AuthenticatedUser,
    claimId: string,
    dto: ClaimActionDto,
  ) {
    return this.approve(user, claimId, dto, ClaimApprovalStep.PAYROLL);
  }

  async rejectClaim(
    user: AuthenticatedUser,
    claimId: string,
    dto: RejectClaimDto,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (
      claim.status === ClaimRequestStatus.INCLUDED_IN_PAYROLL ||
      claim.status === ClaimRequestStatus.PAID
    ) {
      throw new ConflictException(
        'Claims included in payroll cannot be rejected.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.claimApproval.create({
        data: {
          tenantId: user.tenantId,
          claimRequestId: claimId,
          step:
            claim.status === ClaimRequestStatus.MANAGER_APPROVED
              ? ClaimApprovalStep.PAYROLL
              : ClaimApprovalStep.MANAGER,
          status: ClaimApprovalStatus.REJECTED,
          actorUserId: user.userId,
          comments: dto.reason.trim(),
        },
      });
      return tx.claimRequest.update({
        where: { id: claimId },
        data: {
          status: ClaimRequestStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason.trim(),
        },
        include: claimInclude,
      });
    });
    await this.audit(
      user,
      'CLAIM_REJECTED',
      'ClaimRequest',
      claimId,
      claim,
      updated,
    );
    return mapClaim(updated);
  }

  async cancelClaim(user: AuthenticatedUser, claimId: string, self = false) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (self) await this.assertSelfClaim(user, claim.employeeId);
    if (
      claim.status === ClaimRequestStatus.INCLUDED_IN_PAYROLL ||
      claim.status === ClaimRequestStatus.PAID
    ) {
      throw new ConflictException(
        'Claims included in payroll cannot be cancelled.',
      );
    }
    const updated = await this.prisma.claimRequest.update({
      where: { id: claimId },
      data: { status: ClaimRequestStatus.CANCELLED },
      include: claimInclude,
    });
    await this.audit(
      user,
      'CLAIM_CANCELLED',
      'ClaimRequest',
      claimId,
      claim,
      updated,
    );
    return mapClaim(updated);
  }

  private async approve(
    user: AuthenticatedUser,
    claimId: string,
    dto: ClaimActionDto,
    step: ClaimApprovalStep,
  ) {
    const claim = await this.findClaimOrThrow(user.tenantId, claimId);
    if (
      step === ClaimApprovalStep.MANAGER &&
      claim.status !== ClaimRequestStatus.SUBMITTED
    ) {
      throw new ConflictException(
        'Only submitted claims can be manager approved.',
      );
    }
    if (
      step === ClaimApprovalStep.PAYROLL &&
      claim.status !== ClaimRequestStatus.MANAGER_APPROVED
    ) {
      throw new ConflictException(
        'Only manager-approved claims can be payroll approved.',
      );
    }
    if (!claim.lineItems.length)
      throw new BadRequestException('Claim must have at least one line item.');
    const nextStatus =
      step === ClaimApprovalStep.MANAGER
        ? ClaimRequestStatus.MANAGER_APPROVED
        : ClaimRequestStatus.PAYROLL_APPROVED;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.claimApproval.create({
        data: {
          tenantId: user.tenantId,
          claimRequestId: claimId,
          step,
          status: ClaimApprovalStatus.APPROVED,
          actorUserId: user.userId,
          comments: dto.comments?.trim(),
        },
      });
      return tx.claimRequest.update({
        where: { id: claimId },
        data: {
          status: nextStatus,
          ...(step === ClaimApprovalStep.MANAGER
            ? { managerApprovedAt: new Date() }
            : { payrollApprovedAt: new Date() }),
        },
        include: claimInclude,
      });
    });
    await this.audit(
      user,
      step === ClaimApprovalStep.MANAGER
        ? 'CLAIM_MANAGER_APPROVED'
        : 'CLAIM_PAYROLL_APPROVED',
      'ClaimRequest',
      claimId,
      claim,
      updated,
    );
    return mapClaim(updated);
  }

  private async buildLineItemData(
    tenantId: string,
    claim: ClaimWithRelations,
    dto: CreateClaimLineItemDto,
  ): Promise<Prisma.ClaimLineItemUncheckedCreateInput> {
    const claimType = await this.getActiveClaimType(tenantId, dto.claimTypeId);
    const claimSubType = dto.claimSubTypeId
      ? await this.getActiveClaimSubType(
          tenantId,
          dto.claimSubTypeId,
          claimType.id,
        )
      : null;
    const amount = new Prisma.Decimal(dto.amount);
    const approvedAmount =
      dto.approvedAmount === undefined
        ? null
        : new Prisma.Decimal(dto.approvedAmount);
    if (approvedAmount && approvedAmount.gt(amount)) {
      throw new BadRequestException('approvedAmount cannot exceed amount.');
    }
    if (claimSubType?.requiresReceipt && !dto.receiptDocumentId) {
      throw new BadRequestException(
        'Receipt document is required for this claim subtype.',
      );
    }
    if (dto.receiptDocumentId) {
      await this.assertDocumentInTenant(tenantId, dto.receiptDocumentId);
    }
    return {
      tenantId,
      claimRequestId: claim.id,
      employeeId: claim.employeeId,
      claimTypeId: claimType.id,
      claimSubTypeId: claimSubType?.id ?? null,
      transactionDate: new Date(dto.transactionDate),
      vendor: emptyToNull(dto.vendor),
      description: emptyToNull(dto.description),
      amount,
      approvedAmount,
      currencyCode: normalizeCurrency(dto.currencyCode),
      receiptDocumentId: dto.receiptDocumentId ?? null,
    };
  }

  private async recalculateClaimTotals(
    tenantId: string,
    claimId: string,
    tx: Prisma.TransactionClient,
  ) {
    const lines = await tx.claimLineItem.findMany({
      where: { tenantId, claimRequestId: claimId },
    });
    const submittedAmount = lines.reduce(
      (sum, line) => sum.plus(line.amount),
      new Prisma.Decimal(0),
    );
    const approvedAmount = lines.reduce(
      (sum, line) => sum.plus(line.approvedAmount ?? line.amount),
      new Prisma.Decimal(0),
    );
    return tx.claimRequest.update({
      where: { id: claimId },
      data: { submittedAmount, approvedAmount },
      include: claimInclude,
    });
  }

  private async getActiveClaimType(tenantId: string, id: string) {
    const claimType = await this.prisma.claimType.findFirst({
      where: { tenantId, id, isActive: true },
    });
    if (!claimType)
      throw new BadRequestException('Active claim type was not found.');
    return claimType;
  }

  private async getActiveClaimSubType(
    tenantId: string,
    id: string,
    claimTypeId: string,
  ) {
    const claimSubType = await this.prisma.claimSubType.findFirst({
      where: { tenantId, id, claimTypeId, isActive: true },
    });
    if (!claimSubType)
      throw new BadRequestException(
        'Active claim subtype was not found for this claim type.',
      );
    return claimSubType;
  }

  private async findSubTypeOrThrow(tenantId: string, id: string) {
    const subType = await this.prisma.claimSubType.findFirst({
      where: { tenantId, id },
    });
    if (!subType) throw new NotFoundException('Claim subtype was not found.');
    return subType;
  }

  private async findClaimOrThrow(tenantId: string, id: string) {
    const claim = await this.prisma.claimRequest.findFirst({
      where: { tenantId, id },
      include: claimInclude,
    });
    if (!claim) throw new NotFoundException('Claim was not found.');
    return claim;
  }

  private async findLineItemOrThrow(
    tenantId: string,
    claimRequestId: string,
    id: string,
  ) {
    const line = await this.prisma.claimLineItem.findFirst({
      where: { tenantId, claimRequestId, id },
    });
    if (!line) throw new NotFoundException('Claim line item was not found.');
    return line;
  }

  private assertDraftEditable(claim: ClaimWithRelations) {
    if (claim.status !== ClaimRequestStatus.DRAFT) {
      throw new ConflictException('Only draft claims can be edited.');
    }
  }

  private async assertSelfClaim(user: AuthenticatedUser, employeeId: string) {
    const employee = await this.findEmployeeForUser(user.tenantId, user.userId);
    if (employee.id !== employeeId) {
      throw new ForbiddenException('You can only access your own claims.');
    }
  }

  private async findEmployeeForUser(tenantId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (!employee)
      throw new BadRequestException(
        'No employee profile is linked to this user.',
      );
    return employee;
  }

  private async assertEmployeeInTenant(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
      select: { id: true },
    });
    if (!employee)
      throw new BadRequestException('Employee was not found for this tenant.');
  }

  private async assertDocumentInTenant(tenantId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { tenantId, id: documentId, isArchived: false },
      select: { id: true },
    });
    if (!document)
      throw new BadRequestException(
        'Receipt document was not found for this tenant.',
      );
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function mapClaim(claim: ClaimWithRelations) {
  return {
    ...claim,
    submittedAmount: claim.submittedAmount.toString(),
    approvedAmount: claim.approvedAmount.toString(),
    lineItems: claim.lineItems.map((line) => ({
      ...line,
      amount: line.amount.toString(),
      approvedAmount: line.approvedAmount?.toString() ?? null,
    })),
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function handleUnique(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
