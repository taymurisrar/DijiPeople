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
  PayCycle,
  Prisma,
  ProjectApprovalMode,
  WeekendPolicy,
  WorkWeekModel,
  WorkWeekday,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

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
          isDefault: readBoolean(body.isDefault) ?? false,
          status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
          effectiveStartDate: dateRange.effectiveStartDate,
          effectiveEndDate: dateRange.effectiveEndDate,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        include: { holidays: true, assignments: true },
      });

      await this.audit(currentUser, 'holiday-calendar.create', 'HolidayCalendar', calendar.id, null, calendar);
      return calendar;
    } catch (error) {
      handleUniqueError(error, 'Holiday calendar code or name already exists.');
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
    await this.assertNoOverlappingHolidayCalendar(currentUser.tenantId, {
      ...scope,
      ...dateRange,
      idToExclude: id,
    });

    try {
      const calendar = await this.prisma.holidayCalendar.update({
        where: { id },
        data: {
          ...(body.name !== undefined
            ? { name: requiredString(body.name, 'Holiday calendar name is required.') }
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
          ...(body.timezone !== undefined
            ? { timezone: normalizeTimezone(body.timezone) ?? 'UTC' }
            : {}),
          ...(body.countryCode !== undefined
            ? { countryCode: normalizeCountryCode(body.countryCode) }
            : {}),
          ...(body.regionCode !== undefined
            ? { regionCode: readNullableString(body.regionCode) }
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

      await this.audit(currentUser, 'holiday-calendar.update', 'HolidayCalendar', id, existing, calendar);
      return calendar;
    } catch (error) {
      handleUniqueError(error, 'Holiday calendar code or name already exists.');
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
    await this.audit(currentUser, 'holiday-calendar.archive', 'HolidayCalendar', id, existing, {
      ...existing,
      status: 'ARCHIVED',
    });
    return { id, archived: true };
  }

  async listHolidays(tenantId: string, calendarId: string, query: Record<string, unknown>) {
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
    const holidayDate = requiredDate(body.holidayDate, 'Holiday date is required.');
    await this.assertNoDuplicateHoliday(
      currentUser.tenantId,
      calendarId,
      requiredString(body.name, 'Holiday name is required.'),
      holidayDate,
      null,
    );

    const holiday = await this.prisma.holiday.create({
      data: {
        tenantId: currentUser.tenantId,
        holidayCalendarId: calendarId,
        name: requiredString(body.name, 'Holiday name is required.'),
        description: readNullableString(body.description),
        holidayDate,
        type: readEnum(body.type, HolidayType) ?? 'PUBLIC',
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

    await this.audit(currentUser, 'holiday.create', 'Holiday', holiday.id, null, holiday);
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
          ? { status: readEnum(body.status, ConfigurationStatus) ?? existing.status }
          : {}),
        updatedById: currentUser.userId,
      },
    });
    await this.audit(currentUser, 'holiday.update', 'Holiday', holidayId, existing, holiday);
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
    await this.audit(currentUser, 'holiday.archive', 'Holiday', holidayId, existing, {
      ...existing,
      status: 'ARCHIVED',
    });
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
    await this.audit(currentUser, 'holiday-calendar.assign', 'HolidayCalendarAssignment', assignment.id, null, assignment);
    return assignment;
  }

  async listWorkSchedules(tenantId: string, query: Record<string, unknown>) {
    const search = readString(query.search);
    return this.prisma.workSchedule.findMany({
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
      include: { days: { orderBy: [{ sortOrder: 'asc' }] }, shiftTemplates: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createWorkSchedule(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = this.readWorkScheduleData(currentUser, body);
    await this.assertValidScopedReferences(currentUser.tenantId, data.scope);
    const schedule = await this.prisma.workSchedule.create({
      data: {
        ...data.create,
        days: {
          create: readScheduleDays(body.days, currentUser.tenantId),
        },
      },
      include: { days: true, shiftTemplates: true },
    });
    await this.audit(currentUser, 'work-schedule.create', 'WorkSchedule', schedule.id, null, schedule);
    return schedule;
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
    const schedule = await this.prisma.$transaction(async (tx) => {
      if (Array.isArray(body.days)) {
        await tx.workScheduleDay.deleteMany({ where: { workScheduleId: id } });
      }
      return tx.workSchedule.update({
        where: { id },
        data: {
          ...data.update,
          ...(Array.isArray(body.days)
            ? { days: { create: readScheduleDays(body.days, currentUser.tenantId) } }
            : {}),
        },
        include: { days: true, shiftTemplates: true },
      });
    });
    await this.audit(currentUser, 'work-schedule.update', 'WorkSchedule', id, existing, schedule);
    return schedule;
  }

  async deleteWorkSchedule(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.workSchedule.findFirst({
      where: { tenantId: currentUser.tenantId, id },
    });
    if (!existing) throw new NotFoundException('Work schedule was not found.');
    await this.prisma.workSchedule.update({
      where: { id },
      data: { status: 'ARCHIVED', isActive: false, updatedById: currentUser.userId },
    });
    await this.audit(currentUser, 'work-schedule.archive', 'WorkSchedule', id, existing, {
      ...existing,
      status: 'ARCHIVED',
    });
    return { id, archived: true };
  }

  async listPayrollRegions(tenantId: string) {
    return this.prisma.payrollRegion.findMany({
      where: { tenantId },
      include: { holidayCalendar: true, workSchedule: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createPayrollRegion(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = await this.readPayrollRegionData(currentUser.tenantId, body);
    const region = await this.prisma.payrollRegion.create({
      data: {
        ...data,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      include: { holidayCalendar: true, workSchedule: true },
    });
    await this.audit(currentUser, 'payroll-region.create', 'PayrollRegion', region.id, null, region);
    return region;
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
    const data = await this.readPayrollRegionData(currentUser.tenantId, body, existing);
    const region = await this.prisma.payrollRegion.update({
      where: { id },
      data: { ...data, updatedById: currentUser.userId },
      include: { holidayCalendar: true, workSchedule: true },
    });
    await this.audit(currentUser, 'payroll-region.update', 'PayrollRegion', id, existing, region);
    return region;
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
    await this.audit(currentUser, 'payroll-region.archive', 'PayrollRegion', id, existing, {
      ...existing,
      status: 'ARCHIVED',
    });
    return { id, archived: true };
  }

  async listCurrencyConfigurations(tenantId: string) {
    return this.prisma.currencyConfiguration.findMany({
      where: { tenantId },
      orderBy: [{ effectiveStartDate: 'desc' }],
    });
  }

  async upsertCurrencyConfiguration(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const scope = readScope(body);
    const effectiveStartDate = requiredDate(
      body.effectiveStartDate,
      'Effective start date is required.',
    );
    const effectiveEndDate = readDate(body.effectiveEndDate);
    validateDateRange({ effectiveStartDate, effectiveEndDate });
    await this.assertNoOverlappingCurrencyConfiguration(currentUser.tenantId, {
      ...scope,
      effectiveStartDate,
      effectiveEndDate,
      idToExclude: readString(body.id),
    });
    const payload = {
      tenantId: currentUser.tenantId,
      ...scope,
      transactionalCurrency: normalizeCurrencyCode(
        requiredString(body.transactionalCurrency, 'Transactional currency is required.'),
      ),
      reportingCurrency: normalizeCurrencyCode(
        requiredString(body.reportingCurrency, 'Reporting currency is required.'),
      ),
      effectiveStartDate,
      effectiveEndDate,
      status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
      updatedById: currentUser.userId,
    };

    const id = readString(body.id);
    const existing = id
      ? await this.prisma.currencyConfiguration.findFirst({
          where: { tenantId: currentUser.tenantId, id },
        })
      : null;
    const config = existing
      ? await this.prisma.currencyConfiguration.update({
          where: { id: existing.id },
          data: payload,
        })
      : await this.prisma.currencyConfiguration.create({
          data: { ...payload, createdById: currentUser.userId },
        });
    await this.audit(currentUser, existing ? 'currency-configuration.update' : 'currency-configuration.create', 'CurrencyConfiguration', config.id, existing, config);
    return config;
  }

  async listExchangeRates(tenantId: string, query: Record<string, unknown>) {
    return this.prisma.exchangeRateSnapshot.findMany({
      where: {
        tenantId,
        ...(readString(query.fromCurrency)
          ? { fromCurrency: normalizeCurrencyCode(readString(query.fromCurrency)!) }
          : {}),
        ...(readString(query.toCurrency)
          ? { toCurrency: normalizeCurrencyCode(readString(query.toCurrency)!) }
          : {}),
      },
      orderBy: [{ effectiveDate: 'desc' }],
      take: Math.min(readNumber(query.take) ?? 100, 500),
    });
  }

  async createExchangeRate(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException('Exchange rate must be greater than zero.');
    }
    const snapshot = await this.prisma.exchangeRateSnapshot.create({
      data: {
        tenantId: currentUser.tenantId,
        fromCurrency: normalizeCurrencyCode(
          requiredString(body.fromCurrency, 'From currency is required.'),
        ),
        toCurrency: normalizeCurrencyCode(
          requiredString(body.toCurrency, 'To currency is required.'),
        ),
        rate: new Prisma.Decimal(rate),
        effectiveDate: requiredDate(body.effectiveDate, 'Effective date is required.'),
        source: readEnum(body.source, ExchangeRateSource) ?? 'MANUAL',
        isManual: readBoolean(body.isManual) ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });
    await this.audit(currentUser, 'exchange-rate.create', 'ExchangeRateSnapshot', snapshot.id, null, snapshot);
    return snapshot;
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
    const direct = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency: from,
        toCurrency: to,
        effectiveDate: { lte: effectiveDate },
      },
      orderBy: [{ effectiveDate: 'desc' }],
    });
    if (direct) return direct.rate;
    const inverse = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency: to,
        toCurrency: from,
        effectiveDate: { lte: effectiveDate },
      },
      orderBy: [{ effectiveDate: 'desc' }],
    });
    if (inverse) return new Prisma.Decimal(1).div(inverse.rate);
    throw new BadRequestException(`No exchange rate is configured for ${from} to ${to}.`);
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
          input.businessUnitId ? { businessUnitId: input.businessUnitId } : undefined,
          input.organizationId ? { organizationId: input.organizationId } : undefined,
          { organizationId: null, businessUnitId: null, projectId: null, isDefault: true },
        ].filter(Boolean) as Prisma.HolidayCalendarAssignmentWhereInput[],
        AND: effectiveDateRangeWhere(effectiveDate),
      },
      orderBy: [{ projectId: 'desc' }, { businessUnitId: 'desc' }, { organizationId: 'desc' }, { isDefault: 'desc' }],
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
    organizationId?: string | null;
    businessUnitId?: string | null;
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

    const schedule = await this.prisma.workSchedule.findFirst({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        isActive: true,
        OR: [
          input.projectId ? { projectId: input.projectId } : undefined,
          input.businessUnitId ? { businessUnitId: input.businessUnitId } : undefined,
          input.organizationId ? { organizationId: input.organizationId } : undefined,
          { organizationId: null, businessUnitId: null, projectId: null, isDefault: true },
        ].filter(Boolean) as Prisma.WorkScheduleWhereInput[],
        AND: effectiveDateRangeWhere(effectiveDate),
      },
      orderBy: [{ projectId: 'desc' }, { businessUnitId: 'desc' }, { organizationId: 'desc' }, { isDefault: 'desc' }],
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
      timezone: string;
      standardStartTime: string;
      standardEndTime: string;
      weeklyWorkDays: WorkWeekday[];
      effectiveStartDate?: Date | null;
      effectiveEndDate?: Date | null;
    },
  ) {
    const scope = readScopeWithFallback(body, existing);
    const dateRange = readDateRangeWithFallback(body, existing);
    validateDateRange(dateRange);
    const weeklyWorkDays = readWeekdays(body.weeklyWorkDays) ?? existing?.weeklyWorkDays ?? defaultWeekdays();
    const create = {
      tenantId: currentUser.tenantId,
      ...scope,
      name: requiredString(body.name ?? existing?.name, 'Work schedule name is required.'),
      code: normalizeCode(body.code ?? existing?.code, body.name ?? existing?.name),
      description: readNullableString(body.description),
      timezone: normalizeTimezone(body.timezone ?? existing?.timezone) ?? 'UTC',
      workWeekModel: readEnum(body.workWeekModel, WorkWeekModel) ?? 'FIVE_DAY',
      weeklyWorkDays,
      standardStartTime: readString(body.standardStartTime) ?? existing?.standardStartTime ?? '09:00',
      standardEndTime: readString(body.standardEndTime) ?? existing?.standardEndTime ?? '17:00',
      minHoursPerDay: decimalOrNull(body.minHoursPerDay),
      standardHoursPerWeek: decimalOrNull(body.standardHoursPerWeek),
      flexibleHours: readBoolean(body.flexibleHours) ?? false,
      shiftBased: readBoolean(body.shiftBased) ?? false,
      graceMinutes: readNumber(body.graceMinutes),
      isDefault: readBoolean(body.isDefault) ?? false,
      isActive: readBoolean(body.isActive) ?? true,
      status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
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

  private async readPayrollRegionData(
    tenantId: string,
    body: Record<string, unknown>,
    existing?: {
      name: string;
      code: string;
      organizationId: string | null;
      businessUnitId: string | null;
      currencyCode: string;
      timezone: string;
    },
  ) {
    const scope = readScopeWithFallback(body, existing);
    await this.assertValidScopedReferences(tenantId, scope);
    const holidayCalendarId = readNullableString(body.holidayCalendarId);
    const workScheduleId = readNullableString(body.workScheduleId);
    if (holidayCalendarId) {
      await this.findHolidayCalendarOrThrow(tenantId, holidayCalendarId);
    }
    if (workScheduleId) {
      const schedule = await this.prisma.workSchedule.findFirst({
        where: { tenantId, id: workScheduleId },
      });
      if (!schedule) throw new BadRequestException('Work schedule was not found.');
    }
    return {
      tenantId,
      ...scope,
      name: requiredString(body.name ?? existing?.name, 'Payroll region name is required.'),
      code: normalizeCode(body.code ?? existing?.code, body.name ?? existing?.name),
      currencyCode: normalizeCurrencyCode(
        requiredString(body.currencyCode ?? existing?.currencyCode, 'Currency code is required.'),
      ),
      reportingCurrencyCode: body.reportingCurrencyCode
        ? normalizeCurrencyCode(String(body.reportingCurrencyCode))
        : null,
      timezone: normalizeTimezone(body.timezone ?? existing?.timezone) ?? 'UTC',
      payCycle: readEnum(body.payCycle, PayCycle) ?? 'MONTHLY',
      taxRegion: readNullableString(body.taxRegion),
      overtimeRulesJson: (body.overtimeRulesJson ?? undefined) as Prisma.InputJsonValue | undefined,
      weekendPolicy: readEnum(body.weekendPolicy, WeekendPolicy) ?? 'SATURDAY_SUNDAY',
      weekendDays: readWeekdays(body.weekendDays) ?? [WorkWeekday.SATURDAY, WorkWeekday.SUNDAY],
      holidayCalendarId,
      workScheduleId,
      isDefault: readBoolean(body.isDefault) ?? false,
      status: readEnum(body.status, ConfigurationStatus) ?? 'ACTIVE',
    } satisfies Prisma.PayrollRegionUncheckedCreateInput;
  }

  private async findHolidayCalendarOrThrow(tenantId: string, id: string) {
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { tenantId, id },
      include: { holidays: true, assignments: true },
    });
    if (!calendar) throw new NotFoundException('Holiday calendar was not found.');
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

  private async assertValidScopedReferences(tenantId: string, scope: ScopeInput) {
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
      if (!exists) throw new BadRequestException('Business unit was not found.');
    }
    if (scope.projectId) {
      const exists = await this.prisma.project.count({
        where: { tenantId, id: scope.projectId },
      });
      if (!exists) throw new BadRequestException('Project was not found.');
    }
  }

  private async assertNoOverlappingHolidayCalendar(
    tenantId: string,
    input: ScopeInput &
      EffectiveDateRange & {
        idToExclude: string | null;
      },
  ) {
    const overlaps = await this.prisma.holidayCalendar.findFirst({
      where: {
        tenantId,
        status: { not: 'ARCHIVED' },
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        organizationId: input.organizationId ?? null,
        businessUnitId: input.businessUnitId ?? null,
        projectId: input.projectId ?? null,
        OR: overlapWhere(input.effectiveStartDate, input.effectiveEndDate),
      },
    });
    if (overlaps) {
      throw new ConflictException(
        'Another holiday calendar already overlaps this scope and effective date range.',
      );
    }
  }

  private async assertNoOverlappingCurrencyConfiguration(
    tenantId: string,
    input: ScopeInput &
      EffectiveDateRange & {
        idToExclude: string | null;
      },
  ) {
    const overlaps = await this.prisma.currencyConfiguration.findFirst({
      where: {
        tenantId,
        status: { not: 'ARCHIVED' },
        ...(input.idToExclude ? { id: { not: input.idToExclude } } : {}),
        organizationId: input.organizationId ?? null,
        businessUnitId: input.businessUnitId ?? null,
        OR: overlapWhere(input.effectiveStartDate, input.effectiveEndDate),
      },
    });
    if (overlaps) {
      throw new ConflictException(
        'Another currency configuration already overlaps this scope and date range.',
      );
    }
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
      throw new ConflictException('Holiday already exists for this calendar and date.');
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
        : existing?.organizationId ?? null,
    businessUnitId:
      source.businessUnitId !== undefined
        ? readNullableString(source.businessUnitId)
        : existing?.businessUnitId ?? null,
    projectId:
      source.projectId !== undefined
        ? readNullableString(source.projectId)
        : existing?.projectId ?? null,
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
        : (existing?.effectiveStartDate as Date | null | undefined) ?? null,
    effectiveEndDate:
      source.effectiveEndDate !== undefined
        ? readDate(source.effectiveEndDate)
        : (existing?.effectiveEndDate as Date | null | undefined) ?? null,
  };
}

function readScheduleDays(value: unknown, tenantId: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultWeekdays().map((dayOfWeek, index) => ({
      tenantId,
      dayOfWeek,
      isWorkingDay: !new Set<WorkWeekday>([
        WorkWeekday.SATURDAY,
        WorkWeekday.SUNDAY,
      ]).has(dayOfWeek),
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
    if (!dayOfWeek) throw new BadRequestException('Work schedule day is invalid.');
    return {
      tenantId,
      dayOfWeek,
      isWorkingDay: readBoolean(row.isWorkingDay) ?? true,
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
  const date = new Date(String(value));
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

function validateDateRange(input: EffectiveDateRange) {
  if (
    input.effectiveStartDate &&
    input.effectiveEndDate &&
    input.effectiveEndDate < input.effectiveStartDate
  ) {
    throw new BadRequestException('Effective end date cannot be before start date.');
  }
}

function normalizeCode(value: unknown, fallback: unknown) {
  const raw = readString(value) ?? requiredString(fallback, 'Code is required.');
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
    throw new BadRequestException('Country code must be a valid ISO 3166-1 alpha-2 code.');
  }
  return country.toUpperCase();
}

function normalizeCurrencyCode(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException('Currency code must be a valid ISO 4217 code.');
  }
  return currency;
}

function readEnum<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
): T[keyof T] | null {
  const raw = readString(value);
  if (!raw) return null;
  return Object.values(enumObject).includes(raw)
    ? (raw as T[keyof T])
    : null;
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
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function overlapWhere(start: Date | null, end: Date | null) {
  const normalizedEnd = end ?? new Date('9999-12-31T00:00:00.000Z');
  const normalizedStart = start ?? new Date('0001-01-01T00:00:00.000Z');
  return [
    {
      effectiveStartDate: { lte: normalizedEnd },
      OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: normalizedStart } }],
    },
  ];
}

function effectiveDateRangeWhere(date: Date) {
  return [
    { OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: date } }] },
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
  for (let year = periodStart.getUTCFullYear(); year <= periodEnd.getUTCFullYear(); year += 1) {
    const occurrenceDate = new Date(Date.UTC(year, baseDate.getUTCMonth(), baseDate.getUTCDate()));
    if (occurrenceDate >= periodStart && occurrenceDate <= periodEnd) {
      occurrences.push({ ...holiday, holidayDate: occurrenceDate, date: occurrenceDate });
    }
  }
  return occurrences;
}

function handleUniqueError(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
