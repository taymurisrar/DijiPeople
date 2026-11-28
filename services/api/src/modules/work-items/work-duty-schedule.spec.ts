import {
  dateOnlyToDate,
  isoWeekdayOfDate,
  isValidDateOnly,
  isValidTimezone,
  localDateInZone,
  localDatesFrom,
  recursOn,
  validateMinutes,
  validateWeekdays,
  weekdayInZone,
  zonedInstant,
} from './work-duty-schedule';

describe('work duty schedule', () => {
  describe('timezone weekday edge', () => {
    // 20:00 UTC on Friday 2026-11-27 is already 01:00 Saturday in Karachi (UTC+5).
    const instant = new Date('2026-11-27T20:00:00.000Z');

    it('reads the weekday in the template zone, not in UTC', () => {
      expect(instant.getUTCDay()).toBe(5); // Friday in UTC
      expect(weekdayInZone(instant, 'Asia/Karachi')).toBe(6); // Saturday there
      expect(weekdayInZone(instant, 'UTC')).toBe(5);
      expect(localDateInZone(instant, 'Asia/Karachi')).toBe('2026-11-28');
    });

    it('puts local midnight on the previous UTC day for a zone ahead of UTC', () => {
      expect(zonedInstant('2026-11-28', 0, 'Asia/Karachi').toISOString()).toBe(
        '2026-11-27T19:00:00.000Z',
      );
      expect(zonedInstant('2026-11-28', 60, 'Asia/Karachi').toISOString()).toBe(
        '2026-11-27T20:00:00.000Z',
      );
    });

    it('puts a late local time on the next UTC day for a zone behind UTC', () => {
      // 23:30 in Los Angeles (UTC-8 in November) is 07:30 the next day in UTC.
      expect(
        zonedInstant(
          '2026-11-28',
          23 * 60 + 30,
          'America/Los_Angeles',
        ).toISOString(),
      ).toBe('2026-11-29T07:30:00.000Z');
    });

    it('follows a daylight-saving offset change on the day itself', () => {
      // New York leaves DST on 2026-11-01: 09:00 local is UTC-5 that day, UTC-4 the day before.
      expect(
        zonedInstant('2026-11-01', 540, 'America/New_York').toISOString(),
      ).toBe('2026-11-01T14:00:00.000Z');
      expect(
        zonedInstant('2026-10-31', 540, 'America/New_York').toISOString(),
      ).toBe('2026-10-31T13:00:00.000Z');
    });
  });

  describe('weekday matching', () => {
    it('numbers Monday 1 to Sunday 7', () => {
      expect(isoWeekdayOfDate('2026-11-23')).toBe(1);
      expect(isoWeekdayOfDate('2026-11-29')).toBe(7);
    });

    it('matches only the listed weekdays', () => {
      expect(recursOn([1, 3, 5], '2026-11-25')).toBe(true); // Wednesday
      expect(recursOn([1, 3, 5], '2026-11-26')).toBe(false); // Thursday
    });
  });

  describe('invalid input', () => {
    it('rejects an unreal calendar date', () => {
      expect(isValidDateOnly('2026-02-30')).toBe(false);
      expect(isValidDateOnly('2026-13-01')).toBe(false);
      expect(isValidDateOnly('26-01-01')).toBe(false);
      expect(isValidDateOnly('2026-11-28T00:00:00Z')).toBe(false);
      expect(isValidDateOnly(20261128)).toBe(false);
      expect(isValidDateOnly('2028-02-29')).toBe(true);
      expect(() => dateOnlyToDate('2026-02-30')).toThrow(RangeError);
    });

    it('rejects an unknown or empty timezone', () => {
      expect(isValidTimezone('Asia/Karachi')).toBe(true);
      expect(isValidTimezone('Mars/Olympus')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(() => zonedInstant('2026-11-28', 0, 'Mars/Olympus')).toThrow(
        RangeError,
      );
    });

    it('rejects minutes outside the day', () => {
      expect(validateMinutes(0)).toBe(true);
      expect(validateMinutes(1439)).toBe(true);
      expect(validateMinutes(1440)).toBe(false);
      expect(validateMinutes(-1)).toBe(false);
      expect(validateMinutes(1.5)).toBe(false);
      expect(() => zonedInstant('2026-11-28', 1440, 'UTC')).toThrow(RangeError);
    });

    it('counts days ahead from each zone own today across the UTC date boundary', () => {
      // 12:00 UTC on 2027-03-01: already Tuesday 01:00 in Auckland (UTC+13), still
      // Monday 04:00 in Los Angeles (UTC-8), and Monday in UTC.
      const same = new Date('2027-03-01T12:00:00.000Z');
      expect(localDatesFrom(same, 'Pacific/Auckland', 2)).toEqual([
        '2027-03-02',
        '2027-03-03',
      ]);
      expect(localDatesFrom(same, 'America/Los_Angeles', 2)).toEqual([
        '2027-03-01',
        '2027-03-02',
      ]);
      expect(localDatesFrom(same, 'UTC', 1)).toEqual(['2027-03-01']);
      // Month end rolls over by calendar, not by 30 days.
      expect(
        localDatesFrom(new Date('2027-02-27T12:00:00.000Z'), 'UTC', 3),
      ).toEqual(['2027-02-27', '2027-02-28', '2027-03-01']);
      expect(() => localDatesFrom(same, 'Not/AZone', 1)).toThrow(RangeError);
    });

    it('rejects empty, out-of-range, repeated or non-integer weekdays', () => {
      expect(validateWeekdays([1, 2, 7])).toBe(true);
      expect(validateWeekdays([])).toBe(false);
      expect(validateWeekdays([0])).toBe(false);
      expect(validateWeekdays([8])).toBe(false);
      expect(validateWeekdays([1, 1])).toBe(false);
      expect(validateWeekdays([1.5])).toBe(false);
      expect(validateWeekdays('1')).toBe(false);
    });
  });
});
