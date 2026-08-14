import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ALL_ATTENDANCE_METHODS,
  AttendancePolicyResolverService,
} from '../../attendance-engine/attendance-policy-resolver.service';

/**
 * Everything the Work Site configuration screen needs in order to tell the
 * truth, in one read.
 *
 * WHY IT EXISTS. The screen shows what a work site resolves to, not just what
 * was typed into it: whether attendance is on here, which layer decided that,
 * how many people are authorised, which terminals stand at the site and whether
 * their gateway has ever reported in. Every one of those answers already exists
 * somewhere in the platform, and inventing a second copy in the web app would
 * be the fastest way to have the settings page disagree with the engine.
 *
 * READ ONLY. Nothing here writes, enqueues or reconciles. The Work Site page
 * configures inputs to the attendance engine; it does not participate in it.
 */
@Injectable()
export class WorkSiteReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: AttendancePolicyResolverService,
  ) {}

  async getReadiness(tenantId: string, workSiteId: string) {
    const site = await this.prisma.location.findFirst({
      where: { tenantId, id: workSiteId },
      /*
       * The schedule and calendar relations are loaded by NAME ONLY, and only so
       * the Advanced tab can tell an administrator that legacy values are still
       * stored and no longer used. They are NOT attendance inputs: an employee's
       * schedule and calendar resolve down the organizational hierarchy
       * (Employee -> Team -> Department -> Business Unit -> Organization ->
       * Tenant), because one office holds teams working different hours and
       * people following different regional calendars.
       */
      include: {
        defaultWorkSchedule: { select: { name: true } },
        holidayCalendar: { select: { name: true } },
      },
    });

    if (!site) {
      throw new NotFoundException('Work site was not found for this tenant.');
    }

    const tenantPolicy = await this.policyResolver.resolve(
      tenantId,
      site.organizationId,
    );
    const effective = this.policyResolver.resolveWorkSite(site, tenantPolicy);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      assignedEmployeeCount,
      primaryOnlyEmployeeCount,
      devices,
      recentSessionCount,
    ] = await Promise.all([
      this.prisma.employeeWorkSite.count({
        where: { tenantId, locationId: workSiteId, status: 'ACTIVE' },
      }),
      /*
       * The resolver treats `Employee.locationId` as an implicit authorisation,
       * so an employee whose home site is this one counts even without an
       * explicit assignment row. Counted separately and deduplicated below
       * rather than summed, because most employees will have both.
       */
      this.prisma.employee.count({
        where: {
          tenantId,
          locationId: workSiteId,
          workSiteAssignments: {
            none: { locationId: workSiteId, status: 'ACTIVE' },
          },
        },
      }),
      this.prisma.attendanceDevice.findMany({
        where: { tenantId, locationId: workSiteId },
        select: {
          id: true,
          name: true,
          code: true,
          provider: true,
          model: true,
          status: true,
          isEnabled: true,
          healthStatus: true,
          lastSeenAt: true,
          lastSuccessfulSyncAt: true,
          gateway: {
            select: {
              id: true,
              name: true,
              status: true,
              lastHeartbeatAt: true,
              lastSuccessfulUploadAt: true,
            },
          },
        },
        orderBy: [{ isEnabled: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.attendanceSession.count({
        where: {
          tenantId,
          workSiteId,
          startedAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    const gateways = dedupeGateways(devices);

    return {
      workSite: {
        id: site.id,
        name: site.name,
        code: site.code,
        city: site.city,
        state: site.state,
        country: site.country,
        timezone: site.timezone,
        latitude: site.latitude,
        longitude: site.longitude,
        isActive: site.isActive,
        validFrom: site.validFrom,
        validTo: site.validTo,
        allowedRadiusMeters: site.allowedRadiusMeters,
        maximumAccuracyMeters: site.maximumAccuracyMeters,
        attendanceEnabled: site.attendanceEnabled,
        allowedAttendanceMethods: site.allowedAttendanceMethods,
        webAttendancePolicy: site.webAttendancePolicy,
        devicePolicy: site.devicePolicy,
        webFallbackEnabled: site.webFallbackEnabled,
        defaultWorkScheduleId: site.defaultWorkScheduleId,
        holidayCalendarId: site.holidayCalendarId,
        organizationId: site.organizationId,
      },
      /** What this site resolves to today, and which layer decided each value. */
      effective: {
        attendanceEnabled: effective.attendanceEnabled,
        devicePolicy: effective.devicePolicy,
        webAttendancePolicy: effective.webAttendancePolicy,
        webFallbackEnabled: effective.webFallbackEnabled,
        radiusMeters: effective.radiusMeters,
        maximumAccuracyMeters: effective.maximumAccuracyMeters,
        allowedMethods: effective.allowedMethods,
        sources: effective.sources,
      },
      /*
       * What the site would inherit if every override were cleared. Sent so the
       * override control can name the inherited value instead of leaving the
       * administrator to guess it.
       */
      tenantDefaults: {
        attendanceEnabled: tenantPolicy.integrationEnabled,
        // The neutral default the resolver applies when no site override and no
        // tenant column exists for device policy.
        devicePolicy: 'DEVICE_PREFERRED' as const,
        webAttendancePolicy: tenantPolicy.officeWebAttendancePolicy,
        webFallbackEnabled: tenantPolicy.webFallbackPolicy !== 'NEVER',
        webFallbackPolicy: tenantPolicy.webFallbackPolicy,
        radiusMeters: tenantPolicy.defaultRadiusMeters,
        maximumAccuracyMeters: tenantPolicy.maximumAccuracyMeters,
        // There is no tenant-level method column: unrestricted is the inherited
        // position, and the site narrows it.
        allowedMethods: [...ALL_ATTENDANCE_METHODS],
      },
      counts: {
        authorizedEmployees: assignedEmployeeCount + primaryOnlyEmployeeCount,
        assignedEmployees: assignedEmployeeCount,
        primaryOnlyEmployees: primaryOnlyEmployeeCount,
        attendanceDevices: devices.length,
        enabledAttendanceDevices: devices.filter((device) => device.isEnabled)
          .length,
        recentAttendanceSessions: recentSessionCount,
      },
      devices,
      gateways,
      /*
       * Reported so the Advanced tab can say these values exist and do nothing.
       * A stored value that is invisible and inert is what makes an
       * administrator distrust the screen, so it is stated once, plainly, where
       * it cannot be mistaken for live configuration.
       */
      legacyWorkPlanning: {
        defaultWorkScheduleName: site.defaultWorkSchedule?.name ?? null,
        holidayCalendarName: site.holidayCalendar?.name ?? null,
      },
    };
  }
}

type DeviceWithGateway = {
  gateway: {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    lastSuccessfulUploadAt: Date | null;
  } | null;
};

function dedupeGateways(devices: readonly DeviceWithGateway[]) {
  const seen = new Map<string, NonNullable<DeviceWithGateway['gateway']>>();

  for (const device of devices) {
    if (device.gateway && !seen.has(device.gateway.id)) {
      seen.set(device.gateway.id, device.gateway);
    }
  }

  return [...seen.values()];
}
