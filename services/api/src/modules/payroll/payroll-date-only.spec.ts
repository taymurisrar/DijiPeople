import { BadRequestException } from '@nestjs/common';
import { parsePayrollDateOnly } from './payroll.service';

describe('payroll cycle date-only parsing', () => {
  it('keeps an HTML date value at UTC midnight', () => {
    expect(parsePayrollDateOnly('2026-07-01').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('uses the business-date portion of a legacy ISO timestamp', () => {
    expect(parsePayrollDateOnly('2026-07-01T21:00:00.000Z').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('rejects an impossible calendar date', () => {
    expect(() => parsePayrollDateOnly('2026-02-30')).toThrow(
      BadRequestException,
    );
  });
});
