import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_TENANT_SETTINGS } from '../tenant-settings/tenant-settings.catalog';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';

/**
 * The `timesheets` audit toggles, and the one place that decides what each of
 * them means.
 *
 * BUG-2045 wired `auditBackgroundJobs`. BUG-2206 recorded that it had not been
 * alone: `auditEntryChanges`, `auditPolicyResolution` and `auditExports` were
 * declared in the settings catalog, rendered on screen as live checkboxes,
 * saved, cached and audited — and read by nothing. An administrator who turned
 * one off changed nothing at all, silently.
 *
 * **The default is decided per toggle, not inherited from BUG-2045.**
 * `auditBackgroundJobs` defaults *off* because machine events crowd out actor
 * decisions in the log. These three record human actions — an entry change, a
 * policy decision, an export of other people's hours — so the reasoning points
 * the other way, and each defaults *on*, matching the `true` the catalog already
 * declares. That also means the fail-safe direction is inverted: where the
 * background-job reader fails closed (do not audit), these fail **open** (audit
 * anyway). Losing an actor's audit row because a settings read blipped is the
 * worse of the two mistakes.
 */
export type TimesheetAuditToggle =
  | 'auditEntryChanges'
  | 'auditPolicyResolution'
  | 'auditExports';

@Injectable()
export class TimesheetAuditSettingsService {
  private readonly logger = new Logger(TimesheetAuditSettingsService.name);

  constructor(private readonly tenantSettings: TenantSettingsService) {}

  /**
   * True unless the tenant has explicitly turned the toggle off.
   *
   * "Unset" is deliberately not the same question as "false": a tenant that has
   * never opened the Timesheets audit tab must keep the behaviour it has today,
   * which is that these rows are written.
   */
  async shouldAudit(
    tenantId: string,
    toggle: TimesheetAuditToggle,
  ): Promise<boolean> {
    const fallback = DEFAULT_TENANT_SETTINGS.timesheets[toggle] !== false;

    try {
      const category = await this.tenantSettings.getTenantSettingsCategory(
        tenantId,
        'timesheets',
      );
      const value = (category.settings as Record<string, unknown>)[toggle];

      if (value === undefined || value === null) {
        return fallback;
      }

      // Stored as JSON, so a tenant that wrote the value through the generic
      // PATCH endpoint before coercion existed can still hold "false".
      if (typeof value === 'string') {
        return value.trim().toLowerCase() !== 'false';
      }

      return value !== false;
    } catch (error) {
      this.logger.warn(
        `Could not read timesheets.${toggle} for tenant ${tenantId}; ` +
          `auditing anyway. ${error instanceof Error ? error.message : ''}`,
      );
      return fallback;
    }
  }
}
