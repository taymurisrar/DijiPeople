import { Injectable } from '@nestjs/common';
import {
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceMode,
  Prisma,
  WorkWeekday,
} from '@prisma/client';
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
      location: {
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
  shiftTemplate: {
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      expectedHours: true,
      lateGraceMinutes: true,
      earlyExitGraceMinutes: true,
      isNightShift: true,
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

  findEmployeeWorkSchedule(
    tenantId: string,
    employeeId: string,
    effectiveDate: Date,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeScheduleAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isActive: true,
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
        workSchedule: { isActive: true, status: 'ACTIVE' },
      },
      include: { workSchedule: true },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findWorkScheduleById(
    tenantId: string,
    workScheduleId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.workSchedule.findFirst({
      where: { tenantId, id: workScheduleId, isActive: true },
    });
  }

  findResolvedShiftTemplate(
    tenantId: string,
    workScheduleId?: string | null,
    dayOfWeek?: WorkWeekday,
    db: PrismaDb = this.prisma,
  ) {
    return db.shiftTemplate.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        isActive: true,
        ...(workScheduleId
          ? {
              OR: [
                {
                  scheduleDays: {
                    some: {
                      workScheduleId,
                      ...(dayOfWeek ? { dayOfWeek } : {}),
                      isWorkingDay: true,
                    },
                  },
                },
                { workScheduleId },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async resolveEmployeeWorkConfiguration(
    tenantId: string,
    employeeId: string,
    effectiveDate: Date,
    dayOfWeek: WorkWeekday,
    db: PrismaDb = this.prisma,
  ) {
    const employee = await db.employee.findFirst({
      where: { tenantId, id: employeeId, isDeleted: false },
      select: {
        id: true,
        businessUnitId: true,
        departmentId: true,
        locationId: true,
        defaultWorkScheduleId: true,
        department: { select: { defaultWorkScheduleId: true } },
        location: {
          select: {
            defaultWorkScheduleId: true,
            holidayCalendarId: true,
          },
        },
      },
    });
    if (!employee) return null;

    const override = await db.employeeScheduleAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isActive: true,
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
        workSchedule: {
          isActive: true,
          status: 'ACTIVE',
          OR: [
            { effectiveStartDate: null },
            { effectiveStartDate: { lte: effectiveDate } },
          ],
          AND: [
            {
              OR: [
                { effectiveEndDate: null },
                { effectiveEndDate: { gte: effectiveDate } },
              ],
            },
          ],
        },
      },
      select: { workScheduleId: true },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const candidates = [
      { id: override?.workScheduleId, source: 'EMPLOYEE_OVERRIDE' },
      { id: employee.defaultWorkScheduleId, source: 'EMPLOYEE_DEFAULT' },
      {
        id: employee.department?.defaultWorkScheduleId,
        source: 'DEPARTMENT_DEFAULT',
      },
      {
        id: employee.location?.defaultWorkScheduleId,
        source: 'WORK_SITE_DEFAULT',
      },
    ].filter((candidate): candidate is { id: string; source: string } =>
      Boolean(candidate.id),
    );

    const findActiveSchedule = (workScheduleId: string) =>
      db.workSchedule.findFirst({
        where: {
          tenantId,
          id: workScheduleId,
          isActive: true,
          status: 'ACTIVE',
          OR: [
            { effectiveStartDate: null },
            { effectiveStartDate: { lte: effectiveDate } },
          ],
          AND: [
            {
              OR: [
                { effectiveEndDate: null },
                { effectiveEndDate: { gte: effectiveDate } },
              ],
            },
          ],
        },
        include: {
          days: {
            where: { dayOfWeek },
            include: { shiftTemplate: true },
          },
        },
      });

    let source = 'TENANT_DEFAULT';
    let workSchedule: Awaited<ReturnType<typeof findActiveSchedule>> = null;
    for (const candidate of candidates) {
      workSchedule = await findActiveSchedule(candidate.id);
      if (workSchedule) {
        source = candidate.source;
        break;
      }
    }

    workSchedule ??= await db.workSchedule.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
        status: 'ACTIVE',
        OR: [
          { effectiveStartDate: null },
          { effectiveStartDate: { lte: effectiveDate } },
        ],
        AND: [
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: effectiveDate } },
            ],
          },
        ],
      },
      include: {
        days: {
          where: { dayOfWeek },
          include: { shiftTemplate: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return {
      employee,
      source,
      workSchedule,
      scheduleDay: workSchedule?.days[0] ?? null,
      holidayCalendarId:
        employee.location?.holidayCalendarId ??
        workSchedule?.holidayCalendarId ??
        null,
    };
  }

  findHolidayForEmployeeDate(
    tenantId: string,
    holidayCalendarId: string,
    attendanceDate: Date,
    departmentId?: string | null,
    locationId?: string | null,
    db: PrismaDb = this.prisma,
  ) {
    return db.holiday.findFirst({
      where: {
        tenantId,
        holidayCalendarId,
        holidayDate: attendanceDate,
        isActive: true,
        status: 'ACTIVE',
        OR: [
          { scopeType: 'TENANT' },
          ...(departmentId
            ? [{ scopeType: 'DEPARTMENT' as const, departmentId }]
            : []),
          ...(locationId
            ? [{ scopeType: 'WORK_SITE' as const, locationId }]
            : []),
        ],
      },
      select: { id: true, name: true, isPaid: true, isHalfDay: true },
    });
  }

  findShiftTemplateById(
    tenantId: string,
    shiftTemplateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.shiftTemplate.findFirst({
      where: {
        tenantId,
        id: shiftTemplateId,
        status: 'ACTIVE',
        isActive: true,
      },
    });
  }

  listShiftTemplates(tenantId: string, db: PrismaDb = this.prisma) {
    return db.shiftTemplate.findMany({
      where: { tenantId, status: 'ACTIVE', isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        timezone: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        expectedHours: true,
        lateGraceMinutes: true,
        earlyExitGraceMinutes: true,
        isNightShift: true,
        isActive: true,
        workScheduleId: true,
      },
      orderBy: [{ name: 'asc' }],
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

  findEmployeeIdByUserId(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        tenantId,
        userId,
        isDeleted: false,
      },
      select: { id: true },
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

  deleteAttendanceEntry(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.attendanceEntry.deleteMany({
      where: {
        tenantId,
        id,
      },
    });
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

  if (query.employeeFilter?.trim()) {
    const employeeFilter = query.employeeFilter.trim();
    where.AND = [
      ...normalizeAnd(where.AND),
      {
        OR: [
          {
            employee: {
              employeeCode: {
                contains: employeeFilter,
                mode: 'insensitive',
              },
            },
          },
          {
            employee: {
              firstName: {
                contains: employeeFilter,
                mode: 'insensitive',
              },
            },
          },
          {
            employee: {
              lastName: {
                contains: employeeFilter,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.statusFilter) {
    const statuses = query.statusFilter
      .split(',')
      .map((status) => status.trim())
      .filter(isAttendanceStatus);

    if (statuses.length > 0) {
      where.status = { in: statuses };
    }
  }

  if (query.attendanceMode) {
    where.attendanceMode = query.attendanceMode;
  }

  if (query.attendanceModeFilter) {
    const modes = query.attendanceModeFilter
      .split(',')
      .map((mode) => mode.trim())
      .filter(isAttendanceMode);

    if (modes.length > 0) {
      where.attendanceMode = { in: modes };
    }
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.sourceFilter?.trim()) {
    const sources = query.sourceFilter
      .split(',')
      .map((source) => source.trim())
      .filter(isAttendanceSource);

    if (sources.length > 0) {
      where.source = { in: sources };
    }
  }

  if (query.officeLocationId) {
    where.officeLocationId = query.officeLocationId;
  }

  if (query.locationFilter?.trim()) {
    const locationFilter = query.locationFilter.trim();
    where.AND = [
      ...normalizeAnd(where.AND),
      {
        OR: [
          {
            officeLocation: {
              name: {
                contains: locationFilter,
                mode: 'insensitive',
              },
            },
          },
          {
            remoteAddressText: {
              contains: locationFilter,
              mode: 'insensitive',
            },
          },
        ],
      },
    ];
  }

  if (query.detailsFilter?.trim()) {
    const detailsFilter = query.detailsFilter.trim();
    where.AND = [
      ...normalizeAnd(where.AND),
      {
        OR: [
          { notes: { contains: detailsFilter, mode: 'insensitive' } },
          { checkInNote: { contains: detailsFilter, mode: 'insensitive' } },
          { checkOutNote: { contains: detailsFilter, mode: 'insensitive' } },
          { workSummary: { contains: detailsFilter, mode: 'insensitive' } },
        ],
      },
    ];
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

  if (query.attendanceDateFilter?.trim()) {
    const operator = query.attendanceDateFilterOperator ?? 'equals';
    const value = query.attendanceDateFilter;

    if (operator === 'between' && query.attendanceDateFilterTo) {
      where.date = {
        gte: normalizeDate(value, false),
        lte: normalizeDate(query.attendanceDateFilterTo, true),
      };
    } else if (operator === 'before') {
      where.date = { lte: normalizeDate(value, true) };
    } else if (operator === 'after') {
      where.date = { gte: normalizeDate(value, false) };
    } else {
      where.date = {
        gte: normalizeDate(value, false),
        lte: normalizeDate(value, true),
      };
    }
  }

  return where;
}

function buildAttendanceOrderBy(
  query: AttendanceQueryDto,
): Prisma.AttendanceEntryOrderByWithRelationInput[] {
  const parsedOrderBy = parseDataTableOrderBy(query.orderBy);
  if (parsedOrderBy) {
    return parsedOrderBy;
  }

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

function parseDataTableOrderBy(
  value?: string,
): Prisma.AttendanceEntryOrderByWithRelationInput[] | null {
  if (!value?.trim()) {
    return null;
  }

  const [field, rawDirection] = value.trim().split(/\s+/);
  const direction = rawDirection === 'asc' ? 'asc' : 'desc';

  switch (field) {
    case 'employeeId':
      return [
        { employee: { lastName: direction } },
        { employee: { firstName: direction } },
      ];
    case 'attendanceDate':
      return [{ date: direction }, { createdAt: 'desc' }];
    case 'attendanceMode':
      return [{ attendanceMode: direction }, { date: 'desc' }];
    case 'checkInAt':
      return [{ checkIn: direction }, { date: 'desc' }];
    case 'checkOutAt':
      return [{ checkOut: direction }, { date: 'desc' }];
    case 'durationMinutes':
      return [{ checkOut: direction }, { checkIn: direction }];
    case 'status':
      return [{ status: direction }, { date: 'desc' }];
    case 'officeLocationId':
      return [{ officeLocation: { name: direction } }, { date: 'desc' }];
    case 'source':
      return [{ source: direction }, { date: 'desc' }];
    case 'createdAt':
      return [{ createdAt: direction }];
    case 'updatedAt':
      return [{ updatedAt: direction }];
    default:
      return null;
  }
}

function normalizeAnd(
  value: Prisma.AttendanceEntryWhereInput['AND'],
): Prisma.AttendanceEntryWhereInput[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isAttendanceStatus(value: string): value is AttendanceEntryStatus {
  return Object.values(AttendanceEntryStatus).includes(
    value as AttendanceEntryStatus,
  );
}

function isAttendanceMode(value: string): value is AttendanceMode {
  return Object.values(AttendanceMode).includes(value as AttendanceMode);
}

function isAttendanceSource(value: string): value is AttendanceEntrySource {
  return Object.values(AttendanceEntrySource).includes(
    value as AttendanceEntrySource,
  );
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
