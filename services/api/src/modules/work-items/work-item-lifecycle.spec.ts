import {
  canTransition,
  totalEffort,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TRANSITIONS,
  wouldCreateCycle,
} from './work-item-lifecycle';

describe('work item lifecycle', () => {
  it('allows the named moves and refuses the rest', () => {
    expect(canTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('OPEN', 'DONE')).toBe(false);
    expect(canTransition('IN_REVIEW', 'DONE')).toBe(true);
    expect(canTransition('DONE', 'IN_PROGRESS')).toBe(true); // reopen
    expect(canTransition('DONE', 'OPEN')).toBe(false);
    expect(canTransition('CANCELLED', 'DONE')).toBe(false);
  });

  it('never lists itself and only names real statuses', () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(WORK_ITEM_TRANSITIONS[status]).not.toContain(status);
      for (const to of WORK_ITEM_TRANSITIONS[status]) {
        expect(WORK_ITEM_STATUSES).toContain(to);
      }
    }
  });
});

describe('wouldCreateCycle', () => {
  const edges = new Map<string, string[]>([
    ['b', ['a']], // b depends on a
    ['c', ['b']], // c depends on b
  ]);
  it('refuses a self edge and a direct or transitive back edge', () => {
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'b')).toBe(true); // a depends on b, b on a
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(true); // via b
  });
  it('allows an independent or forward edge, and handles diamonds', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(edges, 'd', 'c')).toBe(false);
    const diamond = new Map([
      ['b', ['a']],
      ['c', ['a']],
    ]);
    expect(wouldCreateCycle(diamond, 'd', 'b')).toBe(false);
  });
});

describe('totalEffort', () => {
  it('sums each contributor once and does not read a missing value as zero', () => {
    expect(
      totalEffort([
        { estimateMinutes: 60, actualMinutes: 90 },
        { estimateMinutes: 30, actualMinutes: null },
      ]),
    ).toEqual({ estimateMinutes: 90, actualMinutes: 90, contributors: 2 });
    expect(totalEffort([])).toEqual({
      estimateMinutes: null,
      actualMinutes: null,
      contributors: 0,
    });
  });
});
