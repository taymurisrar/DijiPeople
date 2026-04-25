import { Injectable } from '@nestjs/common';
import { Prisma, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const timesheetInclude = {
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
          userId: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  approverUser: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  entries: {
    include: {
      leaveRequest: {
        select: {
          id: true,
          status: true,
          leaveType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ date: 'asc' }],
  },
} satisfies Prisma.TimesheetInclude;

export type TimesheetWithRelations = Prisma.TimesheetGetPayload<{
  include: typeof timesheetInclude;
}>;

@Injectable()
export class TimesheetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMONTHLYTimesheet(
    tenantId: string,
    employeeId: string,
    year: number,
    month: number,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheet.findFirst({
      where: { tenantId, employeeId, year, month },
      include: timesheetInclude,
    });
  }

  findTimesheetById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheet.findFirst({
      where: { tenantId, id },
      include: timesheetInclude,
    });
  }

  createTimesheet(
    data: Prisma.TimesheetUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheet.create({
      data,
      include: timesheetInclude,
    });
  }

  updateTimesheet(
    tenantId: string,
    id: string,
    data: Prisma.TimesheetUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheet
      .updateMany({
        where: { id, tenantId },
        data,
      })
      .then(() =>
        db.timesheet.findFirst({
          where: { id, tenantId },
          include: timesheetInclude,
        }),
      );
  }

  findEntryByDate(
    tenantId: string,
    timesheetId: string,
    date: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetEntry.findFirst({
      where: {
        tenantId,
        timesheetId,
        date,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  createTimesheetEntry(
    data: Prisma.TimesheetEntryUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetEntry.create({
      data,
    });
  }

  updateTimesheetEntry(
    tenantId: string,
    id: string,
    data: Prisma.TimesheetEntryUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetEntry
      .updateMany({
        where: { id, tenantId },
        data,
      })
      .then(() =>
        db.timesheetEntry.findFirst({
          where: { id, tenantId },
        }),
      );
  }

  findApprovedLeaveRequestsForMonth(
    tenantId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: 'APPROVED',
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  findHolidaysForMonth(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.holidayCalendar.findMany({
      where: {
        tenantId,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async findTimesheetsByEmployee(
    tenantId: string,
    employeeId: string,
    query: TimesheetQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where = buildTimesheetWhere(tenantId, query, { employeeId });
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.timesheet.findMany({
        where,
        include: timesheetInclude,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.timesheet.count({ where }),
    ]);

    return { items, total };
  }

  async findTeamTimesheets(
    tenantId: string,
    employeeIds: string[],
    query: TimesheetQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    if (employeeIds.length === 0) {
      return { items: [], total: 0 };
    }

    const filteredEmployeeIds =
      query.employeeId && employeeIds.includes(query.employeeId)
        ? [query.employeeId]
        : query.employeeId
          ? []
          : employeeIds;

    if (filteredEmployeeIds.length === 0) {
      return { items: [], total: 0 };
    }

    const where = buildTimesheetWhere(tenantId, query, {
      employeeId: { in: filteredEmployeeIds },
    });
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.timesheet.findMany({
        where,
        include: timesheetInclude,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.timesheet.count({ where }),
    ]);

    return { items, total };
  }
}

function buildTimesheetWhere(
  tenantId: string,
  query: TimesheetQueryDto,
  employeeFilter: Prisma.TimesheetWhereInput,
): Prisma.TimesheetWhereInput {
  const where: Prisma.TimesheetWhereInput = {
    tenantId,
    ...employeeFilter,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.year) {
    where.year = query.year;
  }

  if (query.month) {
    where.month = query.month;
  }

  return where;
}
