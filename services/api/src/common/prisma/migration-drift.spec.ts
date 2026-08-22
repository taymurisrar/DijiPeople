import {
  describeMigrationDrift,
  findPendingMigrations,
  locateMigrationsDir,
  readMigrationNamesFromDisk,
  reportMigrationDrift,
} from './migration-drift';

/**
 * REG-216 — BUG-0283.
 *
 * A development database several migrations behind is invisible until someone
 * runs `prisma generate`, at which point the client catches up, the database
 * does not, and every query touching a new column returns `P2022` — reported as
 * a regression in whichever screen reached it first.
 *
 * The invariant: **starting the API against a behind database produces a
 * warning that names the pending migrations, and does not block startup.**
 */
describe('migration drift', () => {
  const A = '20260820120000_identity_membership';
  const B = '20260820140000_planprice_overage';
  const C = '20260821090000_workspace_hostnames';

  describe('findPendingMigrations', () => {
    it('reports migrations on disk that the database has not applied', () => {
      expect(findPendingMigrations([A, B, C], [A])).toEqual([B, C]);
    });

    it('reports nothing when the database is up to date', () => {
      expect(findPendingMigrations([A, B], [A, B])).toEqual([]);
    });

    it('ignores applied migrations that are not on disk', () => {
      // Switching to a branch that lacks a migration the database already has
      // is ordinary, does not cause P2022, and must not warn.
      expect(findPendingMigrations([A], [A, B, C])).toEqual([]);
    });

    it('returns pending migrations in name order regardless of input order', () => {
      expect(findPendingMigrations([C, A, B], [])).toEqual([A, B, C]);
    });

    it('treats an empty database as every migration pending', () => {
      expect(findPendingMigrations([A, B], [])).toEqual([A, B]);
    });
  });

  describe('describeMigrationDrift', () => {
    it('is silent when nothing is pending', () => {
      expect(describeMigrationDrift([])).toBeNull();
    });

    it('names every pending migration', () => {
      const message = describeMigrationDrift([A, B]);
      expect(message).toContain(A);
      expect(message).toContain(B);
    });

    it('names the command that fixes it and the error it prevents', () => {
      const message = describeMigrationDrift([B]) ?? '';
      expect(message).toContain('prisma:migrate:deploy');
      expect(message).toContain('P2022');
    });

    it('says startup continues, so the warning is not read as a failure', () => {
      expect(describeMigrationDrift([B])).toContain('Startup continues');
    });

    it('agrees with itself about the count', () => {
      expect(describeMigrationDrift([B])).toContain('1 pending migration');
      expect(describeMigrationDrift([A, B])).toContain('2 pending migrations');
    });
  });

  describe('reportMigrationDrift', () => {
    function deps(overrides: Partial<Parameters<typeof reportMigrationDrift>[0]> = {}) {
      return {
        queryAppliedMigrationNames: jest.fn().mockResolvedValue([A]),
        readMigrationNames: jest.fn().mockReturnValue([A, B]),
        warn: jest.fn(),
        debug: jest.fn(),
        ...overrides,
      };
    }

    it('warns, naming the pending migration', async () => {
      const d = deps();
      await reportMigrationDrift(d);
      expect(d.warn).toHaveBeenCalledTimes(1);
      expect(d.warn.mock.calls[0][0]).toContain(B);
    });

    it('stays quiet when the database is current', async () => {
      const d = deps({ queryAppliedMigrationNames: jest.fn().mockResolvedValue([A, B]) });
      await reportMigrationDrift(d);
      expect(d.warn).not.toHaveBeenCalled();
    });

    it('does not query the database when no migrations are on disk', async () => {
      const d = deps({ readMigrationNames: jest.fn().mockReturnValue([]) });
      await reportMigrationDrift(d);
      expect(d.queryAppliedMigrationNames).not.toHaveBeenCalled();
      expect(d.warn).not.toHaveBeenCalled();
      expect(d.debug).toHaveBeenCalled();
    });

    it('swallows a query failure — a fresh database has no _prisma_migrations', async () => {
      const d = deps({
        queryAppliedMigrationNames: jest
          .fn()
          .mockRejectedValue(new Error('relation "_prisma_migrations" does not exist')),
      });
      await expect(reportMigrationDrift(d)).resolves.toBeUndefined();
      expect(d.warn).not.toHaveBeenCalled();
      expect(d.debug).toHaveBeenCalled();
    });

    it('swallows a filesystem failure rather than breaking startup', async () => {
      const d = deps({
        readMigrationNames: jest.fn(() => {
          throw new Error('EACCES');
        }),
      });
      await expect(reportMigrationDrift(d)).resolves.toBeUndefined();
      expect(d.warn).not.toHaveBeenCalled();
    });
  });

  describe('locating the migrations directory', () => {
    it('finds prisma/migrations from this file, whatever the working directory', () => {
      const dir = locateMigrationsDir([__dirname]);
      expect(dir).not.toBeNull();
      expect(readMigrationNamesFromDisk(dir as string).length).toBeGreaterThan(0);
    });

    it('returns null rather than throwing when there is nothing to find', () => {
      expect(locateMigrationsDir(['/definitely/not/a/real/path'])).toBeNull();
    });

    it('reads no names from a directory that does not exist', () => {
      expect(readMigrationNamesFromDisk('/definitely/not/a/real/path')).toEqual([]);
    });
  });
});
