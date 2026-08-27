import { incidentViewWhere } from './platform-monitoring.service';

/*
 * BUG-1420. `ErrorLog.severity` is a free-text column and production holds both
 * spellings. A census on 2026-08-27 found 1,466 rows lowercase against 5
 * uppercase, while every reader compared against uppercase literals with strict
 * equality.
 *
 * So the Critical view — the one an operator opens when something is wrong —
 * could see 1 of the 15 errors that existed. It did not fail, and it did not
 * look empty. It answered a different question than the one asked, which is the
 * hardest kind of wrong to notice.
 *
 * Prisma's `in` has no insensitive mode, so the levels are listed rather than
 * folded. That is worth a test precisely because it looks redundant: the
 * duplication is load-bearing, and a tidying pass would remove it.
 */

describe('the critical incident view matches severity in either case', () => {
  const where = incidentViewWhere('critical');
  const levels = (where.severity as { in: string[] }).in;

  it.each(['ERROR', 'FATAL', 'error', 'fatal'])('matches %s', (level) => {
    expect(levels).toContain(level);
  });

  it('covers both spellings of every level it claims to', () => {
    // Not a fixed count: adding a level should require adding both spellings,
    // and this fails if only one is added.
    for (const level of levels) {
      const counterpart =
        level === level.toUpperCase()
          ? level.toLowerCase()
          : level.toUpperCase();
      expect(levels).toContain(counterpart);
    }
  });

  it('leaves the other views to supportStatus, which is an enum', () => {
    // Those are not free text and need no case handling — asserted so the
    // insensitivity is understood as specific to severity, not general.
    expect(incidentViewWhere('new')).toEqual({ supportStatus: 'NEW' });
    expect(incidentViewWhere(undefined)).toEqual({});
  });
});
