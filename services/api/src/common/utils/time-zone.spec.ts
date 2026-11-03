import { isValidTimeZone, resolveValidTimeZone } from './time-zone';

describe('time zone helpers (DP-QA-012)', () => {
  it.each(['UTC', 'Asia/Karachi', 'America/New_York', 'Europe/London'])(
    'accepts %s',
    (zone) => expect(isValidTimeZone(zone)).toBe(true),
  );

  it.each(['Not/AZone', '', '   ', 'Mars/Olympus', 42, null, undefined])(
    'rejects %p',
    (zone) => expect(isValidTimeZone(zone)).toBe(false),
  );

  it('falls back instead of throwing for a previously stored bad value', () => {
    expect(resolveValidTimeZone('Not/AZone')).toBe('UTC');
    expect(resolveValidTimeZone('Not/AZone', 'Asia/Karachi')).toBe(
      'Asia/Karachi',
    );
    expect(resolveValidTimeZone(' Asia/Karachi ')).toBe('Asia/Karachi');
  });
});
