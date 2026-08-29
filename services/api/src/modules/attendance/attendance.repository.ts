import { Injectable } from '@nestjs/common';
import {
  calendarCandidates,
  organizationalScopes,
  scheduleCandidates,
  type EmployeeHierarchy,
  type WorkConfigurationSource,
} from './work-configuration-hierarchy';
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

/**
 * What the work calendar says about one employee on one date.
 *
 * `isOffDay` mirrors the self-service context deliberately: an employee with no
 * work schedule at all is not off, because nothing has said so.
 */
export interface EmployeeWorkDayResolution {
  readonly employeeId: string;
  readonly hasWorkSchedule: boolean;
  readonly isOffDay: boolean;
  readonly holiday: { id: string; name: string } | null;
}

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

  /**
   * The work schedule and work calendar that apply to an employee on a date.
   *
   * PRECEDENCE runs down the organizational hierarchy, most specific first:
   *
   *   Employee assignment -> Employee default -> Team -> Department
   *   -> Business Unit scope -> Organization scope -> Tenant default
   *
   * THE WORK SITE IS NOT CONSULTED. It used to sit between Department and the
   * tenant default, which meant one Karachi office imposed a single pattern on
   * a Finance team working 09:00-18:00 and a Support team on a 24/7 rotation.
   * A Work Site is a physical place; who works when is an organizational fact.
   * `Location.defaultWorkScheduleId` and `Location.holidayCalendarId` still
   * exist so tenant data is preserved, but nothing here reads them.
   *
   * The order itself lives in `work-configuration-hierarchy.ts` so it can be
   * asserted without a database, and so the schedule and the calendar cannot
   * drift into two different orders.
   */
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
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
        locationId: true,
        defaultWorkScheduleId: true,
        holidayCalendarId: true,
        team: {
          select: { defaultWorkScheduleId: true, holidayCalendarId: true },
        },
        department: {
          select: { defaultWorkScheduleId: true, holidayCalendarId: true },
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

    const hierarchy: EmployeeHierarchy = {
      teamId: employee.teamId,
      departmentId: employee.departmentId,
      businessUnitId: employee.businessUnitId,
      organizationId: employee.organizationId,
    };
    const effectiveWindow = {
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
    };

    const findActiveSchedule = (workScheduleId: string) =>
      db.workSchedule.findFirst({
        where: {
          tenantId,
          id: workScheduleId,
          isActive: true,
          status: 'ACTIVE',
          ...effectiveWindow,
        },
        include: {
          days: { where: { dayOfWeek }, include: { shiftTemplate: true } },
        },
      });

    let source: WorkConfigurationSource = 'TENANT_DEFAULT';
    let workSchedule: Awaited<ReturnType<typeof findActiveSchedule>> = null;

    for (const candidate of scheduleCandidates({
      assignmentScheduleId: override?.workScheduleId,
      employeeScheduleId: employee.defaultWorkScheduleId,
      teamScheduleId: employee.team?.defaultWorkScheduleId,
      departmentScheduleId: employee.department?.defaultWorkScheduleId,
    })) {
      workSchedule = await findActiveSchedule(candidate.id);
      if (workSchedule) {
        source = candidate.source;
        break;
      }
    }

    /*
     * Business Unit and Organization carry no schedule pointer of their own.
     * They are resolved from the schedule's own scope columns, which the model
     * already has - a second pointer saying the same thing would be a second
     * source of truth. `isDefault` breaks a tie within a scope so two schedules
     * scoped to the same unit resolve deterministically.
     */
    if (!workSchedule) {
      for (const scope of organizationalScopes(hierarchy)) {
        workSchedule = await db.workSchedule.findFirst({
          where: {
            tenantId,
            isActive: true,
            status: 'ACTIVE',
            ...(scope.businessUnitId
              ? { businessUnitId: scope.businessUnitId }
              : { businessUnitId: null, organizationId: scope.organizationId }),
            ...effectiveWindow,
          },
          include: {
            days: { where: { dayOfWeek }, include: { shiftTemplate: true } },
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
        if (workSchedule) {
          source = scope.source;
          break;
        }
      }
    }

    workSchedule ??= await db.workSchedule.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
        status: 'ACTIVE',
        ...effectiveWindow,
      },
      include: {
        days: { where: { dayOfWeek }, include: { shiftTemplate: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const calendar = await this.resolveEmployeeHolidayCalendarId(
      tenantId,
      {
        employeeCalendarId: employee.holidayCalendarId,
        teamCalendarId: employee.team?.holidayCalendarId,
        departmentCalendarId: employee.department?.holidayCalendarId,
      },
      hierarchy,
      workSchedule?.holidayCalendarId ?? null,
      effectiveDate,
      db,
    );

    return {
      employee,
      source,
      workSchedule,
      scheduleDay: workSchedule?.days[0] ?? null,
      holidayCalendarId: calendar.holidayCalendarId,
      holidayCalendarSource: calendar.source,
    };
  }

  /**
   * The same resolution as above, for a whole population, in five queries.
   *
   * WHY THIS EXISTS. Anything that has to answer "who was expected to work
   * today" - the dashboard's absent count and its attendance exception row
   * being the first - needs the schedule for every employee in scope at once.
   * `resolveEmployeeWorkConfiguration` answers for one employee in up to eight
   * round trips, so calling it per head turns the landing screen of a
   * thousand-person tenant into thousands of queries. Before this method
   * existed the calculation simply did not consult the calendar at all, and
   * counted the entire workforce absent every weekend (BUG-2008).
   *
   * THE PRECEDENCE IS NOT RESTATED HERE. The order comes from
   * `work-configuration-hierarchy.ts`, the same module the single-employee
   * resolver uses, so the two cannot disagree about who wins. What is
   * duplicated is only the shape of the queries: this method loads every
   * candidate schedule and calendar for the tenant once and then picks in
   * memory, instead of asking the database once per candidate. If you change a
   * predicate in `resolveEmployeeWorkConfiguration`, change it here too.
   *
   * NO SHIFT TEMPLATES ARE LOADED. Whether the day is worked at all is decided
   * by `WorkScheduleDay.isWorkingDay` and the schedule's `weeklyWorkDays`; the
   * shift only matters once someone is expected, so loading it here would cost
   * a join nothing reads.
   */
  async resolveWorkDayForEmployees(
    tenantId: string,
    employeeWhere: Prisma.EmployeeWhereInput,
    effectiveDate: Date,
    dayOfWeek: WorkWeekday,
    db: PrismaDb = this.prisma,
  ): Promise<Map<string, EmployeeWorkDayResolution>> {
    const employees = await db.employee.findMany({
      where: { ...employeeWhere, tenantId, isDeleted: false },
      select: {
        id: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
        locationId: true,
        defaultWorkScheduleId: true,
        holidayCalendarId: true,
        team: {
          select: { defaultWorkScheduleId: true, holidayCalendarId: true },
        },
        department: {
          select: { defaultWorkScheduleId: true, holidayCalendarId: true },
        },
      },
    });

    const resolutions = new Map<string, EmployeeWorkDayResolution>();
    if (employees.length === 0) return resolutions;

    const employeeIds = employees.map((employee) => employee.id);
    const effectiveWindow = {
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
    };

    const [assignments, schedules, calendars] = await Promise.all([
      db.employeeScheduleAssignment.findMany({
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          isActive: true,
          effectiveFrom: { lte: effectiveDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
          workSchedule: {
            isActive: true,
            status: 'ACTIVE',
            ...effectiveWindow,
          },
        },
        select: { employeeId: true, workScheduleId: true },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
      db.workSchedule.findMany({
        where: {
          tenantId,
          isActive: true,
          status: 'ACTIVE',
          ...effectiveWindow,
        },
        select: {
          id: true,
          isDefault: true,
          businessUnitId: true,
          organizationId: true,
          holidayCalendarId: true,
          weeklyWorkDays: true,
          days: {
            where: { dayOfWeek },
            select: { isWorkingDay: true },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      db.holidayCalendar.findMany({
        where: { tenantId, status: 'ACTIVE', ...effectiveWindow },
        select: {
          id: true,
          isDefault: true,
          businessUnitId: true,
          organizationId: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);

    /* First row wins: the query is already ordered most-recent-first. */
    const assignmentByEmployee = new Map<string, string>();
    for (const assignment of assignments) {
      if (!assignmentByEmployee.has(assignment.employeeId)) {
        assignmentByEmployee.set(
          assignment.employeeId,
          assignment.workScheduleId,
        );
      }
    }

    const scheduleById = new Map(
      schedules.map((schedule) => [schedule.id, schedule]),
    );
    const calendarById = new Map(
      calendars.map((calendar) => [calendar.id, calendar]),
    );

    const resolvedCalendarIdByEmployee = new Map<string, string>();
    const workScheduleByEmployee = new Map<
      string,
      (typeof schedules)[number] | null
    >();

    for (const employee of employees) {
      const hierarchy: EmployeeHierarchy = {
        teamId: employee.teamId,
        departmentId: employee.departmentId,
        businessUnitId: employee.businessUnitId,
        organizationId: employee.organizationId,
      };

      let workSchedule: (typeof schedules)[number] | null = null;

      for (const candidate of scheduleCandidates({
        assignmentScheduleId: assignmentByEmployee.get(employee.id),
        employeeScheduleId: employee.defaultWorkScheduleId,
        teamScheduleId: employee.team?.defaultWorkScheduleId,
        departmentScheduleId: employee.department?.defaultWorkScheduleId,
      })) {
        const found = scheduleById.get(candidate.id);
        if (found) {
          workSchedule = found;
          break;
        }
      }

      if (!workSchedule) {
        for (const scope of organizationalScopes(hierarchy)) {
          const scoped = schedules.find((schedule) =>
            scope.businessUnitId
              ? schedule.businessUnitId === scope.businessUnitId
              : schedule.businessUnitId === null &&
                schedule.organizationId === scope.organizationId,
          );
          if (scoped) {
            workSchedule = scoped;
            break;
          }
        }
      }

      workSchedule ??=
        schedules.find((schedule) => schedule.isDefault) ?? null;

      workScheduleByEmployee.set(employee.id, workSchedule);

      let holidayCalendarId: string | null = null;

      for (const candidate of calendarCandidates({
        employeeCalendarId: employee.holidayCalendarId,
        teamCalendarId: employee.team?.holidayCalendarId,
        departmentCalendarId: employee.department?.holidayCalendarId,
      })) {
        if (calendarById.has(candidate.id)) {
          holidayCalendarId = candidate.id;
          break;
        }
      }

      if (!holidayCalendarId) {
        for (const scope of organizationalScopes(hierarchy)) {
          const scoped = calendars.find((calendar) =>
            scope.businessUnitId
              ? calendar.businessUnitId === scope.businessUnitId
              : calendar.businessUnitId === null &&
                calendar.organizationId === scope.organizationId,
          );
          if (scoped) {
            holidayCalendarId = scoped.id;
            break;
          }
        }
      }

      if (
        !holidayCalendarId &&
        workSchedule?.holidayCalendarId &&
        calendarById.has(workSchedule.holidayCalendarId)
      ) {
        holidayCalendarId = workSchedule.holidayCalendarId;
      }

      holidayCalendarId ??=
        calendars.find((calendar) => calendar.isDefault)?.id ?? null;

      if (holidayCalendarId) {
        resolvedCalendarIdByEmployee.set(employee.id, holidayCalendarId);
      }
    }

    const holidayCalendarIds = [
      ...new Set(resolvedCalendarIdByEmployee.values()),
    ];
    const holidays = holidayCalendarIds.length
      ? await db.holiday.findMany({
          where: {
            tenantId,
            holidayCalendarId: { in: holidayCalendarIds },
            holidayDate: effectiveDate,
            isActive: true,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            name: true,
            scopeType: true,
            departmentId: true,
            locationId: true,
            holidayCalendarId: true,
          },
        })
      : [];

    for (const employee of employees) {
      const workSchedule = workScheduleByEmployee.get(employee.id) ?? null;
      const scheduleDay = workSchedule?.days[0] ?? null;
      /*
       * Identical to the self-service path: an explicit day row wins, the
       * schedule's weekly pattern answers when there is no row for the day, and
       * an employee with no schedule at all is NOT treated as off - nothing has
       * said they do not work, and guessing "off" would silently excuse them.
       */
      const isWorkingDay = scheduleDay
        ? scheduleDay.isWorkingDay
        : Boolean(workSchedule?.weeklyWorkDays.includes(dayOfWeek));
      const holidayCalendarId =
        resolvedCalendarIdByEmployee.get(employee.id) ?? null;
      const holiday =
        holidays.find(
          (candidate) =>
            candidate.holidayCalendarId === holidayCalendarId &&
            (candidate.scopeType === 'TENANT' ||
              (candidate.scopeType === 'DEPARTMENT' &&
                candidate.departmentId !== null &&
                candidate.departmentId === employee.departmentId) ||
              (candidate.scopeType === 'WORK_SITE' &&
                candidate.locationId !== null &&
                candidate.locationId === employee.locationId)),
        ) ?? null;

      resolutions.set(employee.id, {
        employeeId: employee.id,
        hasWorkSchedule: Boolean(workSchedule),
        isOffDay: Boolean(workSchedule && !isWorkingDay),
        holiday: holiday ? { id: holiday.id, name: holiday.name } : null,
      });
    }

    return resolutions;
  }

  /**
   * The work calendar that applies to an employee, by the same precedence.
   *
   * The Work Site is deliberately absent: it used to win outright, so a Karachi
   * office forced its Pakistan calendar onto an employee who follows a UAE one.
   *
   * The owning schedule's calendar sits below every organizational layer but
   * above the tenant default - a schedule naming a calendar describes the
   * pattern it belongs to, which is more specific than "whatever the tenant
   * uses" and less specific than a statement made about this person.
   */
  private async resolveEmployeeHolidayCalendarId(
    tenantId: string,
    assigned: {
      employeeCalendarId?: string | null;
      teamCalendarId?: string | null;
      departmentCalendarId?: string | null;
    },
    hierarchy: EmployeeHierarchy,
    workScheduleCalendarId: string | null,
    effectiveDate: Date,
    db: PrismaDb,
  ): Promise<{
    holidayCalendarId: string | null;
    source: WorkConfigurationSource | null;
  }> {
    const effectiveWindow = {
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
    };

    const findActiveCalendar = (holidayCalendarId: string) =>
      db.holidayCalendar.findFirst({
        where: {
          tenantId,
          id: holidayCalendarId,
          status: 'ACTIVE',
          ...effectiveWindow,
        },
        select: { id: true },
      });

    for (const candidate of calendarCandidates(assigned)) {
      const found = await findActiveCalendar(candidate.id);
      if (found) {
        return { holidayCalendarId: found.id, source: candidate.source };
      }
    }

    for (const scope of organizationalScopes(hierarchy)) {
      const scoped = await db.holidayCalendar.findFirst({
        where: {
          tenantId,
          status: 'ACTIVE',
          ...(scope.businessUnitId
            ? { businessUnitId: scope.businessUnitId }
            : { businessUnitId: null, organizationId: scope.organizationId }),
          ...effectiveWindow,
        },
        select: { id: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (scoped) return { holidayCalendarId: scoped.id, source: scope.source };
    }

    if (workScheduleCalendarId) {
      const scheduleCalendar = await findActiveCalendar(workScheduleCalendarId);
      if (scheduleCalendar) {
        return {
          holidayCalendarId: scheduleCalendar.id,
          source: 'WORK_SCHEDULE_CALENDAR',
        };
      }
    }

    const tenantDefault = await db.holidayCalendar.findFirst({
      where: {
        tenantId,
        isDefault: true,
        status: 'ACTIVE',
        ...effectiveWindow,
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }],
    });

    return tenantDefault
      ? { holidayCalendarId: tenantDefault.id, source: 'TENANT_DEFAULT' }
      : { holidayCalendarId: null, source: null };
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

/**
 * Text filter shared by the attendance column filters.
 *
 * Mirrors the employee module so the conditions the shared table offers behave
 * the same everywhere instead of silently degrading to "contains".
 */
function buildAttendanceTextFilter(
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

/** Negated matches must hold for every column, not any one of them. */
function isNegatedAttendanceOperator(operator: string | undefined) {
  return operator === 'notContains' || operator === 'notEquals';
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
    const textFilter = buildAttendanceTextFilter(
      query.employeeFilter,
      query.employeeFilterOperator,
    );
    const clauses = [
      { employee: { employeeCode: textFilter } },
      { employee: { firstName: textFilter } },
      { employee: { lastName: textFilter } },
    ];

    where.AND = [
      ...normalizeAnd(where.AND),
      isNegatedAttendanceOperator(query.employeeFilterOperator)
        ? { AND: clauses }
        : { OR: clauses },
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
