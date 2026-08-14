import { Injectable } from '@nestjs/common';
import {
  AttendanceMethod,
  EmployeeWorkMode,
  WorkSiteDevicePolicy,
  WorkSiteWebAttendancePolicy,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import type { DirectionStrategy } from './punch-interpreter.service';
import type { SessionBuildPolicy } from './attendance-session-builder.service';

/**
 * The one place attendance policy is decided.
 *
 * WHY IT EXISTS. Without it, `if (employee.workMode === ...)` and
 * `if (tenant.setting ...)` and `if (location.override ...)` spread across
 * controllers, and the same question gets three subtly different answers in
 * three places. Every caller in the engine asks this service instead, and every
 * answer carries where it came from so a disputed decision can be explained to
 * the administrator who configured it.
 *
 * RESOLUTION ORDER, applied per setting, most specific first:
 *
 *   work site override  ->  organization setting  ->  tenant setting
 *
 * The work site layer only exists for the settings Phase 1 deliberately modelled
 * as explicit override columns on Location. There is no hidden inheritance for
 * anything else: a setting with no override column resolves through the existing
 * tenant -> organization chain and nowhere else.
 */

export interface EffectiveAttendancePolicy {
  /** False switches the whole attendance platform off for this tenant. */
  integrationEnabled: boolean;
  /** The engine ignores days before this. Null means no cutover. */
  engineEffectiveFrom: Date | null;

  // --- geofence -------------------------------------------------------------
  defaultRadiusMeters: number;
  maximumAccuracyMeters: number | null;

  // --- web attendance -------------------------------------------------------
  webAttendancePolicy: 'ALLOWED' | 'DISALLOWED' | 'FALLBACK_ONLY';
  officeWebAttendancePolicy: 'ALLOWED' | 'DISALLOWED' | 'FALLBACK_ONLY';
  webFallbackPolicy: 'ALLOW_WHEN_DEVICE_UNAVAILABLE' | 'NEVER' | 'ALWAYS';

  // --- reconciliation -------------------------------------------------------
  semanticDuplicateWindowSeconds: number;
  defaultPunchDirectionStrategy: DirectionStrategy;
  sessionPolicy: SessionBuildPolicy;
  overtimeMinimumMinutes: number;

  // --- risk signals ---------------------------------------------------------
  impossibleTravelDetectionEnabled: boolean;
  impossibleTravelMinimumDistanceKm: number;
  impossibleTravelMaximumSpeedKph: number;
}

/** A work-site-specific view, layered over the tenant policy. */
export interface EffectiveWorkSitePolicy {
  workSiteId: string;
  name: string;
  /** Whether attendance may be recorded at this site at all. */
  attendanceEnabled: boolean;
  /** DEVICE_REQUIRED is what makes an in-office web punch refusable. */
  devicePolicy: WorkSiteDevicePolicy;
  webAttendancePolicy: WorkSiteWebAttendancePolicy;
  webFallbackEnabled: boolean;
  /**
   * The capture methods that may be used at this site.
   *
   * An empty column means "inherit", and the inherited position is that every
   * method is permitted — there is no tenant-level method column, and reading
   * an empty list as "nothing allowed" would silently switch attendance off at
   * every site that never configured one. Methods are a SEPARATE axis from work
   * mode: DEVICE/WEB/MOBILE/MANUAL is how attendance was captured,
   * OFFICE/REMOTE/FIELD is the arrangement it was captured under.
   */
  allowedMethods: AttendanceMethod[];
  radiusMeters: number;
  maximumAccuracyMeters: number | null;
  timezone: string | null;
  /** Which layer supplied each value, for explaining a decision. */
  sources: Record<string, 'WORK_SITE' | 'TENANT'>;
}

/** No site restriction configured means every method is on the table. */
export const ALL_ATTENDANCE_METHODS: readonly AttendanceMethod[] = [
  AttendanceMethod.DEVICE,
  AttendanceMethod.WEB,
  AttendanceMethod.MOBILE,
  AttendanceMethod.MANUAL,
];

/**
 * What an employee's configured work mode PERMITS.
 *
 * EmployeeWorkMode is a permission, not a daily outcome. An employee whose mode
 * is HYBRID has not "worked hybrid today" — they are allowed to work either way,
 * and what they actually did is derived from the day's sessions.
 */
export interface WorkModePermissions {
  employeeWorkMode: EmployeeWorkMode;
  /** May record attendance at an authorised site, normally via a device. */
  allowsOfficeWork: boolean;
  /** May record attendance from outside every authorised site. */
  allowsRemoteWork: boolean;
  /** May record attendance away from fixed sites under field policy. */
  allowsFieldWork: boolean;
}

@Injectable()
export class AttendancePolicyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  /**
   * The tenant-level effective policy, honouring the organization override chain
   * the existing resolver already implements.
   */
  async resolve(
    tenantId: string,
    organizationId?: string | null,
  ): Promise<EffectiveAttendancePolicy> {
    const settings = await this.tenantSettings.getAttendanceSettings(
      tenantId,
      organizationId ?? undefined,
    );

    return {
      integrationEnabled: settings.integrationEnabled,
      engineEffectiveFrom: parseEffectiveFrom(
        settings.attendanceEngineEffectiveFrom,
      ),
      // Reuses the geofence settings Phase 1 already established rather than
      // adding a second radius nobody would keep in step with the first.
      defaultRadiusMeters: settings.maximumAllowedDistanceMeters ?? 200,
      maximumAccuracyMeters: settings.maxAllowedAccuracyMeters ?? null,
      webAttendancePolicy: settings.webAttendancePolicy,
      officeWebAttendancePolicy: settings.officeWebAttendancePolicy,
      webFallbackPolicy: settings.webFallbackPolicy,
      semanticDuplicateWindowSeconds: settings.semanticDuplicateWindowSeconds,
      defaultPunchDirectionStrategy: settings.defaultPunchDirectionStrategy,
      sessionPolicy: {
        openSessionPolicy: settings.workModeTransitionPolicy,
        crossSitePolicy: settings.crossSiteAttendancePolicy,
        autoCloseAtShiftEnd: settings.autoCloseMissingCheckoutAtShiftEnd,
        treatGapsAsBreaks: settings.treatSessionGapsAsBreaks,
      },
      overtimeMinimumMinutes: settings.overtimeMinimumMinutes,
      impossibleTravelDetectionEnabled:
        settings.impossibleTravelDetectionEnabled,
      impossibleTravelMinimumDistanceKm:
        settings.impossibleTravelMinimumDistanceKm,
      impossibleTravelMaximumSpeedKph: settings.impossibleTravelMaximumSpeedKph,
    };
  }

  /**
   * Layers a work site's explicit overrides over the tenant policy.
   *
   * Only the columns Phase 1 modelled as overrides participate. A null override
   * means "inherit", which is why each is checked for null rather than
   * falsiness — `webFallbackEnabled: false` is a decision, not an absence.
   */
  resolveWorkSite(
    site: {
      id: string;
      name: string;
      attendanceEnabled: boolean | null;
      devicePolicy: WorkSiteDevicePolicy | null;
      webAttendancePolicy: WorkSiteWebAttendancePolicy | null;
      webFallbackEnabled: boolean | null;
      allowedRadiusMeters: number | null;
      maximumAccuracyMeters: number | null;
      allowedAttendanceMethods?: AttendanceMethod[] | null;
      timezone: string | null;
    },
    tenantPolicy: EffectiveAttendancePolicy,
  ): EffectiveWorkSitePolicy {
    const sources: Record<string, 'WORK_SITE' | 'TENANT'> = {};

    const pick = <T>(key: string, override: T | null, fallback: T): T => {
      sources[key] = override === null ? 'TENANT' : 'WORK_SITE';
      return override === null ? fallback : override;
    };

    return {
      workSiteId: site.id,
      name: site.name,
      attendanceEnabled: pick(
        'attendanceEnabled',
        site.attendanceEnabled,
        tenantPolicy.integrationEnabled,
      ),
      // DEVICE_PREFERRED is the neutral default: it lets an office web punch
      // through where no stricter statement has been made, so a tenant that has
      // configured nothing is not accidentally locked out of web attendance.
      devicePolicy: pick(
        'devicePolicy',
        site.devicePolicy,
        WorkSiteDevicePolicy.DEVICE_PREFERRED,
      ),
      webAttendancePolicy: pick(
        'webAttendancePolicy',
        site.webAttendancePolicy,
        toWorkSiteWebPolicy(tenantPolicy.officeWebAttendancePolicy),
      ),
      webFallbackEnabled: pick(
        'webFallbackEnabled',
        site.webFallbackEnabled,
        tenantPolicy.webFallbackPolicy !== 'NEVER',
      ),
      /*
       * Empty is the inherit signal for this one, not null: the column is a
       * list, and Prisma stores "no restriction" as an empty array rather than
       * as null. Normalised through the same `pick` so the source is reported
       * the same way every other override is.
       */
      allowedMethods: pick(
        'allowedAttendanceMethods',
        site.allowedAttendanceMethods?.length
          ? site.allowedAttendanceMethods
          : null,
        [...ALL_ATTENDANCE_METHODS],
      ),
      radiusMeters: pick(
        'radiusMeters',
        site.allowedRadiusMeters,
        tenantPolicy.defaultRadiusMeters,
      ),
      maximumAccuracyMeters: pick(
        'maximumAccuracyMeters',
        site.maximumAccuracyMeters,
        tenantPolicy.maximumAccuracyMeters,
      ),
      timezone: site.timezone,
      sources,
    };
  }

  /**
   * Translates a configured work mode into what it permits.
   *
   * OFFICE deliberately does NOT permit remote work: an office employee working
   * from home is an exception a human should see, not a silent default. HYBRID
   * permits both, which is the whole point of the mode.
   */
  permissionsFor(workMode: EmployeeWorkMode | null): WorkModePermissions {
    const employeeWorkMode = workMode ?? EmployeeWorkMode.OFFICE;

    switch (employeeWorkMode) {
      case EmployeeWorkMode.REMOTE:
        return {
          employeeWorkMode,
          // A remote employee who comes into the office is still at work; what
          // they may not do is record it from a browser while standing there.
          allowsOfficeWork: true,
          allowsRemoteWork: true,
          allowsFieldWork: false,
        };

      case EmployeeWorkMode.HYBRID:
        return {
          employeeWorkMode,
          allowsOfficeWork: true,
          allowsRemoteWork: true,
          allowsFieldWork: false,
        };

      case EmployeeWorkMode.FIELD:
        return {
          employeeWorkMode,
          allowsOfficeWork: true,
          // Field work happens away from fixed sites by definition, so the
          // outside-every-geofence case is expected rather than exceptional.
          allowsRemoteWork: false,
          allowsFieldWork: true,
        };

      case EmployeeWorkMode.OFFICE:
      default:
        return {
          employeeWorkMode,
          allowsOfficeWork: true,
          allowsRemoteWork: false,
          allowsFieldWork: false,
        };
    }
  }

  /**
   * The work sites an employee was authorised for AT A GIVEN MOMENT.
   *
   * Effective-dated on purpose. Reconciling last quarter's attendance with this
   * month's assignments would retroactively invent — or retroactively revoke —
   * authorisation for punches that were perfectly valid when they happened.
   *
   * `Employee.locationId` is included as the primary/home site: it is metadata
   * the assignment rows do not replace, and an employee whose only site is their
   * home location would otherwise be authorised nowhere.
   */
  async resolveAuthorizedWorkSites(
    tenantId: string,
    employeeId: string,
    at: Date,
  ): Promise<string[]> {
    const [assignments, employee] = await Promise.all([
      this.prisma.employeeWorkSite.findMany({
        where: {
          tenantId,
          employeeId,
          status: 'ACTIVE',
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
            { OR: [{ validTo: null }, { validTo: { gte: at } }] },
          ],
        },
        select: { locationId: true },
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { locationId: true },
      }),
    ]);

    const siteIds = new Set(assignments.map((row) => row.locationId));
    if (employee?.locationId) {
      siteIds.add(employee.locationId);
    }

    return [...siteIds];
  }
}

/**
 * The tenant setting and the work-site column describe the same thing with the
 * same three values under two type names, so this is a rename rather than a
 * judgement.
 */
function toWorkSiteWebPolicy(
  value: 'ALLOWED' | 'DISALLOWED' | 'FALLBACK_ONLY',
): WorkSiteWebAttendancePolicy {
  switch (value) {
    case 'DISALLOWED':
      return WorkSiteWebAttendancePolicy.DISALLOWED;
    case 'FALLBACK_ONLY':
      return WorkSiteWebAttendancePolicy.FALLBACK_ONLY;
    case 'ALLOWED':
    default:
      return WorkSiteWebAttendancePolicy.ALLOWED;
  }
}

/**
 * Parses the engine cutover date.
 *
 * An unparseable value yields null — no cutover — rather than a date that
 * happens to be the epoch, which would silently make the engine reconcile
 * everything ever recorded.
 */
function parseEffectiveFrom(value: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
