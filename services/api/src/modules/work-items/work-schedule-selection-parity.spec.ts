import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadScheduleFacts } from './work-schedule-capacity';

/*
 * Capacity must choose the same schedule as attendance for the same fixtures at
 * every precedence level (both call selectWorkSchedule; the pure cases are in
 * attendance/work-schedule-selection.spec.ts). Here the fixtures go through the
 * capacity loader with a fake Prisma, so a regression that reintroduces a private
 * precedence in capacity is caught.
 */
const base = {
  isDefault: false,
  businessUnitId: null,
  organizationId: null,
  weeklyWorkDays: ['MONDAY'],
  standardStartTime: '09:00',
  standardEndTime: '17:00',
  standardHoursPerWeek: null,
  effectiveStartDate: null,
  effectiveEndDate: null,
  days: [],
};
const schedule = (id: string, over: Record<string, unknown> = {}) => ({
  ...base,
  id,
  name: id,
  ...over,
});
const SCHEDULES = [
  schedule('tenant-default', { isDefault: true }),
  schedule('org', { organizationId: 'o1' }),
  schedule('unit', { businessUnitId: 'b1', organizationId: 'o1' }),
  schedule('dept'),
  schedule('team'),
  schedule('own'),
  schedule('dated'),
  schedule('expired', { effectiveEndDate: new Date('2020-01-01') }),
];

const employee = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  organizationId: 'o1',
  businessUnitId: 'b1',
  departmentId: 'd1',
  teamId: 't1',
  defaultWorkScheduleId: null,
  team: { defaultWorkScheduleId: null },
  department: { defaultWorkScheduleId: null },
  ...over,
});

async function chosen(
  emp: ReturnType<typeof employee>,
  assignments: Array<Record<string, unknown>> = [],
  day = '2026-12-07',
) {
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue([emp]) },
    employeeScheduleAssignment: {
      findMany: jest.fn().mockResolvedValue(assignments),
    },
    workSchedule: { findMany: jest.fn().mockResolvedValue(SCHEDULES) },
  } as unknown as PrismaService;
  const facts = await loadScheduleFacts(
    prisma,
    't',
    ['e1'],
    new Date('2026-12-01'),
    new Date('2026-12-31'),
  );
  return facts.get('e1')?.scheduleOn(day)?.id ?? null;
}

describe('capacity schedule choice matches the attendance precedence', () => {
  const dated = {
    employeeId: 'e1',
    workScheduleId: 'dated',
    effectiveFrom: new Date('2026-12-01'),
    effectiveTo: null,
  };

  it('dated assignment > employee > team > department > unit > organisation > tenant default', async () => {
    const full = employee({
      defaultWorkScheduleId: 'own',
      team: { defaultWorkScheduleId: 'team' },
      department: { defaultWorkScheduleId: 'dept' },
    });
    expect(await chosen(full, [dated])).toBe('dated');
    expect(await chosen(full)).toBe('own');
    expect(
      await chosen(
        employee({
          team: { defaultWorkScheduleId: 'team' },
          department: { defaultWorkScheduleId: 'dept' },
        }),
      ),
    ).toBe('team');
    expect(
      await chosen(employee({ department: { defaultWorkScheduleId: 'dept' } })),
    ).toBe('dept');
    expect(await chosen(employee())).toBe('unit');
    expect(await chosen(employee({ businessUnitId: null }))).toBe('org');
    expect(
      await chosen(employee({ businessUnitId: null, organizationId: null })),
    ).toBe('tenant-default');
  });

  it('an assignment outside its dates, or naming an expired schedule, does not win', async () => {
    const own = employee({ defaultWorkScheduleId: 'own' });
    expect(
      await chosen(own, [{ ...dated, effectiveTo: new Date('2026-12-02') }]),
    ).toBe('own');
    expect(await chosen(own, [{ ...dated, workScheduleId: 'expired' }])).toBe(
      'own',
    );
  });

  it('a pointer to an expired schedule falls through to the next level, as attendance does', async () => {
    expect(
      await chosen(
        employee({
          defaultWorkScheduleId: 'expired',
          team: { defaultWorkScheduleId: 'team' },
        }),
      ),
    ).toBe('team');
  });
});
