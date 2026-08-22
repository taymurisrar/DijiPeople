import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfigurationStatus,
  ExchangeRateSource,
  HalfDayPeriod,
  HolidayType,
  HolidayScopeType,
  PayCycle,
  Prisma,
  WeekendPolicy,
  WorkWeekModel,
  WorkWeekday,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toDisplayString } from '../../common/utils/display-string';

type ScopeInput = {
  organizationId?: string | null;
  businessUnitId?: string | null;
  projectId?: string | null;
};

type DateRangeInput = {
  effectiveStartDate?: Date | null;
  effectiveEndDate?: Date | null;
};

type EffectiveDateRange = {
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
};

type ExchangeRateData = {
  fromCurrency: string;
  toCurrency: string;
  rate: Prisma.Decimal;
  effectiveDate: Date;
  effectiveEndDate: Date | null;
  source: ExchangeRateSource;
  isManual: boolean;
  lockedRate: boolean;
  provider: string | null;
  lastFetchedAt: Date | null;
  overrideReason: string | null;
  subStatus: string | null;
  description: string | null;
  status: ConfigurationStatus;
};

@Injectable()
export class EnterpriseConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listHolidayCalendars(tenantId: string, query: Record<string, unknown>) {
    const search = readString(query.search);
    const year = readNumber(query.year);
    const where: Prisma.HolidayCalendarWhereInput = { tenantId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { countryCode: { contains: search, mode: 'insensitive' } },
        { regionCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.holidayCalendar.findMany({
      where,
      include: {
        holidays: {
          where: year
            ? {
                holidayDate: {
                  gte: new Date(Date.UTC(year, 0, 1)),
                  lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
                },
              }
            : undefined,
          orderBy: [{ holidayDate: 'asc' }],
        },
        assignments: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getHolidayCalendar(tenantId: string, id: string) {
    return this.findHolidayCalendarOrThrow(tenantId, id);
  }

  async createHolidayCalendar(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const scope = readScope(body);
    const dateRange = readDateRange(body);
    validateDateRange(dateRange);
    await this.assertValidScopedReferences(currentUser.tenantId, scope);
    await this.assertNoOverlappingHolidayCalendar(currentUser.tenantId, {
      ...scope,
      ...dateRange,
      countryCode: normalizeCountryCode(body.countryCode),
      regionCode: readNullableString(body.regionCode),
      timezone: normalizeTimezone(body.timezone) ?? 'UTC',
      idToExclude: null,
    });

    try {
      const calendar = await this.prisma.holidayCalendar.create({
        data: {
          tenantId: currentUser.tenantId,
          ...scope,
          name: requiredString(body.name, 'Holiday calendar name is required.'),
          code: normalizeCode(body.code, body.name),
          description: readNullableString(body.description),
          timezone: normalizeTimezone(body.timezone) ?? 'UTC',
          countryCode: normalizeCountryCode(body.countryCode),
          regionCode: readNullableString(body.regionCode),
          weekendDays: readWeekdays(body.weekendDays) ?? [
            WorkWeekday.FRIDAY,
            WorkWeekday.SATURDAY,
          ],
          isDefault: readBoolean(body.isDefault) ?? false,
          status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
          effectiveStartDate: dateRange.effectiveStartDate,
          effectiveEndDate: dateRange.effectiveEndDate,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        include: { holidays: true, assignments: true },
      });

      await this.audit(
        currentUser,
        'holiday-calendar.create',
        'HolidayCalendar',
        calendar.id,
        null,
        calendar,
      );
      return calendar;
    } catch (error) {
      handleHolidayCalendarWriteError(error);
    }
  }

  async updateHolidayCalendar(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.findHolidayCalendarOrThrow(
      currentUser.tenantId,
      id,
    );
    const scope = readScopeWithFallback(body, existing);
    const dateRange = readDateRangeWithFallback(body, existing);
    validateDateRange(dateRange);
    await this.assertValidScopedReferences(currentUser.tenantId, scope);
    const countryCode =
      body.countryCode !== undefined
        ? normalizeCountryCode(body.countryCode)
        : existing.countryCode;
    const regionCode =
      body.regionCode !== undefined
        ? readNullableString(body.regionCode)
        : existing.regionCode;
    const timezone =
      body.timezone !== undefined
        ? (normalizeTimezone(body.timezone) ?? 'UTC')
        : existing.timezone;
    await this.assertNoOverlappingHolidayCalendar(currentUser.tenantId, {
      ...scope,
      ...dateRange,
      countryCode,
      regionCode,
      timezone,
      idToExclude: id,
    });

    try {
      const calendar = await this.prisma.holidayCalendar.update({
        where: { id },
        data: {
          ...(body.name !== undefined
            ? {
                name: requiredString(
                  body.name,
                  'Holiday calendar name is required.',
                ),
              }
            : {}),
          ...(body.code !== undefined
            ? { code: normalizeCode(body.code, body.name ?? existing.name) }
            : {}),
          ...(body.description !== undefined
            ? { description: readNullableString(body.description) }
            : {}),
          organizationId: scope.organizationId,
          businessUnitId: scope.businessUnitId,
          projectId: scope.projectId,
          ...(body.timezone !== undefined ? { timezone } : {}),
          ...(body.countryCode !== undefined ? { countryCode } : {}),
          ...(body.regionCode !== undefined ? { regionCode } : {}),
          ...(body.weekendDays !== undefined
            ? {
                weekendDays:
                  readWeekdays(body.weekendDays) ?? existing.weekendDays,
              }
            : {}),
          ...(body.isDefault !== undefined
            ? { isDefault: readBoolean(body.isDefault) ?? false }
            : {}),
          ...(body.status !== undefined
            ? { status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE' }
            : {}),
          effectiveStartDate: dateRange.effectiveStartDate,
          effectiveEndDate: dateRange.effectiveEndDate,
          updatedById: currentUser.userId,
        },
        include: { holidays: true, assignments: true },
      });

      await this.audit(
        currentUser,
        'holiday-calendar.update',
        'HolidayCalendar',
        id,
        existing,
        calendar,
      );
      return calendar;
    } catch (error) {
      handleHolidayCalendarWriteError(error);
    }
  }

  async deleteHolidayCalendar(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.findHolidayCalendarOrThrow(
      currentUser.tenantId,
      id,
    );
    await this.prisma.holidayCalendar.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'holiday-calendar.archive',
      'HolidayCalendar',
      id,
      existing,
      {
        ...existing,
        status: 'ARCHIVED',
      },
    );
    return { id, archived: true };
  }

  async listHolidays(
    tenantId: string,
    calendarId: string,
    query: Record<string, unknown>,
  ) {
    await this.findHolidayCalendarOrThrow(tenantId, calendarId);
    const year = readNumber(query.year);
    const search = readString(query.search);
    const where: Prisma.HolidayWhereInput = {
      tenantId,
      holidayCalendarId: calendarId,
    };

    if (year) {
      where.holidayDate = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.holiday.findMany({
      where,
      orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
    });
  }

  async createHoliday(
    currentUser: AuthenticatedUser,
    calendarId: string,
    body: Record<string, unknown>,
  ) {
    await this.findHolidayCalendarOrThrow(currentUser.tenantId, calendarId);
    const holidayDate = requiredDate(
      body.holidayDate,
      'Holiday date is required.',
    );
    await this.assertNoDuplicateHoliday(
      currentUser.tenantId,
      calendarId,
      requiredString(body.name, 'Holiday name is required.'),
      holidayDate,
      null,
    );
    await this.assertValidHolidayScope(currentUser.tenantId, body);

    const holiday = await this.prisma.holiday.create({
      data: {
        tenantId: currentUser.tenantId,
        holidayCalendarId: calendarId,
        name: requiredString(body.name, 'Holiday name is required.'),
        description: readNullableString(body.description),
        holidayDate,
        type: readEnum(body.type, HolidayType) ?? 'PUBLIC',
        scopeType:
          readEnum(body.scopeType, HolidayScopeType) ?? HolidayScopeType.TENANT,
        departmentId: readNullableString(body.departmentId),
        locationId: readNullableString(body.locationId),
        isPaid: readBoolean(body.isPaid) ?? true,
        isActive: readBoolean(body.isActive) ?? true,
        isRecurring: readBoolean(body.isRecurring) ?? false,
        recurrenceRule: readNullableString(body.recurrenceRule),
        isHalfDay: readBoolean(body.isHalfDay) ?? false,
        halfDayPeriod: readEnum(body.halfDayPeriod, HalfDayPeriod),
        appliesToAll: readBoolean(body.appliesToAll) ?? true,
        status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    await this.audit(
      currentUser,
      'holiday.create',
      'Holiday',
      holiday.id,
      null,
      holiday,
    );
    return holiday;
  }

  async updateHoliday(
    currentUser: AuthenticatedUser,
    calendarId: string,
    holidayId: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.findHolidayOrThrow(
      currentUser.tenantId,
      calendarId,
      holidayId,
    );
    const nextName =
      body.name !== undefined
        ? requiredString(body.name, 'Holiday name is required.')
        : existing.name;
    const nextDate =
      body.holidayDate !== undefined
        ? requiredDate(body.holidayDate, 'Holiday date is required.')
        : existing.holidayDate;
    await this.assertNoDuplicateHoliday(
      currentUser.tenantId,
      calendarId,
      nextName,
      nextDate,
      holidayId,
    );
    await this.assertValidHolidayScope(currentUser.tenantId, {
      scopeType: body.scopeType ?? existing.scopeType,
      departmentId: body.departmentId ?? existing.departmentId,
      locationId: body.locationId ?? existing.locationId,
    });

    const holiday = await this.prisma.holiday.update({
      where: { id: holidayId },
      data: {
        ...(body.name !== undefined ? { name: nextName } : {}),
        ...(body.description !== undefined
          ? { description: readNullableString(body.description) }
          : {}),
        ...(body.holidayDate !== undefined ? { holidayDate: nextDate } : {}),
        ...(body.type !== undefined
          ? { type: readEnum(body.type, HolidayType) ?? existing.type }
          : {}),
        ...(body.scopeType !== undefined
          ? {
              scopeType:
                readEnum(body.scopeType, HolidayScopeType) ??
                HolidayScopeType.TENANT,
            }
          : {}),
        ...(body.departmentId !== undefined
          ? { departmentId: readNullableString(body.departmentId) }
          : {}),
        ...(body.locationId !== undefined
          ? { locationId: readNullableString(body.locationId) }
          : {}),
        ...(body.isPaid !== undefined
          ? { isPaid: readBoolean(body.isPaid) ?? true }
          : {}),
        ...(body.isActive !== undefined
          ? { isActive: readBoolean(body.isActive) ?? true }
          : {}),
        ...(body.isRecurring !== undefined
          ? { isRecurring: readBoolean(body.isRecurring) ?? false }
          : {}),
        ...(body.recurrenceRule !== undefined
          ? { recurrenceRule: readNullableString(body.recurrenceRule) }
          : {}),
        ...(body.isHalfDay !== undefined
          ? { isHalfDay: readBoolean(body.isHalfDay) ?? false }
          : {}),
        ...(body.halfDayPeriod !== undefined
          ? { halfDayPeriod: readEnum(body.halfDayPeriod, HalfDayPeriod) }
          : {}),
        ...(body.appliesToAll !== undefined
          ? { appliesToAll: readBoolean(body.appliesToAll) ?? true }
          : {}),
        ...(body.status !== undefined
          ? {
              status:
                readEnum(body.status, ConfigurationStatus) ?? existing.status,
            }
          : {}),
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'holiday.update',
      'Holiday',
      holidayId,
      existing,
      holiday,
    );
    return holiday;
  }

  async deleteHoliday(
    currentUser: AuthenticatedUser,
    calendarId: string,
    holidayId: string,
  ) {
    const existing = await this.findHolidayOrThrow(
      currentUser.tenantId,
      calendarId,
      holidayId,
    );
    await this.prisma.holiday.update({
      where: { id: holidayId },
      data: { status: 'ARCHIVED', updatedById: currentUser.userId },
    });
    await this.audit(
      currentUser,
      'holiday.archive',
      'Holiday',
      holidayId,
      existing,
      {
        ...existing,
        status: 'ARCHIVED',
      },
    );
    return { id: holidayId, archived: true };
  }

  async upsertHolidayCalendarAssignment(
    currentUser: AuthenticatedUser,
    calendarId: string,
    body: Record<string, unknown>,
  ) {
    await this.findHolidayCalendarOrThrow(currentUser.tenantId, calendarId);
    const scope = readScope(body);
    if (!scope.organizationId && !scope.businessUnitId && !scope.projectId) {
      throw new BadRequestException(
        'Assignment must target an organization, business unit, or project.',
      );
    }
    await this.assertValidScopedReferences(currentUser.tenantId, scope);
    const dateRange = readDateRange(body);
    validateDateRange(dateRange);

    const assignment = await this.prisma.holidayCalendarAssignment.create({
      data: {
        tenantId: currentUser.tenantId,
        holidayCalendarId: calendarId,
        ...scope,
        isDefault: readBoolean(body.isDefault) ?? false,
        status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
        effectiveStartDate: dateRange.effectiveStartDate,
        effectiveEndDate: dateRange.effectiveEndDate,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'holiday-calendar.assign',
      'HolidayCalendarAssignment',
      assignment.id,
      null,
      assignment,
    );
    return assignment;
  }

  async listWorkSchedules(tenantId: string, query: Record<string, unknown>) {
    const search = readString(query.search);
    const schedules = await this.prisma.workSchedule.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        days: { orderBy: [{ sortOrder: 'asc' }] },
        shiftTemplates: true,
        holidayCalendar: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return schedules.map(withDefaultShiftTemplateId);
  }

  async getWorkSchedule(tenantId: string, id: string) {
    const schedule = await this.prisma.workSchedule.findFirst({
      where: { tenantId, id },
      include: {
        days: {
          include: { shiftTemplate: true },
          orderBy: [{ sortOrder: 'asc' }],
        },
        shiftTemplates: true,
        holidayCalendar: true,
      },
    });
    if (!schedule) throw new NotFoundException('Work schedule was not found.');
    return withDefaultShiftTemplateId(schedule);
  }

  async createWorkSchedule(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = this.readWorkScheduleData(currentUser, body);
    await this.assertValidScopedReferences(currentUser.tenantId, data.scope);
    await this.assertWorkConfigurationReferences(currentUser.tenantId, body);
    const schedule = await this.prisma.workSchedule.create({
      data: {
        ...data.create,
        days: {
          create: readScheduleDays(
            body.days,
            currentUser.tenantId,
            readString(body.defaultShiftTemplateId),
          ),
        },
      },
      include: {
        days: { include: { shiftTemplate: true } },
        shiftTemplates: true,
        holidayCalendar: true,
      },
    });
    await this.audit(
      currentUser,
      'work-schedule.create',
      'WorkSchedule',
      schedule.id,
      null,
      schedule,
    );
    return withDefaultShiftTemplateId(schedule);
  }

  async updateWorkSchedule(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.workSchedule.findFirst({
      where: { tenantId: currentUser.tenantId, id },
      include: { days: true, shiftTemplates: true },
    });
    if (!existing) throw new NotFoundException('Work schedule was not found.');

    const data = this.readWorkScheduleData(currentUser, body, existing);
    await this.assertValidScopedReferences(currentUser.tenantId, data.scope);
    await this.assertWorkConfigurationReferences(currentUser.tenantId, body);
    const hasDefaultShiftTemplate = Object.prototype.hasOwnProperty.call(
      body,
      'defaultShiftTemplateId',
    );
    const defaultShiftTemplateId = hasDefaultShiftTemplate
      ? readNullableString(body.defaultShiftTemplateId)
      : undefined;
    const shouldRebuildDefaultDays =
      hasDefaultShiftTemplate && !Array.isArray(body.days);
    const workingDays = new Set(data.update.weeklyWorkDays);

    const schedule = await this.prisma.$transaction(async (tx) => {
      if (Array.isArray(body.days)) {
        await tx.workScheduleDay.deleteMany({ where: { workScheduleId: id } });
      }
      const updatedSchedule = await tx.workSchedule.update({
        where: { id },
        data: {
          ...data.update,
          ...(Array.isArray(body.days)
            ? {
                days: {
                  create: readScheduleDays(
                    body.days,
                    currentUser.tenantId,
                    readString(body.defaultShiftTemplateId),
                  ),
                },
              }
            : {}),
        },
        include: {
          days: { include: { shiftTemplate: true } },
          shiftTemplates: true,
          holidayCalendar: true,
        },
      });

      if (shouldRebuildDefaultDays) {
        if (updatedSchedule.days.length === 0) {
          await tx.workScheduleDay.createMany({
            data: readScheduleDays(
              undefined,
              currentUser.tenantId,
              defaultShiftTemplateId,
            ).map((day) => ({
              ...day,
              workScheduleId: id,
              isWorkingDay: workingDays.has(day.dayOfWeek),
              shiftTemplateId: workingDays.has(day.dayOfWeek)
                ? defaultShiftTemplateId
                : null,
            })),
          });
        } else {
          await tx.workScheduleDay.updateMany({
            where: {
              workScheduleId: id,
              tenantId: currentUser.tenantId,
              dayOfWeek: { in: [...workingDays] },
            },
            data: {
              isWorkingDay: true,
              shiftTemplateId: defaultShiftTemplateId ?? null,
            },
          });
          await tx.workScheduleDay.updateMany({
            where: {
              workScheduleId: id,
              tenantId: currentUser.tenantId,
              dayOfWeek: { notIn: [...workingDays] },
            },
            data: {
              isWorkingDay: false,
              shiftTemplateId: null,
            },
          });
        }

        return tx.workSchedule.findUniqueOrThrow({
          where: { id },
          include: {
            days: {
              include: { shiftTemplate: true },
              orderBy: [{ sortOrder: 'asc' }],
            },
            shiftTemplates: true,
            holidayCalendar: true,
          },
        });
      }

      return updatedSchedule;
    });
    await this.audit(
      currentUser,
      'work-schedule.update',
      'WorkSchedule',
      id,
      existing,
      schedule,
    );
    return withDefaultShiftTemplateId(schedule);
  }

  async deleteWorkSchedule(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.workSchedule.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Work schedule was not found.');
    await this.prisma.workSchedule.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        isActive: false,
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'work-schedule.archive',
      'WorkSchedule',
      id,
      existing,
      {
        ...existing,
        status: 'ARCHIVED',
      },
    );
    return { id, archived: true };
  }

  async listShiftTemplates(tenantId: string) {
    return this.prisma.shiftTemplate.findMany({
      where: { tenantId },
      include: { workSchedule: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async getShiftTemplate(tenantId: string, id: string) {
    const shift = await this.prisma.shiftTemplate.findFirst({
      where: { tenantId, id },
      include: { workSchedule: { select: { id: true, name: true } } },
    });
    if (!shift) throw new NotFoundException('Shift was not found.');
    return shift;
  }

  async createShiftTemplate(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = this.readShiftTemplateData(currentUser, body);
    const shift = await this.prisma.shiftTemplate.create({ data });
    await this.audit(
      currentUser,
      'shift-template.create',
      'ShiftTemplate',
      shift.id,
      null,
      shift,
    );
    return shift;
  }

  async updateShiftTemplate(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.shiftTemplate.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) throw new NotFoundException('Shift was not found.');
    const data = this.readShiftTemplateData(currentUser, body, existing);
    const updateData: Prisma.ShiftTemplateUncheckedUpdateInput = { ...data };
    delete updateData.tenantId;
    delete updateData.createdById;
    const shift = await this.prisma.shiftTemplate.update({
      where: { id },
      data: updateData,
    });
    await this.audit(
      currentUser,
      'shift-template.update',
      'ShiftTemplate',
      id,
      existing,
      shift,
    );
    return shift;
  }

  async archiveShiftTemplate(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.shiftTemplate.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) throw new NotFoundException('Shift was not found.');
    await this.prisma.shiftTemplate.update({
      where: { id },
      data: {
        isActive: false,
        status: ConfigurationStatus.ARCHIVED,
        updatedById: currentUser.userId,
      },
    });
    return { id, archived: true };
  }

  async listEmployeeScheduleAssignments(tenantId: string) {
    return this.prisma.employeeScheduleAssignment.findMany({
      where: { tenantId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        workSchedule: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }],
    });
  }

  async getEmployeeScheduleAssignment(tenantId: string, id: string) {
    const assignment = await this.prisma.employeeScheduleAssignment.findFirst({
      where: { tenantId, id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        workSchedule: { select: { id: true, name: true, code: true } },
      },
    });
    if (!assignment)
      throw new NotFoundException('Schedule assignment was not found.');
    return assignment;
  }

  async createEmployeeScheduleAssignment(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const employeeId = requiredString(body.employeeId, 'Employee is required.');
    const workScheduleId = requiredString(
      body.workScheduleId,
      'Work schedule is required.',
    );
    const effectiveFrom = requiredDate(
      body.effectiveFrom,
      'Effective from date is required.',
    );
    const effectiveTo = readDate(body.effectiveTo);
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'Effective to date cannot be before effective from date.',
      );
    }
    const [employee, schedule] = await Promise.all([
      this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          tenantId: currentUser.tenantId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      this.prisma.workSchedule.findFirst({
        where: {
          id: workScheduleId,
          tenantId: currentUser.tenantId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    if (!employee) throw new BadRequestException('Employee was not found.');
    if (!schedule)
      throw new BadRequestException('Work schedule was not found.');

    const assignment = await this.prisma.$transaction(async (tx) => {
      await tx.employeeScheduleAssignment.updateMany({
        where: {
          tenantId: currentUser.tenantId,
          employeeId,
          isActive: true,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        data: {
          isActive: false,
          updatedById: currentUser.userId,
        },
      });
      return tx.employeeScheduleAssignment.create({
        data: {
          tenantId: currentUser.tenantId,
          employeeId,
          workScheduleId,
          effectiveFrom,
          effectiveTo,
          reason: readNullableString(body.reason),
          isActive: true,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
      });
    });
    await this.audit(
      currentUser,
      'employee-schedule-assignment.create',
      'EmployeeScheduleAssignment',
      assignment.id,
      null,
      assignment,
    );
    return assignment;
  }

  async deactivateEmployeeScheduleAssignment(
    currentUser: AuthenticatedUser,
    id: string,
  ) {
    const result = await this.prisma.employeeScheduleAssignment.updateMany({
      where: { id, tenantId: currentUser.tenantId },
      data: { isActive: false, updatedById: currentUser.userId },
    });
    if (!result.count)
      throw new NotFoundException('Schedule assignment was not found.');
    return { id, deactivated: true };
  }

  async listPayrollRegions(
    tenantId: string,
    query: Record<string, unknown> = {},
  ) {
    const search = readString(query.search);
    const regions = await this.prisma.payrollRegion.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { countryCode: { contains: search, mode: 'insensitive' } },
                { currencyCode: { contains: search, mode: 'insensitive' } },
                { timezone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        businessUnit: true,
        holidayCalendar: true,
        location: true,
        organization: true,
        workSchedule: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return regions.map(mapPayrollRegion);
  }

  async getPayrollRegion(tenantId: string, id: string) {
    const region = await this.prisma.payrollRegion.findFirst({
      where: { tenantId, id },
      include: {
        businessUnit: true,
        holidayCalendar: true,
        location: true,
        organization: true,
        workSchedule: true,
      },
    });
    if (!region) throw new NotFoundException('Payroll region was not found.');
    return mapPayrollRegion(region);
  }

  async createPayrollRegion(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = await this.readPayrollRegionData(currentUser.tenantId, body);
    if (data.status === 'ACTIVE') {
      await this.assertNoOverlappingPayrollRegion(currentUser.tenantId, {
        ...data,
        idToExclude: null,
      });
    }
    const region = await this.prisma.payrollRegion.create({
      data: {
        ...data,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      include: {
        businessUnit: true,
        holidayCalendar: true,
        location: true,
        organization: true,
        workSchedule: true,
      },
    });
    await this.audit(
      currentUser,
      'payroll-region.create',
      'PayrollRegion',
      region.id,
      null,
      region,
    );
    return mapPayrollRegion(region);
  }

  async updatePayrollRegion(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.payrollRegion.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Payroll region was not found.');
    const data = await this.readPayrollRegionData(
      currentUser.tenantId,
      body,
      existing,
    );
    if (data.status === 'ACTIVE') {
      await this.assertNoOverlappingPayrollRegion(currentUser.tenantId, {
        ...data,
        idToExclude: id,
      });
    }
    const region = await this.prisma.payrollRegion.update({
      where: { id },
      data: { ...data, updatedById: currentUser.userId },
      include: {
        businessUnit: true,
        holidayCalendar: true,
        location: true,
        organization: true,
        workSchedule: true,
      },
    });
    await this.audit(
      currentUser,
      'payroll-region.update',
      'PayrollRegion',
      id,
      existing,
      region,
    );
    return mapPayrollRegion(region);
  }

  async deletePayrollRegion(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.payrollRegion.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Payroll region was not found.');
    await this.prisma.payrollRegion.update({
      where: { id },
      data: { status: 'ARCHIVED', updatedById: currentUser.userId },
    });
    await this.audit(
      currentUser,
      'payroll-region.archive',
      'PayrollRegion',
      id,
      existing,
      {
        ...existing,
        status: 'ARCHIVED',
      },
    );
    return { id, archived: true };
  }

  async listFiscalYears(tenantId: string, query: Record<string, unknown> = {}) {
    const search = readString(query.search);
    return this.prisma.fiscalYear.findMany({
      where: {
        tenantId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    });
  }

  async getFiscalYear(tenantId: string, id: string) {
    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: { tenantId, id },
    });
    if (!fiscalYear) throw new NotFoundException('Fiscal year was not found.');
    return fiscalYear;
  }

  async getFiscalYearUsage(tenantId: string, id: string) {
    await this.getFiscalYear(tenantId, id);
    const payrollPeriodCount = await this.prisma.payrollPeriod.count({
      where: { tenantId, fiscalYearId: id },
    });
    return {
      fiscalYearId: id,
      usages: [
        {
          area: 'Payroll Periods',
          count: payrollPeriodCount,
          blocksDelete: payrollPeriodCount > 0,
        },
      ],
    };
  }

  async createFiscalYear(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = await this.readFiscalYearData(currentUser.tenantId, body);
    await this.assertFiscalYearDoesNotOverlap(currentUser.tenantId, data);
    const fiscalYear = await this.prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.fiscalYear.updateMany({
          where: { tenantId: currentUser.tenantId, isCurrent: true },
          data: { isCurrent: false, updatedById: currentUser.userId },
        });
      }
      return tx.fiscalYear.create({
        data: {
          ...data,
          tenantId: currentUser.tenantId,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
      });
    });
    await this.audit(
      currentUser,
      'fiscal-year.create',
      'FiscalYear',
      fiscalYear.id,
      null,
      fiscalYear,
    );
    return fiscalYear;
  }

  async updateFiscalYear(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.fiscalYear.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Fiscal year was not found.');
    const data = await this.readFiscalYearData(
      currentUser.tenantId,
      body,
      existing,
    );
    await this.assertFiscalYearDoesNotOverlap(currentUser.tenantId, {
      ...data,
      idToExclude: id,
    });
    const fiscalYear = await this.prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.fiscalYear.updateMany({
          where: {
            tenantId: currentUser.tenantId,
            isCurrent: true,
            id: { not: id },
          },
          data: { isCurrent: false, updatedById: currentUser.userId },
        });
      }
      return tx.fiscalYear.update({
        where: { id },
        data: { ...data, updatedById: currentUser.userId },
      });
    });
    await this.audit(
      currentUser,
      'fiscal-year.update',
      'FiscalYear',
      id,
      existing,
      fiscalYear,
    );
    return fiscalYear;
  }

  async deleteFiscalYear(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.fiscalYear.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Fiscal year was not found.');

    const payrollPeriodCount = await this.prisma.payrollPeriod.count({
      where: { tenantId: currentUser.tenantId, fiscalYearId: id },
    });
    if (payrollPeriodCount > 0) {
      throw new ConflictException(
        'Fiscal year cannot be deleted because payroll periods reference it.',
      );
    }

    const fiscalYear = await this.prisma.fiscalYear.update({
      where: { id },
      data: {
        status: ConfigurationStatus.ARCHIVED,
        subStatus: 'ARCHIVED',
        isCurrent: false,
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'fiscal-year.archive',
      'FiscalYear',
      id,
      existing,
      fiscalYear,
    );
    return { id, archived: true };
  }

  async listExchangeRates(tenantId: string, query: Record<string, unknown>) {
    const items = await this.prisma.exchangeRateSnapshot.findMany({
      where: {
        tenantId,
        ...(readString(query.fromCurrency)
          ? {
              fromCurrency: normalizeCurrencyCode(
                readString(query.fromCurrency)!,
              ),
            }
          : {}),
        ...(readString(query.toCurrency)
          ? { toCurrency: normalizeCurrencyCode(readString(query.toCurrency)!) }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: Math.min(readNumber(query.take) ?? 100, 500),
    });

    return {
      items: items.map((item) => this.mapExchangeRate(item)),
      providerStatus: await this.getExchangeRateProviderStatus(tenantId),
    };
  }

  async getExchangeRate(tenantId: string, id: string) {
    const snapshot = await this.prisma.exchangeRateSnapshot.findFirst({
      where: { tenantId, id },
    });
    if (!snapshot) throw new NotFoundException('Exchange rate was not found.');
    return this.mapExchangeRate(snapshot);
  }

  async createExchangeRate(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = this.readExchangeRateData(body);
    this.validateExchangeRatePair(data.fromCurrency, data.toCurrency);
    if (data.status === 'ACTIVE') {
      await this.assertNoActiveExchangeRate(currentUser.tenantId, {
        ...data,
        idToExclude: null,
      });
    }
    const snapshot = await this.prisma.exchangeRateSnapshot.create({
      data: {
        tenantId: currentUser.tenantId,
        ...data,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });
    await this.audit(
      currentUser,
      'exchange-rate.create',
      'ExchangeRateSnapshot',
      snapshot.id,
      null,
      snapshot,
    );
    return this.mapExchangeRate(snapshot);
  }

  async updateExchangeRate(
    currentUser: AuthenticatedUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.exchangeRateSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Exchange rate was not found.');
    if (!existing.isManual && existing.source !== ExchangeRateSource.MANUAL) {
      throw new BadRequestException(
        'Provider-synced exchange rates cannot be manually edited. Add a manual override instead.',
      );
    }
    const data = this.readExchangeRateData(body, existing);
    this.validateExchangeRatePair(data.fromCurrency, data.toCurrency);
    if (data.status === 'ACTIVE') {
      await this.assertNoActiveExchangeRate(currentUser.tenantId, {
        ...data,
        idToExclude: id,
      });
    }
    const snapshot = await this.prisma.exchangeRateSnapshot.update({
      where: { id },
      data: { ...data, updatedById: currentUser.userId },
    });
    await this.audit(
      currentUser,
      'exchange-rate.update',
      'ExchangeRateSnapshot',
      id,
      existing,
      snapshot,
    );
    return this.mapExchangeRate(snapshot);
  }

  async deleteExchangeRate(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.exchangeRateSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Exchange rate was not found.');
    const snapshot = await this.prisma.exchangeRateSnapshot.update({
      where: { id },
      data: { status: 'ARCHIVED', updatedById: currentUser.userId },
    });
    await this.audit(
      currentUser,
      'exchange-rate.archive',
      'ExchangeRateSnapshot',
      id,
      existing,
      snapshot,
    );
    return { id, archived: true };
  }

  async resolveExchangeRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
    effectiveDate = new Date(),
  ) {
    const from = normalizeCurrencyCode(fromCurrency);
    const to = normalizeCurrencyCode(toCurrency);
    if (from === to) return new Prisma.Decimal(1);

    /*
     * BUG-0668. `effectiveDate` was accepted and then ignored: every lookup
     * ordered by `updatedAt` and took the newest row, so a caller asking for
     * the rate *as of* a date silently got today's. `convertMoney` forwards
     * the caller's date, which is what made it dangerous — the caller did
     * everything right and still got the wrong number.
     *
     * `ExchangeRateSnapshot` is effective-dated by design: `effectiveDate` is
     * required, `effectiveEndDate` is nullable and null means "still current".
     * A row is eligible when the requested moment falls inside that window.
     */
    const asOf = {
      effectiveDate: { lte: effectiveDate },
      OR: [
        { effectiveEndDate: null },
        { effectiveEndDate: { gte: effectiveDate } },
      ],
    };

    const directManual = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency: from,
        toCurrency: to,
        status: 'ACTIVE',
        isManual: true,
        ...asOf,
      },
      // Most recently effective first: with several windows covering the same
      // moment, the later one is the correction.
      orderBy: [{ effectiveDate: 'desc' }, { updatedAt: 'desc' }],
    });
    if (directManual) return directManual.rate;

    const direct = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency: from,
        toCurrency: to,
        status: 'ACTIVE',
        isManual: false,
        ...asOf,
      },
      orderBy: [
        { effectiveDate: 'desc' },
        { lastFetchedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
    if (direct) return direct.rate;
    const inverse = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency: to,
        toCurrency: from,
        status: 'ACTIVE',
        ...asOf,
      },
      orderBy: [
        { isManual: 'desc' },
        { effectiveDate: 'desc' },
        { lastFetchedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
    if (inverse) return new Prisma.Decimal(1).div(inverse.rate);
    throw new BadRequestException(
      `Exchange rate is missing for ${from} to ${to} on ${effectiveDate.toISOString().slice(0, 10)}. Please refresh rates or add a manual override.`,
    );
  }

  async convertMoney(input: {
    tenantId: string;
    amount: Prisma.Decimal.Value;
    fromCurrency: string;
    toCurrency: string;
    effectiveDate?: Date;
  }) {
    const rate = await this.resolveExchangeRate(
      input.tenantId,
      input.fromCurrency,
      input.toCurrency,
      input.effectiveDate ?? new Date(),
    );
    return new Prisma.Decimal(input.amount).mul(rate);
  }

  async resolveHolidayCalendarId(input: {
    tenantId: string;
    organizationId?: string | null;
    businessUnitId?: string | null;
    projectId?: string | null;
    effectiveDate?: Date | null;
  }) {
    const effectiveDate = input.effectiveDate ?? new Date();
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { tenantId: input.tenantId, id: input.projectId },
        select: { holidayCalendarId: true },
      });
      if (project?.holidayCalendarId) return project.holidayCalendarId;
    }

    const assignment = await this.prisma.holidayCalendarAssignment.findFirst({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        OR: [
          input.projectId ? { projectId: input.projectId } : undefined,
          input.businessUnitId
            ? { businessUnitId: input.businessUnitId }
            : undefined,
          input.organizationId
            ? { organizationId: input.organizationId }
            : undefined,
          {
            organizationId: null,
            businessUnitId: null,
            projectId: null,
            isDefault: true,
          },
        ].filter(Boolean) as Prisma.HolidayCalendarAssignmentWhereInput[],
        AND: effectiveDateRangeWhere(effectiveDate),
      },
      orderBy: [
        { projectId: 'desc' },
        { businessUnitId: 'desc' },
        { organizationId: 'desc' },
        { isDefault: 'desc' },
      ],
    });
    if (assignment) return assignment.holidayCalendarId;

    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        isDefault: true,
        AND: effectiveDateRangeWhere(effectiveDate),
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return calendar?.id ?? null;
  }

  async resolveWorkScheduleId(input: {
    tenantId: string;
    employeeId?: string | null;
    organizationId?: string | null;
    businessUnitId?: string | null;
    departmentId?: string | null;
    locationId?: string | null;
    projectId?: string | null;
    effectiveDate?: Date | null;
  }) {
    const effectiveDate = input.effectiveDate ?? new Date();
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { tenantId: input.tenantId, id: input.projectId },
        select: { workScheduleId: true },
      });
      if (project?.workScheduleId) return project.workScheduleId;
    }

    if (input.employeeId) {
      const assignment = await this.prisma.employeeScheduleAssignment.findFirst(
        {
          where: {
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            isActive: true,
            effectiveFrom: { lte: effectiveDate },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: effectiveDate } },
            ],
            workSchedule: {
              isActive: true,
              status: 'ACTIVE',
              AND: effectiveDateRangeWhere(effectiveDate),
            },
          },
          select: { workScheduleId: true },
          orderBy: [{ effectiveFrom: 'desc' }, { updatedAt: 'desc' }],
        },
      );
      if (assignment) return assignment.workScheduleId;

      const employee = await this.prisma.employee.findFirst({
        where: {
          tenantId: input.tenantId,
          id: input.employeeId,
          isDeleted: false,
        },
        select: {
          defaultWorkScheduleId: true,
          departmentId: true,
          locationId: true,
        },
      });
      if (employee?.defaultWorkScheduleId) {
        const activeDefault = await this.prisma.workSchedule.findFirst({
          where: {
            tenantId: input.tenantId,
            id: employee.defaultWorkScheduleId,
            isActive: true,
            status: 'ACTIVE',
            AND: effectiveDateRangeWhere(effectiveDate),
          },
          select: { id: true },
        });
        if (activeDefault) return activeDefault.id;
      }
      input.departmentId ??= employee?.departmentId;
      input.locationId ??= employee?.locationId;
    }

    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { tenantId: input.tenantId, id: input.departmentId },
        select: { defaultWorkScheduleId: true },
      });
      if (department?.defaultWorkScheduleId)
        return department.defaultWorkScheduleId;
    }

    if (input.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { tenantId: input.tenantId, id: input.locationId },
        select: { defaultWorkScheduleId: true },
      });
      if (location?.defaultWorkScheduleId)
        return location.defaultWorkScheduleId;
    }

    const schedule = await this.prisma.workSchedule.findFirst({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        isActive: true,
        OR: [
          input.projectId ? { projectId: input.projectId } : undefined,
          input.businessUnitId
            ? { businessUnitId: input.businessUnitId }
            : undefined,
          input.organizationId
            ? { organizationId: input.organizationId }
            : undefined,
          {
            organizationId: null,
            businessUnitId: null,
            projectId: null,
            isDefault: true,
          },
        ].filter(Boolean) as Prisma.WorkScheduleWhereInput[],
        AND: effectiveDateRangeWhere(effectiveDate),
      },
      orderBy: [
        { projectId: 'desc' },
        { businessUnitId: 'desc' },
        { organizationId: 'desc' },
        { isDefault: 'desc' },
      ],
    });
    return schedule?.id ?? null;
  }

  async findResolvedHolidaysForRange(input: {
    tenantId: string;
    organizationId?: string | null;
    businessUnitId?: string | null;
    projectId?: string | null;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const calendarId = await this.resolveHolidayCalendarId(input);
    if (!calendarId) return [];
    const holidays = await this.prisma.holiday.findMany({
      where: {
        tenantId: input.tenantId,
        holidayCalendarId: calendarId,
        status: 'ACTIVE',
        holidayDate: { lte: input.periodEnd },
      },
      orderBy: [{ holidayDate: 'asc' }],
    });

    return holidays.flatMap((holiday) =>
      expandHolidayOccurrence(holiday, input.periodStart, input.periodEnd),
    );
  }

  private readWorkScheduleData(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
    existing?: {
      name: string;
      code: string | null;
      organizationId: string | null;
      businessUnitId: string | null;
      projectId: string | null;
      holidayCalendarId: string | null;
      timezone: string;
      description?: string | null;
      workWeekModel?: WorkWeekModel;
      standardStartTime: string;
      standardEndTime: string;
      weeklyWorkDays: WorkWeekday[];
      minHoursPerDay?: Prisma.Decimal | null;
      standardHoursPerWeek?: Prisma.Decimal | null;
      flexibleHours?: boolean;
      shiftBased?: boolean;
      graceMinutes?: number | null;
      isDefault?: boolean;
      isActive?: boolean;
      status?: ConfigurationStatus;
      effectiveStartDate?: Date | null;
      effectiveEndDate?: Date | null;
    },
  ) {
    const scope = readScopeWithFallback(body, existing);
    const dateRange = readDateRangeWithFallback(body, existing);
    validateDateRange(dateRange);
    const weeklyWorkDays =
      readWeekdays(body.weeklyWorkDays) ??
      existing?.weeklyWorkDays ??
      defaultWeekdays();
    const create = {
      tenantId: currentUser.tenantId,
      ...scope,
      holidayCalendarId:
        body.holidayCalendarId !== undefined
          ? readNullableString(body.holidayCalendarId)
          : (existing?.holidayCalendarId ?? null),
      name: requiredString(
        body.name ?? existing?.name,
        'Work schedule name is required.',
      ),
      code: normalizeCode(
        body.code ?? existing?.code,
        body.name ?? existing?.name,
      ),
      description:
        body.description !== undefined
          ? readNullableString(body.description)
          : (existing?.description ?? null),
      timezone: normalizeTimezone(body.timezone ?? existing?.timezone) ?? 'UTC',
      workWeekModel:
        readEnum(body.workWeekModel, WorkWeekModel) ??
        existing?.workWeekModel ??
        'FIVE_DAY',
      weeklyWorkDays,
      standardStartTime:
        readString(body.standardStartTime) ??
        existing?.standardStartTime ??
        '09:00',
      standardEndTime:
        readString(body.standardEndTime) ??
        existing?.standardEndTime ??
        '17:00',
      minHoursPerDay:
        body.minHoursPerDay !== undefined
          ? decimalOrNull(body.minHoursPerDay)
          : (existing?.minHoursPerDay ?? null),
      standardHoursPerWeek:
        body.standardHoursPerWeek !== undefined
          ? decimalOrNull(body.standardHoursPerWeek)
          : (existing?.standardHoursPerWeek ?? null),
      flexibleHours:
        readBoolean(body.flexibleHours) ?? existing?.flexibleHours ?? false,
      shiftBased: readBoolean(body.shiftBased) ?? existing?.shiftBased ?? false,
      graceMinutes:
        body.graceMinutes !== undefined
          ? readNumber(body.graceMinutes)
          : (existing?.graceMinutes ?? null),
      isDefault: readBoolean(body.isDefault) ?? existing?.isDefault ?? false,
      isActive: readBoolean(body.isActive) ?? existing?.isActive ?? true,
      status:
        readEnum(body.status, ConfigurationStatus) ??
        existing?.status ??
        'ACTIVE',
      effectiveStartDate: dateRange.effectiveStartDate,
      effectiveEndDate: dateRange.effectiveEndDate,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    };
    const update = { ...create };
    delete (update as Partial<typeof create>).tenantId;
    delete (update as Partial<typeof create>).createdById;
    return { create, update, scope };
  }

  private async assertWorkConfigurationReferences(
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    const holidayCalendarId = readString(body.holidayCalendarId);
    const shiftIds = [
      readString(body.defaultShiftTemplateId),
      ...(Array.isArray(body.days)
        ? body.days.map((day) =>
            day && typeof day === 'object' && !Array.isArray(day)
              ? readString((day as Record<string, unknown>).shiftTemplateId)
              : undefined,
          )
        : []),
    ].filter((value): value is string => Boolean(value));

    const [calendar, shiftCount] = await Promise.all([
      holidayCalendarId
        ? this.prisma.holidayCalendar.findFirst({
            where: {
              id: holidayCalendarId,
              tenantId,
              status: ConfigurationStatus.ACTIVE,
            },
            select: { id: true },
          })
        : null,
      shiftIds.length
        ? this.prisma.shiftTemplate.count({
            where: {
              id: { in: [...new Set(shiftIds)] },
              tenantId,
              isActive: true,
              status: ConfigurationStatus.ACTIVE,
            },
          })
        : 0,
    ]);

    if (holidayCalendarId && !calendar) {
      throw new BadRequestException(
        'Selected work calendar is not active for this tenant.',
      );
    }
    if (shiftIds.length && shiftCount !== new Set(shiftIds).size) {
      throw new BadRequestException(
        'One or more selected shifts are not active for this tenant.',
      );
    }
  }

  private readShiftTemplateData(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
    existing?: {
      name: string;
      code: string;
      timezone: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      expectedHours: Prisma.Decimal;
      lateGraceMinutes: number;
      earlyExitGraceMinutes: number;
      isNightShift: boolean;
      isActive: boolean;
      workScheduleId: string | null;
    },
  ): Prisma.ShiftTemplateUncheckedCreateInput {
    return {
      tenantId: currentUser.tenantId,
      name: requiredString(
        body.name ?? existing?.name,
        'Shift name is required.',
      ),
      code: normalizeCode(
        body.code ?? existing?.code,
        body.name ?? existing?.name,
      ),
      description: readNullableString(body.description),
      timezone: normalizeTimezone(body.timezone ?? existing?.timezone) ?? 'UTC',
      startTime: readTime(
        body.startTime ?? existing?.startTime,
        'Start time is required.',
      ),
      endTime: readTime(
        body.endTime ?? existing?.endTime,
        'End time is required.',
      ),
      breakMinutes:
        readNumber(body.breakMinutes) ?? existing?.breakMinutes ?? 0,
      expectedHours:
        decimalOrNull(body.expectedHours) ??
        existing?.expectedHours ??
        new Prisma.Decimal(8),
      lateGraceMinutes:
        readNumber(body.lateGraceMinutes) ?? existing?.lateGraceMinutes ?? 0,
      earlyExitGraceMinutes:
        readNumber(body.earlyExitGraceMinutes) ??
        existing?.earlyExitGraceMinutes ??
        0,
      isNightShift:
        readBoolean(body.isNightShift) ?? existing?.isNightShift ?? false,
      isActive: readBoolean(body.isActive) ?? existing?.isActive ?? true,
      status:
        readBoolean(body.isActive) === false
          ? ConfigurationStatus.INACTIVE
          : ConfigurationStatus.ACTIVE,
      workScheduleId:
        readNullableString(body.workScheduleId) ??
        existing?.workScheduleId ??
        null,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    };
  }

  private async readPayrollRegionData(
    tenantId: string,
    body: Record<string, unknown>,
    existing?: {
      name: string;
      code: string;
      organizationId: string | null;
      businessUnitId: string | null;
      locationId?: string | null;
      countryCode?: string | null;
      regionCode?: string | null;
      currencyCode: string;
      reportingCurrencyCode?: string | null;
      timezone: string;
      effectiveStartDate?: Date | null;
      effectiveEndDate?: Date | null;
      status?: ConfigurationStatus;
      subStatus?: string | null;
      ownerUserId?: string | null;
    },
  ) {
    const scope = readPayrollRegionScopeWithFallback(body, existing);
    await this.assertValidScopedReferences(tenantId, scope);
    const locationId =
      body.locationId !== undefined
        ? readNullableString(body.locationId)
        : (existing?.locationId ?? null);
    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { tenantId, id: locationId },
      });
      if (!location) throw new BadRequestException('Work site was not found.');
    }
    const holidayCalendarId = readNullableString(body.holidayCalendarId);
    const workScheduleId = readNullableString(body.workScheduleId);
    const effectiveStartDate =
      body.effectiveStartDate !== undefined
        ? readDate(body.effectiveStartDate)
        : (existing?.effectiveStartDate ?? null);
    const effectiveEndDate =
      body.effectiveEndDate !== undefined
        ? readDate(body.effectiveEndDate)
        : (existing?.effectiveEndDate ?? null);
    validateDateRange({ effectiveStartDate, effectiveEndDate });
    const countryCode =
      body.countryCode !== undefined
        ? normalizeCountryCode(body.countryCode)
        : (existing?.countryCode ?? null);
    const regionCode =
      body.regionCode !== undefined
        ? readNullableString(body.regionCode)
        : (existing?.regionCode ?? null);
    if (holidayCalendarId) {
      await this.findHolidayCalendarOrThrow(tenantId, holidayCalendarId);
    }
    if (workScheduleId) {
      const schedule = await this.prisma.workSchedule.findFirst({
        where: { tenantId, id: workScheduleId },
      });
      if (!schedule)
        throw new BadRequestException('Work schedule was not found.');
    }
    const ownerUserId =
      body.ownerUserId !== undefined
        ? readNullableString(body.ownerUserId)
        : (existing?.ownerUserId ?? null);
    if (ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, id: ownerUserId },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException('Record owner was not found.');
    }
    return {
      tenantId,
      ...scope,
      name: requiredString(
        body.name ?? existing?.name,
        'Payroll region name is required.',
      ),
      code: normalizeCode(
        body.code ?? existing?.code,
        body.name ?? existing?.name,
      ),
      currencyCode: normalizeCurrencyCode(
        requiredString(
          body.currencyCode ?? existing?.currencyCode,
          'Payroll currency is required.',
        ),
      ),
      reportingCurrencyCode:
        body.reportingCurrencyCode !== undefined
          ? normalizeCurrencyCode(
              requiredString(
                body.reportingCurrencyCode,
                'Reporting currency is required.',
              ),
            )
          : (existing?.reportingCurrencyCode ??
            normalizeCurrencyCode(
              requiredString(
                body.currencyCode ?? existing?.currencyCode,
                'Payroll currency is required.',
              ),
            )),
      locationId,
      countryCode,
      regionCode,
      timezone: normalizeTimezone(body.timezone ?? existing?.timezone) ?? 'UTC',
      payCycle: readEnum(body.payCycle, PayCycle) ?? 'MONTHLY',
      taxRegion: readNullableString(body.taxRegion),
      overtimeRulesJson: (body.overtimeRulesJson ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      weekendPolicy:
        readEnum(body.weekendPolicy, WeekendPolicy) ?? 'SATURDAY_SUNDAY',
      weekendDays: readWeekdays(body.weekendDays) ?? [
        WorkWeekday.SATURDAY,
        WorkWeekday.SUNDAY,
      ],
      holidayCalendarId,
      workScheduleId,
      effectiveStartDate,
      effectiveEndDate,
      isDefault: readBoolean(body.isDefault) ?? false,
      status:
        readEnum(body.status, ConfigurationStatus) ??
        existing?.status ??
        ConfigurationStatus.ACTIVE,
      subStatus:
        body.subStatus !== undefined
          ? (readNullableString(body.subStatus) ?? null)
          : (existing?.subStatus ?? 'OPEN'),
      ownerUserId,
    } satisfies Prisma.PayrollRegionUncheckedCreateInput;
  }

  private async readFiscalYearData(
    tenantId: string,
    body: Record<string, unknown>,
    existing?: {
      name: string;
      startDate: Date;
      endDate: Date;
      isCurrent: boolean;
      status: ConfigurationStatus;
      subStatus: string | null;
      ownerUserId: string | null;
      description: string | null;
    },
  ) {
    const startDate = requiredDate(
      body.startDate ?? existing?.startDate,
      'Fiscal year start date is required.',
    );
    const endDate = requiredDate(
      body.endDate ?? existing?.endDate,
      'Fiscal year end date is required.',
    );
    if (endDate <= startDate) {
      throw new BadRequestException(
        'Fiscal year end date must be after start date.',
      );
    }
    const ownerUserId =
      body.ownerUserId !== undefined
        ? readNullableString(body.ownerUserId)
        : (existing?.ownerUserId ?? null);
    if (ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, id: ownerUserId },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException('Record owner was not found.');
    }
    return {
      name: requiredString(
        body.name ?? existing?.name,
        'Fiscal year name is required.',
      ),
      startDate,
      endDate,
      isCurrent: readBoolean(body.isCurrent) ?? existing?.isCurrent ?? false,
      status:
        readEnum(body.status, ConfigurationStatus) ??
        existing?.status ??
        ConfigurationStatus.ACTIVE,
      subStatus:
        body.subStatus !== undefined
          ? (readNullableString(body.subStatus) ?? null)
          : (existing?.subStatus ?? 'OPEN'),
      ownerUserId,
      description:
        body.description !== undefined
          ? (readNullableString(body.description) ?? null)
          : (existing?.description ?? null),
    };
  }

  private readExchangeRateData(
    body: Record<string, unknown>,
    existing?: {
      fromCurrency: string;
      toCurrency: string;
      rate: Prisma.Decimal;
      effectiveDate: Date;
      effectiveEndDate: Date | null;
      source: ExchangeRateSource;
      isManual: boolean;
      lockedRate: boolean;
      provider?: string | null;
      lastFetchedAt?: Date | null;
      overrideReason?: string | null;
      subStatus?: string | null;
      description?: string | null;
      status: ConfigurationStatus;
    },
  ): ExchangeRateData {
    const rate = readNumber(body.rate) ?? existing?.rate?.toNumber();
    if (!Number.isFinite(rate) || !rate || rate <= 0) {
      throw new BadRequestException('Exchange rate must be greater than zero.');
    }
    const source =
      readEnum(body.source, ExchangeRateSource) ?? existing?.source ?? 'MANUAL';
    const isManual =
      readBoolean(body.isManual ?? body.override) ??
      existing?.isManual ??
      source === ExchangeRateSource.MANUAL;
    const overrideReason =
      body.overrideReason !== undefined
        ? (readString(body.overrideReason) ?? null)
        : (existing?.overrideReason ?? null);

    if (isManual && !overrideReason) {
      throw new BadRequestException(
        'Override reason is required for manual exchange rate overrides.',
      );
    }

    return {
      fromCurrency: normalizeCurrencyCode(
        requiredString(
          body.fromCurrency ?? existing?.fromCurrency,
          'From currency is required.',
        ),
      ),
      toCurrency: normalizeCurrencyCode(
        requiredString(
          body.toCurrency ?? existing?.toCurrency,
          'To currency is required.',
        ),
      ),
      rate: new Prisma.Decimal(rate),
      effectiveDate:
        readDate(body.effectiveDate) ?? existing?.effectiveDate ?? new Date(),
      effectiveEndDate: null,
      source,
      isManual,
      lockedRate: readBoolean(body.lockedRate) ?? existing?.lockedRate ?? false,
      provider:
        body.provider !== undefined
          ? (readString(body.provider) ?? null)
          : (existing?.provider ?? (isManual ? null : 'Provider')),
      lastFetchedAt:
        readDate(body.lastFetchedAt) ??
        existing?.lastFetchedAt ??
        (isManual ? null : new Date()),
      overrideReason,
      subStatus:
        body.subStatus !== undefined
          ? (readString(body.subStatus) ?? null)
          : (existing?.subStatus ??
            (isManual ? 'MANUAL_OVERRIDE' : 'PROVIDER_SYNCED')),
      description:
        body.description !== undefined
          ? (readString(body.description) ?? null)
          : (existing?.description ?? null),
      status:
        readEnum(body.status, ConfigurationStatus) ??
        existing?.status ??
        'ACTIVE',
    };
  }

  private async findHolidayCalendarOrThrow(tenantId: string, id: string) {
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { tenantId, id },
      include: { holidays: true, assignments: true },
    });
    if (!calendar)
      throw new NotFoundException('Holiday calendar was not found.');
    return calendar;
  }

  private async findHolidayOrThrow(
    tenantId: string,
    calendarId: string,
    id: string,
  ) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { tenantId, holidayCalendarId: calendarId, id },
    });
    if (!holiday) throw new NotFoundException('Holiday was not found.');
    return holiday;
  }

  private async assertValidScopedReferences(
    tenantId: string,
    scope: ScopeInput,
  ) {
    if (scope.organizationId) {
      const exists = await this.prisma.organization.count({
        where: { tenantId, id: scope.organizationId },
      });
      if (!exists) throw new BadRequestException('Organization was not found.');
    }
    if (scope.businessUnitId) {
      const exists = await this.prisma.businessUnit.count({
        where: { tenantId, id: scope.businessUnitId },
      });
      if (!exists)
        throw new BadRequestException('Business unit was not found.');
    }
    if (scope.projectId) {
      const exists = await this.prisma.project.count({
        where: { tenantId, id: scope.projectId },
      });
      if (!exists) throw new BadRequestException('Project was not found.');
    }
  }

  private async assertValidHolidayScope(
    tenantId: string,
    source: Record<string, unknown>,
  ) {
    const scopeType = readEnum(source.scopeType, HolidayScopeType);
    if (scopeType === HolidayScopeType.DEPARTMENT) {
      const departmentId = readString(source.departmentId);
      if (!departmentId) {
        throw new BadRequestException(
          'Department is required for this holiday.',
        );
      }
      const department = await this.prisma.department.findFirst({
        where: { tenantId, id: departmentId },
        select: { id: true },
      });
      if (!department) {
        throw new BadRequestException('Department was not found.');
      }
    }
    if (scopeType === HolidayScopeType.WORK_SITE) {
      const locationId = readString(source.locationId);
      if (!locationId) {
        throw new BadRequestException(
          'Work site is required for this holiday.',
        );
      }
      const location = await this.prisma.location.findFirst({
        where: { tenantId, id: locationId },
        select: { id: true },
      });
      if (!location) {
        throw new BadRequestException('Work site was not found.');
      }
    }
  }

  private async assertNoOverlappingHolidayCalendar(
    tenantId: string,
    input: ScopeInput &
      EffectiveDateRange & {
        countryCode?: string | null;
        regionCode?: string | null;
        timezone?: string | null;
        idToExclude: string | null;
      },
  ) {
    const overlaps = await this.prisma.holidayCalendar.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        organizationId: input.organizationId ?? null,
        businessUnitId: input.businessUnitId ?? null,
        projectId: input.projectId ?? null,
        countryCode: input.countryCode ?? null,
        regionCode: input.regionCode ?? null,
        timezone: input.timezone ?? 'UTC',
        OR: overlapWhere(input.effectiveStartDate, input.effectiveEndDate),
      },
    });
    if (overlaps) {
      throw new ConflictException(
        'Another holiday calendar already overlaps this scope and effective date range.',
      );
    }
  }

  private async assertNoOverlappingPayrollRegion(
    tenantId: string,
    input: ScopeInput &
      EffectiveDateRange & {
        locationId?: string | null;
        countryCode?: string | null;
        regionCode?: string | null;
        idToExclude: string | null;
      },
  ) {
    const overlaps = await this.prisma.payrollRegion.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        organizationId: input.organizationId ?? null,
        businessUnitId: input.businessUnitId ?? null,
        locationId: input.locationId ?? null,
        countryCode: input.countryCode ?? null,
        regionCode: input.regionCode ?? null,
        OR: overlapWhere(input.effectiveStartDate, input.effectiveEndDate),
      },
    });
    if (overlaps) {
      throw new ConflictException(
        'An active payroll region already overlaps this scope and effective date range.',
      );
    }
  }

  private async assertFiscalYearDoesNotOverlap(
    tenantId: string,
    input: {
      startDate: Date;
      endDate: Date;
      idToExclude?: string | null;
    },
  ) {
    const overlaps = await this.prisma.fiscalYear.findFirst({
      where: {
        tenantId,
        status: { not: ConfigurationStatus.ARCHIVED },
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
      select: { id: true },
    });
    if (overlaps) {
      throw new ConflictException(
        'Fiscal year dates cannot overlap another fiscal year.',
      );
    }
  }

  private async assertNoActiveExchangeRate(
    tenantId: string,
    input: {
      fromCurrency: string;
      toCurrency: string;
      idToExclude: string | null;
    },
  ) {
    const activeRate = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
      },
    });
    if (activeRate) {
      throw new ConflictException(
        'Only one active exchange rate can exist for the same From Currency and To Currency.',
      );
    }
  }

  private validateExchangeRatePair(fromCurrency: string, toCurrency: string) {
    if (fromCurrency === toCurrency) {
      throw new BadRequestException(
        'From Currency and To Currency cannot be the same.',
      );
    }
  }

  private mapExchangeRate(rate: {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    rate: Prisma.Decimal;
    source: ExchangeRateSource;
    isManual: boolean;
    provider: string | null;
    lastFetchedAt: Date | null;
    overrideReason: string | null;
    subStatus: string | null;
    description: string | null;
    status: ConfigurationStatus;
    createdAt: Date;
    updatedAt: Date;
    createdById: string | null;
    updatedById: string | null;
  }) {
    return {
      ...rate,
      rate: rate.rate.toString(),
      rateName: `${rate.fromCurrency} to ${rate.toCurrency}`,
      override: rate.isManual,
      sourceLabel: rate.isManual ? 'Manual Override' : 'Provider',
    };
  }

  private async getExchangeRateProviderStatus(tenantId: string) {
    const lastProviderRate = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        source: ExchangeRateSource.API,
      },
      orderBy: [{ lastFetchedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return {
      providerMode: 'AUTOMATIC',
      provider: lastProviderRate?.provider ?? 'Open Exchange Rates',
      autoFetchWhenMissing: true,
      refreshFrequency: 'ON_DEMAND',
      lastSyncStatus: lastProviderRate ? 'SUCCESS' : 'NEVER_SYNCED',
      lastSyncAt: lastProviderRate?.lastFetchedAt ?? null,
      lastErrorMessage: null,
    };
  }

  private async assertNoDuplicateHoliday(
    tenantId: string,
    calendarId: string,
    name: string,
    date: Date,
    idToExclude: string | null,
  ) {
    const duplicate = await this.prisma.holiday.findFirst({
      where: {
        tenantId,
        holidayCalendarId: calendarId,
        name,
        holidayDate: toUtcDateOnly(date),
        status: { not: 'ARCHIVED' },
        ...(idToExclude ? { id: { not: idToExclude } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Holiday already exists for this calendar and date.',
      );
    }
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function readScope(source: Record<string, unknown>): ScopeInput {
  return {
    organizationId: readNullableString(source.organizationId),
    businessUnitId: readNullableString(source.businessUnitId),
    projectId: readNullableString(source.projectId),
  };
}

function readScopeWithFallback(
  source: Record<string, unknown>,
  existing?: ScopeInput | null,
): ScopeInput {
  return {
    organizationId:
      source.organizationId !== undefined
        ? readNullableString(source.organizationId)
        : (existing?.organizationId ?? null),
    businessUnitId:
      source.businessUnitId !== undefined
        ? readNullableString(source.businessUnitId)
        : (existing?.businessUnitId ?? null),
    projectId:
      source.projectId !== undefined
        ? readNullableString(source.projectId)
        : (existing?.projectId ?? null),
  };
}

function readPayrollRegionScopeWithFallback(
  source: Record<string, unknown>,
  existing?: ScopeInput | null,
): Pick<ScopeInput, 'organizationId' | 'businessUnitId'> {
  return {
    organizationId:
      source.organizationId !== undefined
        ? readNullableString(source.organizationId)
        : (existing?.organizationId ?? null),
    businessUnitId:
      source.businessUnitId !== undefined
        ? readNullableString(source.businessUnitId)
        : (existing?.businessUnitId ?? null),
  };
}

function readDateRange(source: Record<string, unknown>): EffectiveDateRange {
  return {
    effectiveStartDate: readDate(source.effectiveStartDate),
    effectiveEndDate: readDate(source.effectiveEndDate),
  };
}

function readDateRangeWithFallback(
  source: Record<string, unknown>,
  existing?: DateRangeInput | null,
): EffectiveDateRange {
  return {
    effectiveStartDate:
      source.effectiveStartDate !== undefined
        ? readDate(source.effectiveStartDate)
        : (existing?.effectiveStartDate ?? null),
    effectiveEndDate:
      source.effectiveEndDate !== undefined
        ? readDate(source.effectiveEndDate)
        : (existing?.effectiveEndDate ?? null),
  };
}

function mapPayrollRegion<
  T extends {
    businessUnit?: { name: string } | null;
    organization?: { name: string } | null;
  },
>(region: T) {
  return {
    ...region,
    businessUnitName: region.businessUnit?.name ?? null,
    organizationName: region.organization?.name ?? null,
  };
}

function withDefaultShiftTemplateId<
  T extends {
    days?: readonly {
      isWorkingDay: boolean;
      shiftTemplateId: string | null;
    }[];
  },
>(schedule: T) {
  return {
    ...schedule,
    defaultShiftTemplateId: resolveDefaultShiftTemplateId(schedule.days ?? []),
  };
}

function resolveDefaultShiftTemplateId(
  days: readonly {
    isWorkingDay: boolean;
    shiftTemplateId: string | null;
  }[],
) {
  const shiftIds = [
    ...new Set(
      days
        .filter((day) => day.isWorkingDay)
        .map((day) => day.shiftTemplateId)
        .filter((shiftId): shiftId is string => Boolean(shiftId)),
    ),
  ];

  return shiftIds.length === 1 ? shiftIds[0] : null;
}

function readScheduleDays(
  value: unknown,
  tenantId: string,
  defaultShiftTemplateId?: string | null,
) {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultWeekdays().map((dayOfWeek, index) => ({
      tenantId,
      dayOfWeek,
      isWorkingDay: !new Set<WorkWeekday>([
        WorkWeekday.SATURDAY,
        WorkWeekday.SUNDAY,
      ]).has(dayOfWeek),
      shiftTemplateId: new Set<WorkWeekday>([
        WorkWeekday.SATURDAY,
        WorkWeekday.SUNDAY,
      ]).has(dayOfWeek)
        ? null
        : defaultShiftTemplateId,
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
      expectedHours: new Prisma.Decimal(8),
      sortOrder: index,
    }));
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException('Work schedule days must be objects.');
    }
    const row = item as Record<string, unknown>;
    const dayOfWeek = readEnum(row.dayOfWeek, WorkWeekday);
    if (!dayOfWeek)
      throw new BadRequestException('Work schedule day is invalid.');
    return {
      tenantId,
      dayOfWeek,
      isWorkingDay: readBoolean(row.isWorkingDay) ?? true,
      shiftTemplateId: readNullableString(row.shiftTemplateId),
      startTime: readNullableString(row.startTime),
      endTime: readNullableString(row.endTime),
      breakMinutes: readNumber(row.breakMinutes) ?? 0,
      expectedHours: decimalOrNull(row.expectedHours),
      rotationWeek: readNumber(row.rotationWeek),
      sortOrder: readNumber(row.sortOrder) ?? index,
    };
  });
}

function requiredString(value: unknown, message: string) {
  const result = readString(value);
  if (!result) throw new BadRequestException(message);
  return result;
}

function readString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readNullableString(value: unknown) {
  return readString(value);
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function readNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(toDisplayString(value));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Date value is invalid.');
  }
  return toUtcDateOnly(date);
}

function requiredDate(value: unknown, message: string) {
  const date = readDate(value);
  if (!date) throw new BadRequestException(message);
  return date;
}

function readTime(value: unknown, message: string) {
  const time = requiredString(value, message);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new BadRequestException('Time must use 24-hour HH:mm format.');
  }
  return time;
}

function validateDateRange(input: EffectiveDateRange) {
  if (
    input.effectiveStartDate &&
    input.effectiveEndDate &&
    input.effectiveEndDate < input.effectiveStartDate
  ) {
    throw new BadRequestException(
      'Effective end date cannot be before start date.',
    );
  }
}

function normalizeCode(value: unknown, fallback: unknown) {
  const raw =
    readString(value) ?? requiredString(fallback, 'Code is required.');
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTimezone(value: unknown) {
  const timezone = readString(value);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    throw new BadRequestException('Timezone must be a valid IANA timezone ID.');
  }
}

function normalizeCountryCode(value: unknown) {
  const country = readString(value);
  if (!country) return null;
  if (!/^[A-Z]{2}$/i.test(country)) {
    throw new BadRequestException(
      'Country code must be a valid ISO 3166-1 alpha-2 code.',
    );
  }
  return country.toUpperCase();
}

function normalizeCurrencyCode(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException(
      'Currency code must be a valid ISO 4217 code.',
    );
  }
  return currency;
}

function readEnum<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
): T[keyof T] | null {
  const raw = readString(value);
  if (!raw) return null;
  return Object.values(enumObject).includes(raw) ? (raw as T[keyof T]) : null;
}

function readWeekdays(value: unknown) {
  if (!Array.isArray(value)) return null;
  const days = value.map((item) => readEnum(item, WorkWeekday));
  if (days.some((day) => !day)) {
    throw new BadRequestException('One or more weekdays are invalid.');
  }
  return days as WorkWeekday[];
}

function decimalOrNull(value: unknown) {
  const number = readNumber(value);
  return number === null ? null : new Prisma.Decimal(number);
}

function defaultWeekdays() {
  return [
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
    WorkWeekday.SUNDAY,
  ];
}

function toUtcDateOnly(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function overlapWhere(start: Date | null, end: Date | null) {
  const normalizedEnd = end ?? new Date('9999-12-31T00:00:00.000Z');
  const normalizedStart = start ?? new Date('0001-01-01T00:00:00.000Z');
  return [
    {
      effectiveStartDate: { lte: normalizedEnd },
      OR: [
        { effectiveEndDate: null },
        { effectiveEndDate: { gte: normalizedStart } },
      ],
    },
  ];
}

function effectiveDateRangeWhere(date: Date) {
  return [
    {
      OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: date } }],
    },
    { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: date } }] },
  ];
}

function expandHolidayOccurrence(
  holiday: {
    id: string;
    name: string;
    holidayDate: Date;
    isRecurring: boolean;
    recurrenceRule: string | null;
    isHalfDay: boolean;
    halfDayPeriod: HalfDayPeriod | null;
  },
  periodStart: Date,
  periodEnd: Date,
) {
  const baseDate = toUtcDateOnly(holiday.holidayDate);
  if (!holiday.isRecurring) {
    return baseDate >= periodStart && baseDate <= periodEnd
      ? [{ ...holiday, date: baseDate }]
      : [];
  }

  const occurrences: Array<typeof holiday & { date: Date }> = [];
  for (
    let year = periodStart.getUTCFullYear();
    year <= periodEnd.getUTCFullYear();
    year += 1
  ) {
    const occurrenceDate = new Date(
      Date.UTC(year, baseDate.getUTCMonth(), baseDate.getUTCDate()),
    );
    if (occurrenceDate >= periodStart && occurrenceDate <= periodEnd) {
      occurrences.push({
        ...holiday,
        holidayDate: occurrenceDate,
        date: occurrenceDate,
      });
    }
  }
  return occurrences;
}

function handleHolidayCalendarWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'Holiday calendar code or name already exists.',
    );
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2011'
  ) {
    throw new BadRequestException(
      'Holiday calendar date storage is not up to date. Apply the latest database migrations and try again.',
    );
  }
  throw error;
}
