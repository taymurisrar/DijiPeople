import { Injectable } from '@nestjs/common';
import { ApprovalModuleKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListApprovalMatricesDto } from './dto/approval-matrix.dto';

const matrixInclude = {
  leaveType: { select: { id: true, name: true, code: true } },
  leavePolicy: { select: { id: true, name: true } },
  claimType: { select: { id: true, name: true, code: true } },
  loanPolicy: { select: { id: true, name: true, code: true } },
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, code: true } },
  employeeLevel: { select: { id: true, name: true, code: true } },
  approverRole: { select: { id: true, name: true, key: true } },
  approverUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.ApprovalMatrixInclude;

export type ApprovalMatrixWithApprovers = Prisma.ApprovalMatrixGetPayload<{
  include: typeof matrixInclude;
}>;

@Injectable()
export class ApprovalMatrixRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, query: ListApprovalMatricesDto) {
    return this.prisma.approvalMatrix.findMany({
      where: {
        tenantId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.moduleKey ? { moduleKey: query.moduleKey } : {}),
        ...(query.recordType ? { recordType: query.recordType } : {}),
        ...(query.search?.trim()
          ? {
              name: {
                contains: query.search.trim(),
                mode: Prisma.QueryMode.insensitive,
              },
            }
          : {}),
      },
      include: matrixInclude,
      orderBy: [{ moduleKey: 'asc' }, { sequence: 'asc' }, { name: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.approvalMatrix.findFirst({
      where: { tenantId, id },
      include: matrixInclude,
    });
  }

  findForResolution(
    tenantId: string,
    moduleKey: ApprovalModuleKey,
    effectiveAt: Date,
  ) {
    return this.prisma.approvalMatrix.findMany({
      where: {
        tenantId,
        moduleKey,
        isActive: true,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: { lte: effectiveAt } },
            ],
          },
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
          },
        ],
      },
      include: matrixInclude,
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findConflict(
    tenantId: string,
    data: Prisma.ApprovalMatrixWhereInput,
    excludeId?: string,
  ) {
    return this.prisma.approvalMatrix.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...data,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  create(data: Prisma.ApprovalMatrixUncheckedCreateInput) {
    return this.prisma.approvalMatrix.create({ data, include: matrixInclude });
  }

  update(
    tenantId: string,
    id: string,
    data: Prisma.ApprovalMatrixUncheckedUpdateInput,
  ) {
    return this.prisma.approvalMatrix.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  deactivate(tenantId: string, id: string, updatedById: string) {
    return this.prisma.approvalMatrix.updateMany({
      where: { tenantId, id },
      data: { isActive: false, updatedById },
    });
  }

  findRoleById(tenantId: string, id: string) {
    return this.prisma.role.findFirst({
      where: { tenantId, id, isActive: true },
    });
  }

  findRoleByKey(tenantId: string, key: string) {
    return this.prisma.role.findFirst({
      where: { tenantId, key, isActive: true },
    });
  }

  findUserById(tenantId: string, id: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, id, status: 'ACTIVE' },
    });
  }

  findActiveUsersByRoleId(tenantId: string, roleId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        userRoles: { some: { roleId } },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  findBusinessUnitOrganizationId(tenantId: string, businessUnitId: string) {
    return this.prisma.businessUnit.findFirst({
      where: { tenantId, id: businessUnitId },
      select: { organizationId: true },
    });
  }

  findReference(tenantId: string, key: ReferenceKey, id: string) {
    const where = { tenantId, id };
    switch (key) {
      case 'leaveTypeId':
        return this.prisma.leaveType.findFirst({ where, select: { id: true } });
      case 'leavePolicyId':
        return this.prisma.leavePolicy.findFirst({
          where,
          select: { id: true },
        });
      case 'claimTypeId':
        return this.prisma.claimType.findFirst({ where, select: { id: true } });
      case 'loanPolicyId':
        return this.prisma.loanPolicy.findFirst({
          where,
          select: { id: true },
        });
      case 'organizationId':
        return this.prisma.organization.findFirst({
          where,
          select: { id: true },
        });
      case 'businessUnitId':
        return this.prisma.businessUnit.findFirst({
          where,
          select: { id: true },
        });
      case 'departmentId':
        return this.prisma.department.findFirst({
          where,
          select: { id: true },
        });
      case 'employeeLevelId':
        return this.prisma.employeeLevel.findFirst({
          where,
          select: { id: true },
        });
    }
  }
}

export type ReferenceKey =
  | 'leaveTypeId'
  | 'leavePolicyId'
  | 'claimTypeId'
  | 'loanPolicyId'
  | 'organizationId'
  | 'businessUnitId'
  | 'departmentId'
  | 'employeeLevelId';
