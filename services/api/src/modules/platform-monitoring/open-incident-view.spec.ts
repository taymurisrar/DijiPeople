import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  incidentViewWhere,
  openIncidentWhere,
} from './platform-monitoring.service';

/*
 * ITEM-0206. The operations dashboard's "Errors needing attention" tile counted
 * every incident not RESOLVED or NOT_AN_INCIDENT, but linked to the "new" view,
 * which lists only untriaged rows — so the list it opened was smaller than the
 * number that sent the operator there. One predicate now backs the count and
 * the `open` view the tile links to.
 */
describe('open incidents', () => {
  it('excludes resolved and set-aside incidents and nothing else', () => {
    expect(openIncidentWhere()).toEqual({
      supportStatus: { notIn: ['RESOLVED', 'NOT_AN_INCIDENT'] },
    });
  });

  it('the `open` view is that predicate', () => {
    expect(incidentViewWhere('open')).toEqual(openIncidentWhere());
  });

  it('the operations dashboard counts with the same predicate', () => {
    const source = readFileSync(
      join(__dirname, '..', 'super-admin', 'operations-dashboard.service.ts'),
      'utf8',
    );
    expect(source).toContain('openIncidentWhere()');
    expect(source).not.toContain("notIn: ['RESOLVED'");
  });
});
