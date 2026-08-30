import {
  INVESTIGATING_SUPPORT_STATUSES,
  incidentViewWhere,
  investigatingIncidentWhere,
} from './platform-monitoring.service';
import { NOT_AN_INCIDENT } from '../error-logs/expected-protocol-outcome';

/**
 * BUG-2495 — the "Under investigation" tile counted incidents nobody was
 * investigating.
 *
 * The overview derived it as `total - open - resolved`. That subtraction was
 * correct while an incident could only be open, resolved or investigating.
 * BUG-1754 added `NOT_AN_INCIDENT` as a fourth state, and because `open`
 * correctly excludes it, every set-aside row had to reappear somewhere — this
 * tile is where the arithmetic put it, under the label "Assigned and in
 * progress", linking to a filter that returned none of them.
 *
 * Production read 27 there and all 27 were `NOT_AN_INCIDENT`. The BUG-2465
 * backfill would have made it read 1,707.
 *
 * The fix is to measure rather than infer, from one shared predicate. These
 * assertions guard that the predicate stays shared and stays narrow.
 */
describe('BUG-2495 — under-investigation is measured, not inferred', () => {
  it('counts exactly the two working statuses', () => {
    expect([...INVESTIGATING_SUPPORT_STATUSES]).toEqual([
      'INVESTIGATING',
      'FIX_IN_PROGRESS',
    ]);
  });

  it('never counts a status that means nobody is working on it', () => {
    /*
     * The assertion that would have caught the original defect. `NEW`,
     * `RESOLVED` and `NOT_AN_INCIDENT` each mean "no one is investigating
     * this", for three different reasons.
     */
    const statuses = [...INVESTIGATING_SUPPORT_STATUSES] as string[];

    expect(statuses).not.toContain(NOT_AN_INCIDENT);
    expect(statuses).not.toContain('NEW');
    expect(statuses).not.toContain('RESOLVED');
    expect(statuses).not.toContain('WAITING_ON_CUSTOMER');
  });

  it('gives the metric and the view filter one definition', () => {
    /*
     * The tile and the list it opens must agree. BUG-1750 was the same screen
     * failing this for "critical", where the count and the link had drifted to
     * three different spellings of one idea.
     */
    expect(incidentViewWhere('investigating')).toEqual(
      investigatingIncidentWhere(),
    );
  });

  it('builds a where clause that selects on supportStatus alone', () => {
    expect(investigatingIncidentWhere()).toEqual({
      supportStatus: { in: ['INVESTIGATING', 'FIX_IN_PROGRESS'] },
    });
  });

  it('leaves the neighbouring views untouched', () => {
    expect(incidentViewWhere('new')).toEqual({ supportStatus: 'NEW' });
    expect(incidentViewWhere('resolved')).toEqual({
      supportStatus: 'RESOLVED',
    });
    expect(incidentViewWhere(undefined)).toEqual({});
  });
});
