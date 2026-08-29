import { TimesheetJobsService } from './timesheet-jobs.service';

/**
 * BUG-2045 — the audit toggle that existed and nothing read.
 *
 * 216 of 305 audit rows on one tenant were `TIMESHEET_BACKGROUND_JOB_COMPLETED`:
 * machine events with no actor decision behind them, produced as a side effect
 * of 61 manual attendance entries, crowding out the human actions an auditor
 * opens the log to find.
 *
 * The switch that answers this was already in the settings catalog and already
 * rendered on screen as "Audit background jobs". It was wired to nothing — so an
 * administrator could turn it off, see it save, and change no behaviour at all.
 * That is the same class as BUG-2015 (a permission key nothing enforced) and
 * BUG-0669 (a validation DTO nothing referenced): a control that exists, reads
 * as an assurance, and is not connected.
 *
 * The repository owner chose to wire it and default it **off**.
 */

type Settings = Record<string, unknown>;

/**
 * The one internal this file reaches for.
 *
 * Declared as an interface and cast once, rather than reading the method off an
 * `any`: the guard is private, and the alternative to reaching it is standing up
 * the whole job pipeline to assert one boolean. Naming the shape keeps the test
 * honest about what it depends on, and keeps the file free of the unsafe-`any`
 * warnings the api lint budget counts.
 */
interface JobsServiceInternals {
  shouldAuditBackgroundJobs(tenantId: string): Promise<boolean>;
}

function serviceWith(settings: Settings | Error) {
  const tenantSettings = {
    getTenantSettingsCategory: jest.fn(() =>
      settings instanceof Error
        ? Promise.reject(settings)
        : Promise.resolve({ category: 'timesheets', settings }),
    ),
  };

  const service = Object.create(
    TimesheetJobsService.prototype,
  ) as unknown as JobsServiceInternals;

  Object.assign(service, {
    tenantSettings,
    logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
  });

  return {
    shouldAudit: (tenantId: string) =>
      service.shouldAuditBackgroundJobs(tenantId),
    tenantSettings,
  };
}

describe('BUG-2045 — background-job auditing honours its setting', () => {
  it('audits when the tenant has explicitly enabled it', async () => {
    const { shouldAudit } = serviceWith({ auditBackgroundJobs: true });
    await expect(shouldAudit('tenant-1')).resolves.toBe(true);
  });

  it('does not audit when the tenant has turned it off', async () => {
    /*
     * The assertion that did not hold before the fix. Turning the switch off
     * changed nothing: every completion was audited regardless, because nothing
     * read the value.
     */
    const { shouldAudit } = serviceWith({ auditBackgroundJobs: false });
    await expect(shouldAudit('tenant-1')).resolves.toBe(false);
  });

  it('does not audit when the tenant has expressed no preference', async () => {
    /*
     * The decided default, and deliberately **not** the catalog's declared
     * `true`. The catalog value is what an unconfigured tenant is shown; making
     * it actually default to on would restore the noise this record is about.
     * If the catalog is ever migrated to `false`, this test still holds.
     */
    const { shouldAudit } = serviceWith({});
    await expect(shouldAudit('tenant-1')).resolves.toBe(false);
  });

  it('does not audit, and does not throw, when settings cannot be read', async () => {
    /*
     * Fails closed. A background job that completed successfully must not be
     * lost to a settings lookup, and the audit row is the less important half
     * of that pair.
     */
    const { shouldAudit } = serviceWith(new Error('settings unavailable'));
    await expect(shouldAudit('tenant-1')).resolves.toBe(false);
  });

  it('reads the timesheets category for the tenant it was given', async () => {
    const { shouldAudit, tenantSettings } = serviceWith({
      auditBackgroundJobs: true,
    });
    await shouldAudit('tenant-7');
    // Tenant isolation: the setting read must be scoped to the calling tenant.
    expect(tenantSettings.getTenantSettingsCategory).toHaveBeenCalledWith(
      'tenant-7',
      'timesheets',
    );
  });
});
