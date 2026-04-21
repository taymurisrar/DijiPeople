import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const payrollRecordInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      employmentStatus: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      designation: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
  },
} satisfies Prisma.PayrollRecordInclude;

const payrollCycleInclude = {
  records: {
    include: payrollRecordInclude,
    orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
  },
  _count: {
    select: {
      records: true,
    },
  },
} satisfies Prisma.PayrollCycleInclude;

const compensationInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      employmentStatus: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      designation: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
  },
} satisfies Prisma.EmployeeCompensationInclude;

export type PayrollCycleWithRelations = Prisma.PayrollCycleGetPayload<{
  include: typeof payrollCycleInclude;
}>;

export type EmployeeCompensationWithRelations =
  Prisma.EmployeeCompensationGetPayload<{
    include: typeof compensationInclude;
  }>;

@Injectable()
export class PayrollRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCycles(
    tenantId: string,
    query: PayrollCycleQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.PayrollCycleWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.payrollCycle.findMany({
        where,
        include: payrollCycleInclude,
        orderBy: [{ periodStart: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.payrollCycle.count({ where }),
    ]);

    return { items, total };
  }

  findCycleById(
    tenantId: string,
    cycleId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.payrollCycle.findFirst({
      where: { tenantId, id: cycleId },
      include: payrollCycleInclude,
    });
  }

  createCycle(
    data: Prisma.PayrollCycleUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.payrollCycle.create({ data, include: payrollCycleInclude });
  }

  updateCycle(
    tenantId: string,
    cycleId: string,
    data: Prisma.PayrollCycleUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.payrollCycle.updateMany({
      where: { tenantId, id: cycleId },
      data,
    });
  }

  listCompensations(tenantId: string, db: PrismaDb = this.prisma) {
    return db.employeeCompensation.findMany({
      where: { tenantId },
      include: compensationInclude,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findCompensationById(
    tenantId: string,
    compensationId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeCompensation.findFirst({
      where: { tenantId, id: compensationId },
      include: compensationInclude,
    });
  }

  createCompensation(
    data: Prisma.EmployeeCompensationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeCompensation.create({
      data,
      include: compensationInclude,
    });
  }

  updateCompensation(
    tenantId: string,
    compensationId: string,
    data: Prisma.EmployeeCompensationUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeCompensation.updateMany({
      where: { tenantId, id: compensationId },
      data,
    });
  }

  findEligibleEmployeesForPayrollDrafts(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findMany({
      where: {
        tenantId,
        OR: [{ terminationDate: null }, { terminationDate: { gte: periodStart } }],
        compensations: {
          some: {
            tenantId,
            effectiveDate: { lte: periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        employmentStatus: true,
        compensations: {
          where: {
            tenantId,
            effectiveDate: { lte: periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
          },
          orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  createPayrollRecordsMany(
    data: Prisma.PayrollRecordCreateManyInput[],
    db: PrismaDb = this.prisma,
  ) {
    return db.payrollRecord.createMany({
      data,
      skipDuplicates: true,
    });
  }
}

