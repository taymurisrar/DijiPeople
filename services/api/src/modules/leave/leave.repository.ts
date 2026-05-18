import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const leaveRequestInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      userId: true,
      managerEmployeeId: true,
      manager: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
  leaveType: {
    select: {
      id: true,
      name: true,
      code: true,
      category: true,
      requiresApproval: true,
      isPaid: true,
    },
  },
  approvalSteps: {
    include: {
      approverUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      stepOrder: 'asc',
    },
  },
  documentLinks: {
    include: {
      document: {
        include: {
          documentType: {
            select: { id: true, key: true, name: true },
          },
          documentCategory: {
            select: { id: true, code: true, name: true },
          },
          uploadedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  },
} satisfies Prisma.LeaveRequestInclude;

export type LeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{
  include: typeof leaveRequestInclude;
}>;

@Injectable()
export class LeaveRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLeaveTypes(
    tenantId: string,
    query: ListLeaveConfigDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveType.findMany({
      where: buildSearchWhere(tenantId, query, ['name', 'code', 'category']),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findLeaveTypeById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.leaveType.findFirst({ where: { tenantId, id } });
  }

  createLeaveType(
    data: Prisma.LeaveTypeUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveType.create({ data });
  }

  updateLeaveType(
    tenantId: string,
    id: string,
    data: Prisma.LeaveTypeUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveType.updateMany({ where: { tenantId, id }, data });
  }

  findLeavePolicies(
    tenantId: string,
    query: ListLeaveConfigDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.leavePolicy.findMany({
      where: buildSearchWhere(tenantId, query, ['name']),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findLeavePolicyById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.leavePolicy.findFirst({ where: { tenantId, id } });
  }

  createLeavePolicy(
    data: Prisma.LeavePolicyUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leavePolicy.create({ data });
  }

  updateLeavePolicy(
    tenantId: string,
    id: string,
    data: Prisma.LeavePolicyUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leavePolicy.updateMany({ where: { tenantId, id }, data });
  }

  findApprovalMatrices(
    tenantId: string,
    query: ListLeaveConfigDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.findMany({
      where: buildSearchWhere(tenantId, query, ['name']),
      include: {
        leaveType: {
          select: { id: true, name: true, code: true },
        },
        leavePolicy: {
          select: { id: true, name: true },
        },
        approverRole: {
          select: { id: true, name: true, key: true },
        },
        approverUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ moduleKey: 'asc' }, { sequence: 'asc' }, { name: 'asc' }],
    } as Prisma.ApprovalMatrixFindManyArgs);
  }

  findApprovalMatrixById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.findFirst({
      where: { tenantId, id },
      include: {
        leaveType: {
          select: { id: true, name: true, code: true },
        },
        leavePolicy: {
          select: { id: true, name: true },
        },
        approverRole: {
          select: { id: true, name: true, key: true },
        },
        approverUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    } as Prisma.ApprovalMatrixFindFirstArgs);
  }

  findConflictingApprovalMatrix(
    tenantId: string,
    data: {
      leaveTypeId?: string | null;
      leavePolicyId?: string | null;
      moduleKey: string;
      scopeType?: string | null;
      scopeId?: string | null;
      sequence: number;
      approverType: Prisma.ApprovalMatrixWhereInput['approverType'];
      approverRoleId?: string | null;
      approverUserId?: string | null;
      excludeId?: string;
    },
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.findFirst({
      where: {
        tenantId,
        isActive: true,
        moduleKey: data.moduleKey,
        leaveTypeId: data.leaveTypeId ?? null,
        leavePolicyId: data.leavePolicyId ?? null,
        scopeType: data.scopeType ?? null,
        scopeId: data.scopeId ?? null,
        sequence: data.sequence,
        approverType: data.approverType,
        approverRoleId: data.approverRoleId ?? null,
        approverUserId: data.approverUserId ?? null,
        ...(data.excludeId ? { id: { not: data.excludeId } } : {}),
      },
    } as Prisma.ApprovalMatrixFindFirstArgs);
  }

  findApprovalMatricesForResolver(
    tenantId: string,
    moduleKey: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.findMany({
      where: {
        tenantId,
        isActive: true,
        moduleKey,
      },
      include: {
        approverRole: {
          select: { id: true, name: true, key: true },
        },
        approverUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    } as Prisma.ApprovalMatrixFindManyArgs);
  }

  createApprovalMatrix(
    data: Record<string, unknown>,
    db: PrismaDb = this.prisma,
  ) {
    return (db.approvalMatrix as any).create({ data });
  }

  updateApprovalMatrix(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
    db: PrismaDb = this.prisma,
  ) {
    return (db.approvalMatrix as any).updateMany({
      where: { tenantId, id },
      data,
    });
  }

  deactivateApprovalMatrix(
    tenantId: string,
    id: string,
    updatedById: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.updateMany({
      where: { tenantId, id },
      data: { isActive: false, updatedById },
    });
  }

  findRoleById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.role.findFirst({ where: { tenantId, id, isActive: true } });
  }

  findUserById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.user.findFirst({ where: { tenantId, id, status: 'ACTIVE' } });
  }

  findActiveUsersByRoleId(
    tenantId: string,
    roleId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        userRoles: { some: { roleId } },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  findRoleByKey(tenantId: string, key: string, db: PrismaDb = this.prisma) {
    return db.role.findFirst({ where: { tenantId, key, isActive: true } });
  }

  createLeaveRequest(
    data: Prisma.LeaveRequestUncheckedCreateInput,
    approvalSteps: Array<Record<string, unknown>>,
    db: PrismaDb = this.prisma,
  ) {
    return (db.leaveRequest as any).create({
      data: {
        ...data,
        approvalSteps: {
          create: approvalSteps,
        },
      },
      include: leaveRequestInclude,
    });
  }

  findLeaveRequestById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findFirst({
      where: { tenantId, id },
      include: leaveRequestInclude,
    });
  }

  findLeaveRequestsByEmployee(
    tenantId: string,
    employeeId: string,
    query: LeaveRequestQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: leaveRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  findLeaveRequestsByTenant(
    tenantId: string,
    query: LeaveRequestQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: leaveRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  findLeaveRequestsByEmployees(
    tenantId: string,
    employeeIds: string[],
    query: LeaveRequestQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        ...(query.status ? { status: query.status } : {}),
      },
      include: leaveRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  findPendingLeaveRequestsForTeam(
    tenantId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        status: 'PENDING',
      },
      include: leaveRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  updateLeaveRequest(
    tenantId: string,
    id: string,
    data: Prisma.LeaveRequestUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  updateLeaveApprovalStep(
    tenantId: string,
    id: string,
    data: Prisma.LeaveApprovalStepUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveApprovalStep.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findHrApproverUsers(tenantId: string, db: PrismaDb = this.prisma) {
    return db.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        userRoles: {
          some: {
            role: {
              key: {
                in: ['admin', ROLE_KEYS.HR, ROLE_KEYS.SYSTEM_ADMIN],
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  listLeavePolicyRules(tenantId: string, leavePolicyId: string) {
    return this.prisma.leavePolicyRule.findMany({
      where: {
        tenantId,
        leavePolicyId,
      },
      include: {
        leaveType: true,
      },
      orderBy: [
        {
          isActive: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  listActiveLeavePolicyRules(tenantId: string, leavePolicyId: string) {
    return this.prisma.leavePolicyRule.findMany({
      where: {
        tenantId,
        leavePolicyId,
        isActive: true,
        leaveType: { isActive: true },
      },
      include: {
        leaveType: true,
      },
      orderBy: [{ leaveType: { name: 'asc' } }],
    });
  }

  findLeavePolicyRuleById(
    tenantId: string,
    leavePolicyId: string,
    ruleId: string,
  ) {
    return this.prisma.leavePolicyRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
        leavePolicyId,
      },
      include: {
        leaveType: true,
      },
    });
  }

  findLeavePolicyRuleByPolicyAndLeaveType(
    tenantId: string,
    leavePolicyId: string,
    leaveTypeId: string,
  ) {
    return this.prisma.leavePolicyRule.findUnique({
      where: {
        tenantId_leavePolicyId_leaveTypeId: {
          tenantId,
          leavePolicyId,
          leaveTypeId,
        },
      },
    });
  }

  createLeavePolicyRule(
    tenantId: string,
    policyId: string,
    data: Omit<
      Prisma.LeavePolicyRuleUncheckedCreateInput,
      'tenantId' | 'leavePolicyId'
    >,
  ) {
    return this.prisma.leavePolicyRule.create({
      data: {
        ...data,
        tenantId,
        leavePolicyId: policyId,
      },
      include: {
        leaveType: true,
      },
    });
  }

  updateLeavePolicyRule(
    tenantId: string,
    policyId: string,
    ruleId: string,
    data: Prisma.LeavePolicyRuleUncheckedUpdateInput,
  ) {
    return this.prisma.leavePolicyRule.update({
      where: {
        id: ruleId,
      },
      data,
      include: {
        leaveType: true,
      },
    });
  }

  deleteLeavePolicyRule(
    tenantId: string,
    leavePolicyId: string,
    ruleId: string,
  ) {
    return this.prisma.leavePolicyRule.deleteMany({
      where: {
        id: ruleId,
        tenantId,
        leavePolicyId,
      },
    });
  }

  listLeavePolicyAssignments(tenantId: string) {
    return (this.prisma as any).leavePolicyAssignment.findMany({
      where: { tenantId },
      include: { leavePolicy: true },
      orderBy: [
        { isActive: 'desc' },
        { scopeType: 'asc' },
        { priority: 'desc' },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  findLeavePolicyAssignmentById(tenantId: string, id: string) {
    return (this.prisma as any).leavePolicyAssignment.findFirst({
      where: { tenantId, id },
      include: { leavePolicy: true },
    });
  }

  createLeavePolicyAssignment(data: Record<string, unknown>) {
    return (this.prisma as any).leavePolicyAssignment.create({
      data,
      include: { leavePolicy: true },
    });
  }

  updateLeavePolicyAssignment(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    return (this.prisma as any).leavePolicyAssignment.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findActiveLeavePolicyAssignments(tenantId: string, at: Date) {
    return (this.prisma as any).leavePolicyAssignment.findMany({
      where: {
        tenantId,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      include: { leavePolicy: true },
    });
  }
}

function buildSearchWhere(
  tenantId: string,
  query: ListLeaveConfigDto,
  fields: string[],
) {
  const where: {
    tenantId: string;
    isActive?: boolean;
    OR?: Array<Record<string, { contains: string; mode: Prisma.QueryMode }>>;
  } = { tenantId };

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();
    where.OR = fields.map((field) => ({
      [field]: {
        contains: search,
        mode: 'insensitive',
      },
    }));
  }

  return where;
}
