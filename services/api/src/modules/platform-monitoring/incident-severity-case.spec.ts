import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  criticalIncidentWhere,
  incidentViewWhere,
} from './platform-monitoring.service';

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

/*
 * BUG-1750. BUG-1420 taught the critical *view* to fold case and left the
 * overview *metric* comparing `severity: 'ERROR'` exactly — so the tile read 11
 * and the view it linked to returned 0 of 0. Two answers to one question, from
 * the same screen.
 *
 * The fix is one definition rather than two corrections, so what is asserted is
 * that there is only one.
 */
describe('BUG-1750 — the metric and the view agree on what critical means', () => {
  const source = readFileSync(
    join(__dirname, 'platform-monitoring.service.ts'),
    'utf8',
  );

  it('is the same where clause', () => {
    expect(incidentViewWhere('critical')).toEqual(criticalIncidentWhere());
  });

  it('spells the severity list in exactly one place', () => {
    // The literal belongs to `CRITICAL_INCIDENT_SEVERITIES` alone. A second
    // occurrence is a second definition, which is the defect returning.
    const occurrences = source.match(/'ERROR',\s+'FATAL'/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('counts the metric through that definition, not a literal', () => {
    const listEvents = source.slice(
      source.indexOf('const [logs, total, critical'),
      source.indexOf('const items = await this.enrichEvents(logs)'),
    );
    // Comments stripped: the note above the metric quotes the old code by
    // design, and an assertion that cannot tell code from prose would either
    // fail on the explanation or force the explanation to be vague.
    const code = listEvents.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('criticalIncidentWhere()');
    expect(code).not.toContain("severity: 'ERROR'");
  });
});
