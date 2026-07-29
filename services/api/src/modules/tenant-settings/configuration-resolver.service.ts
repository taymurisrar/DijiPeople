import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnterpriseConfigurationService } from './enterprise-configuration.service';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';

export type ConfigurationResolutionContext = {
  tenantId: string;
  organizationId?: string | null;
  businessUnitId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  module?: string | null;
  effectiveDate?: Date | null;
};

export type CurrencyResolutionResult = {
  payrollCurrency: string;
  reportingCurrency: string;
  matchedSource:
    | 'PAYROLL_REGION_WORK_SITE'
    | 'PAYROLL_REGION_BUSINESS_UNIT'
    | 'PAYROLL_REGION_ORGANIZATION'
    | 'PAYROLL_REGION_COUNTRY'
    | 'TENANT_PROFILE'
    | 'PLATFORM_FALLBACK';
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  fallbackLevelUsed: number;
  effectiveDate: Date;
};

@Injectable()
export class ConfigurationResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enterpriseConfiguration: EnterpriseConfigurationService,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
  ) {}

  async resolveAppContext(context: ConfigurationResolutionContext) {
    const [timezone, currency, system, organization, timesheets, payroll] =
      await Promise.all([
        this.resolveTimezone(context),
        this.resolveCurrency(context),
        this.tenantSettingsResolver.getSystemSettings(context.tenantId),
        this.tenantSettingsResolver.getOrganizationSettings(context.tenantId),
        this.resolveTimesheetPolicy(context),
        this.resolvePayrollRegion(context),
      ]);

    return {
      timezone,
      currency,
      locale: system.locale,
      dateFormat: organization.dateFormat || system.dateFormat,
      timeFormat: organization.timeFormat || system.timeFormat,
      numberFormat: system.locale,
      firstDayOfWeek: system.defaultWeekStartDay || organization.weekStartsOn,
      holidayCalendarId: await this.resolveHolidayCalendar(context),
      workScheduleId: await this.resolveWorkSchedule(context),
      timesheetPolicy: timesheets,
      payrollRegion: payroll,
    };
  }

  async resolveTimezone(context: ConfigurationResolutionContext) {
    const [system, organization, project, employee, businessUnitSettings] =
      await Promise.all([
        this.tenantSettingsResolver.getSystemSettings(context.tenantId),
        this.tenantSettingsResolver.getOrganizationSettings(context.tenantId),
        this.findProject(context),
        this.findEmployee(context),
        this.findBusinessUnitSettings(context),
      ]);

    return (
      readString(employee?.user?.preferencesJson, 'timezone') ||
      project?.timezone ||
      readString(businessUnitSettings, 'timezone') ||
      organization.timezone ||
      system.defaultTimezone ||
      'UTC'
    );
  }

  async resolveCurrency(context: ConfigurationResolutionContext) {
    const resolved = await this.resolvePayrollCurrency(context);
    return resolved.payrollCurrency;
  }

  async resolvePayrollCurrency(
    context: ConfigurationResolutionContext,
  ): Promise<CurrencyResolutionResult> {
    const effectiveDate = context.effectiveDate ?? new Date();
    const [system, organization, employee] = await Promise.all([
      this.tenantSettingsResolver.getSystemSettings(context.tenantId),
      this.tenantSettingsResolver.getOrganizationSettings(context.tenantId),
      this.findEmployee(context),
    ]);

    const businessUnitId = context.businessUnitId ?? employee?.businessUnitId;
    const organizationId =
      context.organizationId ?? employee?.businessUnit?.organizationId;
    const locationId = employee?.locationId ?? null;
    const countryCode =
      employee?.location?.country ||
      employee?.country ||
      employee?.countryLookup?.code ||
      null;

    const matchers: Array<{
      source: CurrencyResolutionResult['matchedSource'];
      where: Prisma.PayrollRegionWhereInput | undefined;
      fallbackLevel: number;
    }> = [
      {
        source: 'PAYROLL_REGION_WORK_SITE',
        where: locationId ? { locationId } : undefined,
        fallbackLevel: 2,
      },
      {
        source: 'PAYROLL_REGION_BUSINESS_UNIT',
        where: businessUnitId ? { businessUnitId } : undefined,
        fallbackLevel: 3,
      },
      {
        source: 'PAYROLL_REGION_ORGANIZATION',
        where: organizationId ? { organizationId } : undefined,
        fallbackLevel: 3,
      },
      {
        source: 'PAYROLL_REGION_COUNTRY',
        where: countryCode ? { countryCode } : undefined,
        fallbackLevel: 4,
      },
    ];

    for (const matcher of matchers) {
      if (!matcher.where) continue;
      const region = await this.findPayrollRegion(
        context.tenantId,
        effectiveDate,
        matcher.where,
      );
      if (!region) continue;
      return {
        payrollCurrency: region.currencyCode,
        reportingCurrency: region.reportingCurrencyCode ?? region.currencyCode,
        matchedSource: matcher.source,
        matchedRuleId: region.id,
        matchedRuleName: region.name,
        fallbackLevelUsed: matcher.fallbackLevel,
        effectiveDate,
      };
    }

    if (organization.currency) {
      return {
        payrollCurrency: organization.currency,
        reportingCurrency: organization.currency,
        matchedSource: 'TENANT_PROFILE',
        matchedRuleId: null,
        matchedRuleName: null,
        fallbackLevelUsed: 5,
        effectiveDate,
      };
    }

    return {
      payrollCurrency: system.defaultCurrency || 'USD',
      reportingCurrency: system.defaultCurrency || 'USD',
      matchedSource: 'PLATFORM_FALLBACK',
      matchedRuleId: null,
      matchedRuleName: null,
      fallbackLevelUsed: 6,
      effectiveDate,
    };
  }

  async resolveLocale(context: ConfigurationResolutionContext) {
    const system = await this.tenantSettingsResolver.getSystemSettings(
      context.tenantId,
    );
    const employee = await this.findEmployee(context);
    return (
      readString(employee?.user?.preferencesJson, 'locale') || system.locale
    );
  }

  async resolveDateFormat(context: ConfigurationResolutionContext) {
    const system = await this.tenantSettingsResolver.getSystemSettings(
      context.tenantId,
    );
    const employee = await this.findEmployee(context);
    return (
      readString(employee?.user?.preferencesJson, 'dateFormat') ||
      system.dateFormat
    );
  }

  async resolveTimeFormat(context: ConfigurationResolutionContext) {
    const system = await this.tenantSettingsResolver.getSystemSettings(
      context.tenantId,
    );
    const employee = await this.findEmployee(context);
    return (
      readString(employee?.user?.preferencesJson, 'timeFormat') ||
      system.timeFormat
    );
  }

  async resolveHolidayCalendar(context: ConfigurationResolutionContext) {
    const project = await this.findProject(context);
    if (project?.holidayCalendarId) return project.holidayCalendarId;

    const businessUnitSettings = await this.findBusinessUnitSettings(context);
    return (
      (await this.enterpriseConfiguration.resolveHolidayCalendarId({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        businessUnitId: context.businessUnitId,
        projectId: context.projectId,
        effectiveDate: context.effectiveDate,
      })) ||
      readString(businessUnitSettings, 'holidayCalendarId') ||
      null
    );
  }

  async resolveWorkSchedule(context: ConfigurationResolutionContext) {
    const project = await this.findProject(context);
    if (project?.workScheduleId) return project.workScheduleId;

    const businessUnitSettings = await this.findBusinessUnitSettings(context);
    return (
      (await this.enterpriseConfiguration.resolveWorkScheduleId({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        businessUnitId: context.businessUnitId,
        projectId: context.projectId,
        effectiveDate: context.effectiveDate,
      })) ||
      readString(businessUnitSettings, 'workScheduleId') ||
      null
    );
  }

  resolveTimesheetPolicy(context: ConfigurationResolutionContext) {
    return this.tenantSettingsResolver.getTimesheetSettingsForBusinessUnit(
      context.tenantId,
      context.businessUnitId,
    );
  }

  resolvePayrollRegion(context: ConfigurationResolutionContext) {
    return this.tenantSettingsResolver.getPayrollSettingsForBusinessUnit(
      context.tenantId,
      context.businessUnitId,
    );
  }

  private findPayrollRegion(
    tenantId: string,
    effectiveDate: Date,
    scopeWhere: Prisma.PayrollRegionWhereInput,
  ) {
    return this.prisma.payrollRegion.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...scopeWhere,
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
      orderBy: [{ effectiveStartDate: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        currencyCode: true,
        reportingCurrencyCode: true,
      },
    });
  }

  private findProject(context: ConfigurationResolutionContext) {
    if (!context.projectId) return null;
    return this.prisma.project.findFirst({
      where: { tenantId: context.tenantId, id: context.projectId },
      select: {
        id: true,
        timezone: true,
        currencyCode: true,
        holidayCalendarId: true,
        workScheduleId: true,
      },
    });
  }

  private findEmployee(context: ConfigurationResolutionContext) {
    if (!context.employeeId) return null;
    return this.prisma.employee.findFirst({
      where: { tenantId: context.tenantId, id: context.employeeId },
      select: {
        id: true,
        businessUnitId: true,
        locationId: true,
        country: true,
        countryLookup: { select: { code: true } },
        businessUnit: { select: { organizationId: true } },
        location: { select: { country: true } },
        user: {
          select: {
            preferencesJson: true,
          },
        },
      },
    });
  }

  private async findBusinessUnitSettings(
    context: ConfigurationResolutionContext,
  ) {
    if (!context.businessUnitId) return null;
    const businessUnit = await this.prisma.businessUnit.findFirst({
      where: { tenantId: context.tenantId, id: context.businessUnitId },
      select: { settingsJson: true },
    });
    return businessUnit?.settingsJson ?? null;
  }
}

function readString(source: unknown, key: string) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
