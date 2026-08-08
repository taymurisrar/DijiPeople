import { Injectable } from '@nestjs/common';
import { LeaveRequestStatus, Prisma } from '@prisma/client';
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

/**
 * Column filters from the shared data table, applied to the leave request list.
 *
 * Keeping the operator semantics identical to the other modules means a
 * condition behaves the same wherever the user applies it.
 */
function buildLeaveTextFilter(
  value: string,
  operator: string | undefined,
): Prisma.StringFilter {
  const trimmed = value.trim();

  switch (operator) {
    case 'equals':
      return { equals: trimmed, mode: 'insensitive' };
    case 'notEquals':
      return { not: trimmed, mode: 'insensitive' };
    case 'startsWith':
      return { startsWith: trimmed, mode: 'insensitive' };
    case 'endsWith':
      return { endsWith: trimmed, mode: 'insensitive' };
    case 'notContains':
      return { not: { contains: trimmed } };
    case 'isEmpty':
      return { in: [''] };
    case 'isNotEmpty':
      return { not: { in: [''] } };
    default:
      return { contains: trimmed, mode: 'insensitive' };
  }
}

function isNegatedLeaveOperator(operator: string | undefined) {
  return operator === 'notContains' || operator === 'notEquals';
}

/** Builds the where fragment for the table's column filters. */
function buildLeaveColumnFilters(
  query: LeaveRequestQueryDto,
): Prisma.LeaveRequestWhereInput {
  const clauses: Prisma.LeaveRequestWhereInput[] = [];

  if (query.employeeFilter?.trim()) {
    const filter = buildLeaveTextFilter(
      query.employeeFilter,
      query.employeeFilterOperator,
    );
    const parts = [
      { employee: { firstName: filter } },
      { employee: { lastName: filter } },
      { employee: { employeeCode: filter } },
    ];

    clauses.push(
      isNegatedLeaveOperator(query.employeeFilterOperator)
        ? { AND: parts }
        : { OR: parts },
    );
  }

  if (query.leaveTypeFilter?.trim()) {
    clauses.push({
      leaveType: {
        name: buildLeaveTextFilter(
          query.leaveTypeFilter,
          query.leaveTypeFilterOperator,
        ),
      },
    });
  }

  if (query.statusFilter?.trim()) {
    const statuses = query.statusFilter
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value): value is LeaveRequestStatus =>
        Object.values(LeaveRequestStatus).includes(value as LeaveRequestStatus),
      );

    if (statuses.length) {
      clauses.push(
        query.statusFilterOperator === 'notEquals'
          ? { status: { notIn: statuses } }
          : { status: { in: statuses } },
      );
    }
  }

  return clauses.length ? { AND: clauses } : {};
}

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
        ...buildLeaveColumnFilters(query),
      },
      include: leaveRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * Finds live requests for an employee whose dates intersect the given range.
   *
   * Two ranges overlap when each starts on or before the other ends. Only
   * PENDING and APPROVED requests count: rejected and cancelled ones no longer
   * reserve the days.
   */
  findOverlappingLeaveRequests(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRequestId?: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: {
          in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED],
        },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeLeaveRequestId
          ? { id: { not: excludeLeaveRequestId } }
          : {}),
      },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        leaveType: { select: { name: true } },
      },
      orderBy: [{ startDate: 'asc' }],
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
        ...buildLeaveColumnFilters(query),
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
        ...buildLeaveColumnFilters(query),
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

  listLeavePolicyRulesByLeaveType(tenantId: string, leaveTypeId: string) {
    return this.prisma.leavePolicyRule.findMany({
      where: { tenantId, leaveTypeId },
      include: {
        leaveType: true,
        leavePolicy: true,
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
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

  listLeavePolicyAssignmentsByPolicy(tenantId: string, leavePolicyId: string) {
    return (this.prisma as any).leavePolicyAssignment.findMany({
      where: { tenantId, leavePolicyId },
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
