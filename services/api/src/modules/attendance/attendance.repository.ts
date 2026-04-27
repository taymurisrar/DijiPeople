import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const attendanceInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      userId: true,
      managerEmployeeId: true,
      departmentId: true,
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
      manager: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          userId: true,
        },
      },
    },
  },
  workSchedule: {
    select: {
      id: true,
      name: true,
      weeklyWorkDays: true,
      standardStartTime: true,
      standardEndTime: true,
      graceMinutes: true,
      isDefault: true,
    },
  },
  officeLocation: {
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      state: true,
      country: true,
      timezone: true,
    },
  },
  importedBatch: {
    select: {
      id: true,
      fileName: true,
      status: true,
      importedAt: true,
    },
  },
} satisfies Prisma.AttendanceEntryInclude;

export type AttendanceEntryWithRelations = Prisma.AttendanceEntryGetPayload<{
  include: typeof attendanceInclude;
}>;

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDefaultWorkSchedule(tenantId: string, db: PrismaDb = this.prisma) {
    return db.workSchedule.findFirst({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findAttendancePolicy(tenantId: string, db: PrismaDb = this.prisma) {
    return db.attendancePolicy.findUnique({
      where: {
        tenantId,
      },
    });
  }

  upsertAttendancePolicy(
    tenantId: string,
    data: Prisma.AttendancePolicyUncheckedCreateInput,
    update: Prisma.AttendancePolicyUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendancePolicy.upsert({
      where: {
        tenantId,
      },
      create: data,
      update,
    });
  }

  findOfficeLocationById(
    tenantId: string,
    officeLocationId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.location.findFirst({
      where: {
        id: officeLocationId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        state: true,
        country: true,
        timezone: true,
      },
    });
  }

  listOfficeLocations(tenantId: string, db: PrismaDb = this.prisma) {
    return db.location.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        state: true,
        country: true,
        timezone: true,
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  findOpenAttendanceEntry(
    tenantId: string,
    employeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.findFirst({
      where: {
        tenantId,
        employeeId,
        checkIn: {
          not: null,
        },
        checkOut: null,
      },
      include: attendanceInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findAttendanceEntryByEmployeeAndDate(
    tenantId: string,
    employeeId: string,
    date: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.findFirst({
      where: {
        tenantId,
        employeeId,
        date,
      },
      include: attendanceInclude,
    });
  }

  findAttendanceEntryById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.findFirst({
      where: {
        tenantId,
        id,
      },
      include: attendanceInclude,
    });
  }

  async findAttendancePage(
    tenantId: string,
    query: AttendanceQueryDto,
    employeeFilter: Prisma.AttendanceEntryWhereInput,
    db: PrismaDb = this.prisma,
  ) {
    const where = buildAttendanceWhere(tenantId, query, employeeFilter);
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.attendanceEntry.findMany({
        where,
        include: attendanceInclude,
        orderBy: buildAttendanceOrderBy(query),
        skip,
        take: query.pageSize,
      }),
      db.attendanceEntry.count({ where }),
    ]);

    return { items, total };
  }

  findAttendanceForSummary(
    tenantId: string,
    query: AttendanceQueryDto,
    employeeFilter: Prisma.AttendanceEntryWhereInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.findMany({
      where: buildAttendanceWhere(tenantId, query, employeeFilter),
      include: attendanceInclude,
      orderBy: [{ date: 'asc' }, { checkIn: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createAttendanceEntry(
    data: Prisma.AttendanceEntryUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.create({
      data,
      include: attendanceInclude,
    });
  }

  async updateAttendanceEntry(
    tenantId: string,
    id: string,
    data: Prisma.AttendanceEntryUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    await db.attendanceEntry.updateMany({
      where: {
        tenantId,
        id,
      },
      data,
    });

    return this.findAttendanceEntryById(tenantId, id, db);
  }

  createImportBatch(
    data: Prisma.AttendanceImportBatchUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceImportBatch.create({ data });
  }

  updateImportBatch(
    tenantId: string,
    id: string,
    data: Prisma.AttendanceImportBatchUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceImportBatch.updateMany({
      where: {
        tenantId,
        id,
      },
      data,
    });
  }

  listAttendanceIntegrations(tenantId: string, db: PrismaDb = this.prisma) {
    return db.attendanceIntegrationConfig.findMany({
      where: {
        tenantId,
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findAttendanceIntegrationById(
    tenantId: string,
    integrationId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceIntegrationConfig.findFirst({
      where: {
        tenantId,
        id: integrationId,
      },
    });
  }

  createAttendanceIntegration(
    data: Prisma.AttendanceIntegrationConfigUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceIntegrationConfig.create({ data });
  }

  updateAttendanceIntegration(
    tenantId: string,
    integrationId: string,
    data: Prisma.AttendanceIntegrationConfigUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceIntegrationConfig.updateMany({
      where: {
        tenantId,
        id: integrationId,
      },
      data,
    });
  }
}

function buildAttendanceWhere(
  tenantId: string,
  query: AttendanceQueryDto,
  employeeFilter: Prisma.AttendanceEntryWhereInput,
): Prisma.AttendanceEntryWhereInput {
  const where: Prisma.AttendanceEntryWhereInput = {
    tenantId,
    ...employeeFilter,
  };

  if (query.search?.trim()) {
    const search = query.search.trim();
    where.OR = [
      {
        employee: {
          employeeCode: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          firstName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          lastName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          preferredName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.attendanceMode) {
    where.attendanceMode = query.attendanceMode;
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.officeLocationId) {
    where.officeLocationId = query.officeLocationId;
  }

  if (query.departmentId) {
    where.employee = {
      is: {
        departmentId: query.departmentId,
      },
    };
  }

  if (query.dateFrom || query.dateTo) {
    where.date = {};

    if (query.dateFrom) {
      where.date.gte = normalizeDate(query.dateFrom, false);
    }

    if (query.dateTo) {
      where.date.lte = normalizeDate(query.dateTo, true);
    }
  }

  return where;
}

function buildAttendanceOrderBy(
  query: AttendanceQueryDto,
): Prisma.AttendanceEntryOrderByWithRelationInput[] {
  const direction = query.sortDirection ?? 'desc';

  switch (query.sortField) {
    case 'employeeName':
      return [
        { employee: { lastName: direction } },
        { employee: { firstName: direction } },
        { date: 'desc' },
      ];
    case 'checkIn':
      return [{ checkIn: direction }, { date: 'desc' }];
    case 'checkOut':
      return [{ checkOut: direction }, { date: 'desc' }];
    case 'status':
      return [{ status: direction }, { date: 'desc' }];
    case 'date':
    default:
      return [{ date: direction }, { createdAt: 'desc' }];
  }
}

function normalizeDate(value: string, endOfDay: boolean) {
  const date = new Date(value);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}
