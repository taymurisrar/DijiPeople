import { Injectable } from '@nestjs/common';
import {
  EmployeeEmploymentStatus,
  Prisma,
  TimesheetImportBatchStatus,
  TimesheetStatus,
} from '@prisma/client';
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
      businessUnitId: true,
      businessUnit: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      departmentId: true,
      locationId: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          businessUnit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
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

const timesheetTemplateEmployeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  email: true,
  recordType: true,
  businessUnitId: true,
  businessUnit: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  location: {
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
    },
  },
  user: {
    select: {
      businessUnit: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.EmployeeSelect;

export type TimesheetWithRelations = Prisma.TimesheetGetPayload<{
  include: typeof timesheetInclude;
}>;

export type TimesheetTemplateEmployee = Prisma.EmployeeGetPayload<{
  select: typeof timesheetTemplateEmployeeSelect;
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

  findTimesheetById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
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
        orderBy: buildTimesheetOrderBy(query),
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
        orderBy: buildTimesheetOrderBy(query),
        skip,
        take: query.pageSize,
      }),
      db.timesheet.count({ where }),
    ]);

    return { items, total };
  }

  findEmployeesForTemplate(
    tenantId: string,
    filters: {
      employeeIds?: string[];
      employeeId?: string;
      businessUnitId?: string;
      departmentId?: string;
      locationId?: string;
    },
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      employmentStatus: EmployeeEmploymentStatus.ACTIVE,
    };

    if (filters.employeeIds) {
      where.id = { in: filters.employeeIds };
    }

    if (filters.employeeId) {
      where.id = filters.employeeId;
    }

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    if (filters.businessUnitId) {
      where.OR = [
        { businessUnitId: filters.businessUnitId },
        {
          businessUnitId: null,
          user: { businessUnitId: filters.businessUnitId },
        },
      ];
    }

    return db.employee.findMany({
      where,
      select: timesheetTemplateEmployeeSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  findApprovedLeaveRequestsForEmployeesForMonth(
    tenantId: string,
    employeeIds: string[],
    periodStart: Date,
    periodEnd: Date,
    db: PrismaDb = this.prisma,
  ) {
    if (employeeIds.length === 0) {
      return [];
    }

    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: {
        id: true,
        employeeId: true,
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

  findTimesheetsForTemplate(
    tenantId: string,
    employeeIds: string[],
    year: number,
    month: number,
    db: PrismaDb = this.prisma,
  ) {
    if (employeeIds.length === 0) {
      return [];
    }

    return db.timesheet.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        year,
        month,
      },
      include: timesheetInclude,
    });
  }

  createImportBatch(
    data: Prisma.TimesheetImportBatchUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetImportBatch.create({ data });
  }

  findImportBatchById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetImportBatch.findFirst({
      where: { tenantId, id },
    });
  }

  updateImportBatch(
    tenantId: string,
    id: string,
    data: Prisma.TimesheetImportBatchUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetImportBatch.update({
      where: { id, tenantId },
      data,
    });
  }

  markImportBatchProcessing(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetImportBatch.updateMany({
      where: {
        tenantId,
        id,
        status: TimesheetImportBatchStatus.PREVIEWED,
      },
      data: {
        status: TimesheetImportBatchStatus.PROCESSING,
      },
    });
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

  const employeeWhere: Prisma.EmployeeWhereInput = {};

  if (query.managerEmployeeId) {
    employeeWhere.managerEmployeeId = query.managerEmployeeId;
  }

  if (query.departmentId) {
    employeeWhere.departmentId = query.departmentId;
  }

  if (query.businessUnitId) {
    employeeWhere.OR = [
      { businessUnitId: query.businessUnitId },
      { businessUnitId: null, user: { businessUnitId: query.businessUnitId } },
    ];
  }

  if (Object.keys(employeeWhere).length > 0) {
    where.employee = employeeWhere;
  }

  return where;
}

function buildTimesheetOrderBy(
  query: TimesheetQueryDto,
): Prisma.TimesheetOrderByWithRelationInput[] {
  const direction = query.sortDirection ?? 'desc';

  switch (query.sortField) {
    case 'employee':
      return [
        { employee: { lastName: direction } },
        { employee: { firstName: direction } },
      ];
    case 'status':
      return [{ status: direction }, { updatedAt: 'desc' }];
    case 'updatedAt':
      return [{ updatedAt: direction }];
    case 'yearMonth':
    default:
      return [{ year: direction }, { month: direction }, { updatedAt: 'desc' }];
  }
}
