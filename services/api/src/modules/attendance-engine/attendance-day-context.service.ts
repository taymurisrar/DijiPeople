import { Injectable } from '@nestjs/common';
import { Prisma, WorkWeekday } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceRepository } from '../attendance/attendance.repository';
import {
  addUtcDays,
  businessDateAtUtcMidnight,
  formatBusinessDateKey,
  isOvernightShift,
  isWithinOvernightShiftCarryover,
  resolveShiftWindow,
  toWeekday,
} from '../attendance/attendance-time.util';
import { ConfigurationResolverService } from '../tenant-settings/configuration-resolver.service';

/**
 * Everything the reconciler needs to know about one employee-day, gathered once.
 *
 * THE ATTENDANCE DATE IS NOT THE CALENDAR DATE. Grouping punches by the
 * YYYY-MM-DD they carry breaks the moment a shift crosses midnight: a night
 * shift starting 20:55 on the 14th and ending 06:03 on the 15th is ONE work day,
 * and splitting it produces two half-days, a spurious missing checkout and a
 * spurious missing check-in. This service is the single place that mapping is
 * decided, for both the self-service path and the device path, so the two cannot
 * disagree about which day a punch belongs to.
 */

export interface EmploymentWindow {
  joinedAt: Date | null;
  exitedAt: Date | null;
  isActive: boolean;
}

export interface AttendanceDayContext {
  tenantId: string;
  employeeId: string;
  /** UTC midnight of the WORK day. */
  attendanceDate: Date;
  timezone: string;
  workScheduleId: string | null;
  shiftTemplateId: string | null;
  shift: {
    id: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    expectedHours: number;
    lateGraceMinutes: number;
    earlyExitGraceMinutes: number;
    isNightShift: boolean;
  } | null;
  /** Scheduled shift boundaries as UTC instants. Null when no shift applies. */
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  /** The window in which a punch belongs to this attendance date. */
  windowStartAt: Date;
  windowEndAt: Date;
  scheduledMinutes: number;
  isWorkingDay: boolean;
  isWeekend: boolean;
  holiday: { id: string; name: string } | null;
  employment: EmploymentWindow;
}

/**
 * How far past the scheduled end a punch may still close the day.
 *
 * Matches the carry-over the self-service path already uses, so a checkout at
 * 06:03 on a 21:00->06:00 shift lands on the shift's own day from either route.
 */
const CARRYOVER_HOURS = 12;

/**
 * How early a punch may arrive and still belong to the day. Someone arriving an
 * hour before a 09:00 shift is early, not attending yesterday.
 */
const PRE_SHIFT_HOURS = 6;

@Injectable()
export class AttendanceDayContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly configurationResolver: ConfigurationResolverService,
  ) {}

  /**
   * Builds the context for an employee on a given work date.
   *
   * Takes the attendance date as an argument rather than deriving it from the
   * current time: reconciliation must produce the same answer whether it runs
   * seconds or weeks after the punches, which is what makes recalculation safe.
   */
  async build(
    tenantId: string,
    employeeId: string,
    attendanceDate: Date,
  ): Promise<AttendanceDayContext | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, isDeleted: false },
      select: {
        id: true,
        businessUnitId: true,
        hireDate: true,
        terminationDate: true,
        employmentStatus: true,
      },
    });

    if (!employee) return null;

    const appContext = await this.configurationResolver.resolveAppContext({
      tenantId,
      businessUnitId: employee.businessUnitId,
      employeeId,
      module: 'attendance',
      effectiveDate: attendanceDate,
    });

    const normalizedDate = businessDateAtUtcMidnight(attendanceDate, 'UTC');
    const weekday = toWeekday(normalizedDate);

    const configuration =
      await this.attendanceRepository.resolveEmployeeWorkConfiguration(
        tenantId,
        employeeId,
        normalizedDate,
        weekday,
      );

    const workSchedule = configuration?.workSchedule ?? null;
    const scheduleDay = configuration?.scheduleDay ?? null;

    // An inactive or archived shift template is treated as no shift rather than
    // used anyway: an administrator retiring a shift should not silently keep
    // grading attendance against it.
    const shiftTemplate =
      scheduleDay?.isWorkingDay &&
      scheduleDay.shiftTemplate?.isActive &&
      scheduleDay.shiftTemplate.status === 'ACTIVE'
        ? scheduleDay.shiftTemplate
        : null;

    const isWorkingDay = scheduleDay
      ? scheduleDay.isWorkingDay
      : Boolean(workSchedule?.weeklyWorkDays.includes(weekday));

    // THE SHIFT'S OWN ZONE DECIDES ITS WINDOW.
    //
    // "The shift starts at 08:00" means 08:00 where the work happens. Resolving
    // it in the tenant's timezone puts the window in the wrong place for every
    // employee who does not work in the tenant's home zone — a Doha site under a
    // Karachi tenant would show every arrival two hours late. ShiftTemplate and
    // WorkSchedule each carry a timezone for exactly this reason, so the most
    // specific one wins and the app context is the fallback.
    const timezone =
      shiftTemplate?.timezone ?? workSchedule?.timezone ?? appContext.timezone;

    const shift = shiftTemplate
      ? {
          id: shiftTemplate.id,
          startTime: shiftTemplate.startTime,
          endTime: shiftTemplate.endTime,
          breakMinutes: shiftTemplate.breakMinutes,
          expectedHours: Number(shiftTemplate.expectedHours),
          lateGraceMinutes: shiftTemplate.lateGraceMinutes,
          earlyExitGraceMinutes: shiftTemplate.earlyExitGraceMinutes,
          isNightShift: shiftTemplate.isNightShift,
        }
      : null;

    const window = shift
      ? resolveShiftWindow(normalizedDate, shift, timezone)
      : null;

    const holiday =
      configuration?.holidayCalendarId && configuration.employee
        ? await this.attendanceRepository.findHolidayForEmployeeDate(
            tenantId,
            configuration.holidayCalendarId,
            normalizedDate,
            configuration.employee.departmentId,
            configuration.employee.locationId,
          )
        : null;

    const { windowStartAt, windowEndAt } = this.resolveEventWindow(
      normalizedDate,
      window,
      timezone,
    );

    return {
      tenantId,
      employeeId,
      attendanceDate: normalizedDate,
      timezone,
      workScheduleId: workSchedule?.id ?? null,
      shiftTemplateId: shift?.id ?? null,
      shift,
      shiftStartAt: window?.startAt ?? null,
      shiftEndAt: window?.endAt ?? null,
      windowStartAt,
      windowEndAt,
      scheduledMinutes: this.resolveScheduledMinutes(
        shift,
        scheduleDay,
        isWorkingDay,
      ),
      isWorkingDay,
      isWeekend: this.isWeekend(weekday, workSchedule?.weeklyWorkDays ?? null),
      holiday: holiday ? { id: holiday.id, name: holiday.name } : null,
      employment: {
        joinedAt: employee.hireDate,
        exitedAt: employee.terminationDate,
        isActive: employee.employmentStatus === 'ACTIVE',
      },
    };
  }

  /**
   * Works out which attendance date an instant belongs to.
   *
   * Checks the PREVIOUS day's shift first, because that is the only case where
   * the answer differs from the calendar date: an instant at 02:00 may be the
   * tail of yesterday's night shift or the very early start of today's day
   * shift, and the previous day's shift window is what distinguishes them.
   */
  async resolveAttendanceDateFor(
    tenantId: string,
    employeeId: string,
    instant: Date,
    timezone: string,
  ): Promise<Date> {
    const calendarDate = businessDateAtUtcMidnight(instant, timezone);
    const previousDate = addUtcDays(calendarDate, -1);

    const previous =
      await this.attendanceRepository.resolveEmployeeWorkConfiguration(
        tenantId,
        employeeId,
        previousDate,
        toWeekday(previousDate),
      );

    const previousShift =
      previous?.scheduleDay?.isWorkingDay &&
      previous.scheduleDay.shiftTemplate?.isActive &&
      previous.scheduleDay.shiftTemplate.status === 'ACTIVE'
        ? previous.scheduleDay.shiftTemplate
        : null;

    if (
      previousShift &&
      isOvernightShift(previousShift) &&
      isWithinOvernightShiftCarryover(
        instant,
        previousDate,
        previousShift,
        timezone,
      )
    ) {
      return previousDate;
    }

    return calendarDate;
  }

  /**
   * The window in which a punch counts towards this attendance date.
   *
   * With a shift, it is the shift window widened by a pre-shift head and a
   * post-shift tail, so early arrivals and late departures land on the right
   * day. Without one — an unscheduled day, a tenant with no shifts configured —
   * it falls back to the calendar day in the employee's zone, which is the only
   * meaningful grouping available.
   */
  private resolveEventWindow(
    attendanceDate: Date,
    shiftWindow: { startAt: Date; endAt: Date } | null,
    timezone: string,
  ): { windowStartAt: Date; windowEndAt: Date } {
    if (!shiftWindow) {
      const dayStart = this.zonedDayStart(attendanceDate, timezone);
      return {
        windowStartAt: dayStart,
        windowEndAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
      };
    }

    return {
      windowStartAt: new Date(
        shiftWindow.startAt.getTime() - PRE_SHIFT_HOURS * 60 * 60 * 1000,
      ),
      windowEndAt: new Date(
        shiftWindow.endAt.getTime() + CARRYOVER_HOURS * 60 * 60 * 1000,
      ),
    };
  }

  /** Midnight of a business date, as an instant in the employee's zone. */
  private zonedDayStart(attendanceDate: Date, timezone: string): Date {
    const key = formatBusinessDateKey(attendanceDate);
    const [year, month, day] = key.split('-').map(Number);
    const guess = Date.UTC(year, month - 1, day);
    let candidate = new Date(guess);

    for (let iteration = 0; iteration < 2; iteration += 1) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(candidate);
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
      const represented = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
      );
      candidate = new Date(candidate.getTime() + guess - represented);
    }

    return candidate;
  }

  /**
   * Minutes the employee was scheduled to work.
   *
   * Prefers the shift's declared expected hours over start-to-end arithmetic:
   * expectedHours is what the business agreed, and it already accounts for
   * unpaid breaks rather than counting them as scheduled work.
   */
  private resolveScheduledMinutes(
    shift: { expectedHours: number; breakMinutes: number } | null,
    scheduleDay: { expectedHours: Prisma.Decimal | null } | null,
    isWorkingDay: boolean,
  ): number {
    if (!isWorkingDay) return 0;

    if (shift?.expectedHours) {
      return Math.round(shift.expectedHours * 60);
    }

    if (scheduleDay?.expectedHours) {
      return Math.round(Number(scheduleDay.expectedHours) * 60);
    }

    return 0;
  }

  /**
   * Whether a weekday is outside the schedule's working week.
   *
   * Derived from the configured week, never from a hard-coded Saturday/Sunday:
   * the working week is Sunday to Thursday across much of the region DijiPeople
   * serves.
   */
  private isWeekend(
    weekday: WorkWeekday,
    weeklyWorkDays: WorkWeekday[] | null,
  ): boolean {
    if (!weeklyWorkDays || weeklyWorkDays.length === 0) return false;
    return !weeklyWorkDays.includes(weekday);
  }
}
