import { buildPayrollEmployeeEligibilityWhere } from './payroll-run.service';

/** DP-QA-030: a soft-deleted employee is never drafted into a payroll run. */
describe('payroll eligibility excludes soft-deleted employees', () => {
  it('always filters isDeleted=false', () => {
    const where = buildPayrollEmployeeEligibilityWhere({
      tenantId: 't1',
      periodStart: new Date('2026-10-01'),
      periodEnd: new Date('2026-10-31'),
      businessUnitId: 'bu1',
    });

    expect(where.isDeleted).toBe(false);
    expect(where.tenantId).toBe('t1');
  });
});
