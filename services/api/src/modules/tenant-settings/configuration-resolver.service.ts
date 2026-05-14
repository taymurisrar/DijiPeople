import { Injectable } from '@nestjs/common';
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
      dateFormat: system.dateFormat || organization.dateFormat,
      timeFormat: system.timeFormat,
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
    const [system, organization, payroll, project, employee, businessUnitSettings] =
      await Promise.all([
        this.tenantSettingsResolver.getSystemSettings(context.tenantId),
        this.tenantSettingsResolver.getOrganizationSettings(context.tenantId),
        this.tenantSettingsResolver.getPayrollSettingsForBusinessUnit(
          context.tenantId,
          context.businessUnitId,
        ),
        this.findProject(context),
        this.findEmployee(context),
        this.findBusinessUnitSettings(context),
      ]);

    return (
      readString(employee?.user?.preferencesJson, 'currencyCode') ||
      payroll.defaultCurrency ||
      project?.currencyCode ||
      readString(businessUnitSettings, 'currency') ||
      organization.currency ||
      system.defaultCurrency ||
      'USD'
    );
  }

  async resolveLocale(context: ConfigurationResolutionContext) {
    const system = await this.tenantSettingsResolver.getSystemSettings(
      context.tenantId,
    );
    const employee = await this.findEmployee(context);
    return readString(employee?.user?.preferencesJson, 'locale') || system.locale;
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
        user: {
          select: {
            preferencesJson: true,
          },
        },
      },
    });
  }

  private async findBusinessUnitSettings(context: ConfigurationResolutionContext) {
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
