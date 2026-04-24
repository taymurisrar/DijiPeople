import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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
      },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
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
      },
    });
  }

  findApprovalMatricesForLeaveType(
    tenantId: string,
    leaveTypeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ leaveTypeId }, { leaveTypeId: null }],
      },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createApprovalMatrix(
    data: Prisma.ApprovalMatrixUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.create({ data });
  }

  updateApprovalMatrix(
    tenantId: string,
    id: string,
    data: Prisma.ApprovalMatrixUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.approvalMatrix.updateMany({ where: { tenantId, id }, data });
  }

  createLeaveRequest(
    data: Prisma.LeaveRequestUncheckedCreateInput,
    approvalSteps: Prisma.LeaveApprovalStepUncheckedCreateWithoutLeaveRequestInput[],
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.create({
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
                in: ['hr', 'admin', 'system-admin'],
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

