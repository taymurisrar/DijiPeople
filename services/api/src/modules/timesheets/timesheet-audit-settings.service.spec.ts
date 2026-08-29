import { TimesheetAuditSettingsService } from './timesheet-audit-settings.service';
import type { TimesheetAuditToggle } from './timesheet-audit-settings.service';

/**
 * BUG-2206 — the three audit toggles that rendered on screen and were read by
 * nothing.
 *
 * `auditBackgroundJobs` was wired by BUG-2045 and covered by REG-308. This file
 * covers the other three the same scan surfaced: `auditEntryChanges`,
 * `auditPolicyResolution` and `auditExports`. They record human actions rather
 * than machine events, so the default is the opposite of BUG-2045's — on — and
 * the fail-safe direction is inverted with it.
 */

type Settings = Record<string, unknown>;

const TOGGLES: TimesheetAuditToggle[] = [
  'auditEntryChanges',
  'auditPolicyResolution',
  'auditExports',
];

function serviceWith(settings: Settings | Error) {
  const tenantSettings = {
    getTenantSettingsCategory: jest.fn(() =>
      settings instanceof Error
        ? Promise.reject(settings)
        : Promise.resolve({ category: 'timesheets', settings }),
    ),
  };

  const service = new TimesheetAuditSettingsService(tenantSettings as never);

  return { service, tenantSettings };
}

describe('BUG-2206 — timesheet audit toggles are honoured', () => {
  it.each(TOGGLES)('audits when %s is explicitly on', async (toggle) => {
    const { service } = serviceWith({ [toggle]: true });
    await expect(service.shouldAudit('tenant-1', toggle)).resolves.toBe(true);
  });

  it.each(TOGGLES)('does not audit when %s is turned off', async (toggle) => {
    /*
     * The assertion that did not hold before the fix. Turning the switch off
     * saved, reloaded, and changed nothing at all.
     */
    const { service } = serviceWith({ [toggle]: false });
    await expect(service.shouldAudit('tenant-1', toggle)).resolves.toBe(false);
  });

  it.each(TOGGLES)(
    'audits when the tenant has expressed no preference about %s',
    async (toggle) => {
      /*
       * Decided per toggle rather than copied from BUG-2045. These three record
       * actor decisions, so a tenant that has never opened the tab keeps the
       * behaviour it has today: the rows are written.
       */
      const { service } = serviceWith({});
      await expect(service.shouldAudit('tenant-1', toggle)).resolves.toBe(true);
    },
  );

  it.each(TOGGLES)(
    'audits, and does not throw, when settings cannot be read for %s',
    async (toggle) => {
      /*
       * Fails **open**, the opposite of the background-job reader. Losing an
       * actor's audit row to a settings blip is the worse of the two mistakes.
       */
      const { service } = serviceWith(new Error('settings unavailable'));
      await expect(service.shouldAudit('tenant-1', toggle)).resolves.toBe(true);
    },
  );

  it('treats a stored string "false" as off', async () => {
    // The value column is JSON, so a client that PATCHed a string before
    // coercion existed can still be holding one.
    const { service } = serviceWith({ auditExports: 'false' });
    await expect(service.shouldAudit('tenant-1', 'auditExports')).resolves.toBe(
      false,
    );
  });

  it('reads the timesheets category for the tenant it was given', async () => {
    const { service, tenantSettings } = serviceWith({ auditExports: true });
    await service.shouldAudit('tenant-7', 'auditExports');
    // Tenant isolation: the setting read must be scoped to the calling tenant.
    expect(tenantSettings.getTenantSettingsCategory).toHaveBeenCalledWith(
      'tenant-7',
      'timesheets',
    );
  });
});
