import { netWorkingDays, weekdaysBetween } from './work-item-capacity';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('weekdaysBetween', () => {
  it('lists Monday to Friday only, end exclusive', () => {
    // 2026-11-02 is a Monday.
    expect(weekdaysBetween(d('2026-11-02'), d('2026-11-09'))).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(weekdaysBetween(d('2026-11-07'), d('2026-11-09'))).toEqual([]);
  });
});

describe('netWorkingDays', () => {
  const week = { from: d('2026-11-02'), to: d('2026-11-09') };

  it('is the standard week when nothing is removed', () => {
    expect(netWorkingDays({ ...week, leave: [], holidays: [] })).toEqual({
      standardDays: 5,
      leaveDays: 0,
      holidayDays: 0,
      netDays: 5,
    });
  });

  it('removes approved leave, counting only weekdays inside the period', () => {
    const net = netWorkingDays({
      ...week,
      // Thu 5 Nov to Tue 10 Nov: Thu, Fri, Mon (9th) is outside the period.
      leave: [{ startDate: d('2026-11-05'), endDate: d('2026-11-10') }],
      holidays: [],
    });
    expect(net).toMatchObject({ leaveDays: 2, netDays: 3 });
  });

  it('removes a holiday once, even when leave already covers that day', () => {
    const net = netWorkingDays({
      ...week,
      leave: [{ startDate: d('2026-11-03'), endDate: d('2026-11-04') }],
      holidays: [d('2026-11-04'), d('2026-11-06')],
    });
    // Leave: Tue, Wed. Holiday Wed is already off; holiday Fri is one more day.
    expect(net).toEqual({
      standardDays: 5,
      leaveDays: 2,
      holidayDays: 1,
      netDays: 2,
    });
  });

  it('ignores weekend holidays and holidays outside the period', () => {
    const net = netWorkingDays({
      ...week,
      leave: [],
      holidays: [d('2026-11-07'), d('2026-12-25')],
    });
    expect(net.holidayDays).toBe(0);
    expect(net.netDays).toBe(5);
  });

  it('never goes below zero and counts overlapping leave requests once', () => {
    const net = netWorkingDays({
      ...week,
      leave: [
        { startDate: d('2026-11-01'), endDate: d('2026-11-30') },
        { startDate: d('2026-11-03'), endDate: d('2026-11-05') },
      ],
      holidays: [d('2026-11-02')],
    });
    expect(net.netDays).toBe(0);
    expect(net.leaveDays).toBe(5);
  });
});
