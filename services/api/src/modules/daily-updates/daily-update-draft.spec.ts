import {
  buildDraftItems,
  isLate,
  isoWeekday,
  isWorkingDay,
  localDate,
  previousDate,
  sectionForContribution,
  zonedInstant,
  type DraftContribution,
  type DraftWorkItem,
} from './daily-update-draft';

const dayStart = new Date('2026-11-02T00:00:00.000Z');
const dayEnd = new Date('2026-11-03T00:00:00.000Z');
const now = new Date('2026-11-02T17:00:00.000Z');

const contribution = (
  over: Partial<DraftContribution> = {},
): DraftContribution => ({
  id: 'c1',
  category: 'PLANNED',
  measure: 'INTERVAL',
  workKind: 'TASK',
  startsAt: new Date('2026-11-02T09:00:00.000Z'),
  endsAt: new Date('2026-11-02T10:30:00.000Z'),
  quantity: null,
  unitKey: null,
  note: null,
  ...over,
});
const item = (over: Partial<DraftWorkItem> = {}): DraftWorkItem => ({
  id: 'w1',
  title: 'Task',
  status: 'OPEN',
  priority: 'NORMAL',
  dueAt: null,
  completedAt: null,
  ...over,
});
const build = (over: Partial<Parameters<typeof buildDraftItems>[0]> = {}) =>
  buildDraftItems({
    contributions: [],
    workItems: [],
    carriedOver: [],
    dayStart,
    dayEnd,
    now,
    ...over,
  });

describe('buildDraftItems', () => {
  it('proposes recorded contributions by their own measure, never turning a quantity into time', () => {
    const items = build({
      contributions: [
        contribution(),
        contribution({
          id: 'c2',
          measure: 'QUANTITY',
          workKind: 'OUTPUT',
          startsAt: null,
          endsAt: null,
          quantity: '80',
          unitKey: 'unit',
        }),
        contribution({
          id: 'c3',
          measure: 'OCCURRENCE',
          workKind: 'DUTY',
          startsAt: null,
          endsAt: null,
        }),
      ],
    });
    expect(items.map((i) => i.text)).toEqual([
      'Planned work (task): 90 min',
      'Planned work (output): 80 unit',
      'Planned work (duty): done',
    ]);
    expect(items.every((i) => i.section === 'COMPLETED')).toBe(true);
  });

  it('routes unplanned work and downtime to their own sections', () => {
    expect(sectionForContribution({ category: 'UNPLANNED' })).toBe('UNPLANNED');
    expect(sectionForContribution({ category: 'DOWNTIME' })).toBe('BLOCKER');
    expect(sectionForContribution({ category: 'BLOCKED' })).toBe('BLOCKER');
    expect(sectionForContribution({ category: 'MENTORING' })).toBe('COMPLETED');
  });

  it('places work items by what they are doing today', () => {
    const items = build({
      workItems: [
        item({
          id: 'a',
          title: 'Finished today',
          status: 'DONE',
          completedAt: new Date('2026-11-02T12:00:00.000Z'),
        }),
        item({
          id: 'b',
          title: 'Finished yesterday',
          status: 'DONE',
          completedAt: new Date('2026-11-01T12:00:00.000Z'),
        }),
        item({ id: 'c', title: 'Doing', status: 'IN_PROGRESS' }),
        item({ id: 'd', title: 'Stuck', status: 'BLOCKED' }),
        item({
          id: 'e',
          title: 'Urgent next',
          status: 'OPEN',
          priority: 'URGENT',
        }),
        item({ id: 'f', title: 'Far off', status: 'OPEN' }),
      ],
    });
    expect(items.map((i) => [i.section, i.text])).toEqual([
      ['COMPLETED', 'Finished today'],
      ['IN_PROGRESS', 'Doing'],
      ['BLOCKER', 'Stuck'],
      ['NEXT', 'Urgent next'],
    ]);
  });

  it("keeps last time's open commitments and drops the finished ones", () => {
    const items = build({
      carriedOver: [
        item({ id: 'x', title: 'Promised', status: 'IN_PROGRESS' }),
        item({ id: 'y', title: 'Done since', status: 'DONE' }),
      ],
    });
    expect(items).toEqual([
      { section: 'NEXT', text: 'Promised', workItemId: 'x' },
    ]);
  });

  it('never proposes the same evidence twice', () => {
    const items = build({
      contributions: [contribution(), contribution()],
      workItems: [
        item({ status: 'IN_PROGRESS' }),
        item({ status: 'IN_PROGRESS' }),
      ],
    });
    expect(items).toHaveLength(2);
  });

  it('proposes nothing when there is no evidence', () => {
    expect(build()).toEqual([]);
  });
});

describe('dates and deadlines', () => {
  it('reads the ISO weekday and the working days', () => {
    expect(isoWeekday('2026-11-02')).toBe(1); // Monday
    expect(isoWeekday('2026-11-08')).toBe(7); // Sunday
    expect(isWorkingDay('2026-11-07', [1, 2, 3, 4, 5])).toBe(false);
    expect(isWorkingDay('2026-11-06', [1, 2, 3, 4, 5])).toBe(true);
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
  });

  it('turns a local time into the right instant, across zones and daylight saving', () => {
    expect(zonedInstant('2026-11-02', 18 * 60, 'UTC').toISOString()).toBe(
      '2026-11-02T18:00:00.000Z',
    );
    // Karachi is UTC+5 all year.
    expect(
      zonedInstant('2026-11-02', 18 * 60, 'Asia/Karachi').toISOString(),
    ).toBe('2026-11-02T13:00:00.000Z');
    // New York: EDT (UTC-4) before the change, EST (UTC-5) after.
    expect(
      zonedInstant('2026-11-01', 12 * 60, 'America/New_York').toISOString(),
    ).toBe('2026-11-01T17:00:00.000Z');
    expect(
      zonedInstant('2026-10-31', 12 * 60, 'America/New_York').toISOString(),
    ).toBe('2026-10-31T16:00:00.000Z');
  });

  it('knows what local date it is somewhere else', () => {
    // 23:30 UTC is already the next day in Karachi.
    expect(
      localDate(new Date('2026-11-02T23:30:00.000Z'), 'Asia/Karachi'),
    ).toBe('2026-11-03');
    expect(localDate(new Date('2026-11-02T23:30:00.000Z'), 'UTC')).toBe(
      '2026-11-02',
    );
  });

  it('is late only after the deadline of the day reported', () => {
    const base = {
      forDate: '2026-11-02',
      deadlineMinutes: 18 * 60,
      timezone: 'Asia/Karachi',
    };
    expect(
      isLate({ ...base, submittedAt: new Date('2026-11-02T12:59:00.000Z') }),
    ).toBe(false);
    expect(
      isLate({ ...base, submittedAt: new Date('2026-11-02T13:01:00.000Z') }),
    ).toBe(true);
    expect(
      isLate({ ...base, submittedAt: new Date('2026-11-04T09:00:00.000Z') }),
    ).toBe(true);
  });
});
