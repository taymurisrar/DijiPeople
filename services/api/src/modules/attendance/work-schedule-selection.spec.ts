import { selectWorkSchedule } from './work-configuration-hierarchy';

/*
 * One precedence, two callers: attendance (resolveWorkDayForEmployees) and
 * work-item capacity both choose a person's schedule through selectWorkSchedule.
 * The same fixtures are pushed through capacity's loader in
 * work-items/work-schedule-selection-parity.spec.ts.
 */
const SCHEDULES = [
  // Ordered as the callers load them: default first, then oldest first.
  {
    id: 'tenant-default',
    isDefault: true,
    businessUnitId: null,
    organizationId: null,
  },
  { id: 'org', isDefault: false, businessUnitId: null, organizationId: 'o1' },
  { id: 'unit', isDefault: false, businessUnitId: 'b1', organizationId: 'o1' },
  { id: 'dept', isDefault: false, businessUnitId: null, organizationId: null },
  { id: 'team', isDefault: false, businessUnitId: null, organizationId: null },
  { id: 'own', isDefault: false, businessUnitId: null, organizationId: null },
  { id: 'dated', isDefault: false, businessUnitId: null, organizationId: null },
] as const;

const hierarchy = {
  teamId: 't1',
  departmentId: 'd1',
  businessUnitId: 'b1',
  organizationId: 'o1',
};

describe('selectWorkSchedule', () => {
  const pick = (
    over: Parameters<typeof selectWorkSchedule>[0] extends infer T
      ? Partial<T>
      : never,
  ) =>
    selectWorkSchedule({
      hierarchy,
      schedules: SCHEDULES,
      ...over,
    });

  it('walks every level in order: assignment, employee, team, department, unit, organisation, tenant', () => {
    expect(
      pick({
        assignmentScheduleId: 'dated',
        employeeScheduleId: 'own',
        teamScheduleId: 'team',
        departmentScheduleId: 'dept',
      }),
    ).toMatchObject({
      schedule: { id: 'dated' },
      source: 'EMPLOYEE_ASSIGNMENT',
    });
    expect(
      pick({
        employeeScheduleId: 'own',
        teamScheduleId: 'team',
        departmentScheduleId: 'dept',
      }),
    ).toMatchObject({ schedule: { id: 'own' }, source: 'EMPLOYEE_DEFAULT' });
    expect(
      pick({ teamScheduleId: 'team', departmentScheduleId: 'dept' }),
    ).toMatchObject({ schedule: { id: 'team' }, source: 'TEAM_DEFAULT' });
    expect(pick({ departmentScheduleId: 'dept' })).toMatchObject({
      schedule: { id: 'dept' },
      source: 'DEPARTMENT_DEFAULT',
    });
    expect(pick({})).toMatchObject({
      schedule: { id: 'unit' },
      source: 'BUSINESS_UNIT_SCOPE',
    });
    expect(
      pick({ hierarchy: { ...hierarchy, businessUnitId: null } }),
    ).toMatchObject({
      schedule: { id: 'org' },
      source: 'ORGANIZATION_SCOPE',
    });
    expect(
      pick({
        hierarchy: { ...hierarchy, businessUnitId: null, organizationId: null },
      }),
    ).toMatchObject({
      schedule: { id: 'tenant-default' },
      source: 'TENANT_DEFAULT',
    });
  });

  it('skips a pointer whose schedule is not usable that day and takes the next level', () => {
    // 'own' is not in the usable list, so the team's pointer is next.
    const usable = SCHEDULES.filter((s) => s.id !== 'own');
    expect(
      selectWorkSchedule({
        employeeScheduleId: 'own',
        teamScheduleId: 'team',
        hierarchy,
        schedules: usable,
      }),
    ).toMatchObject({ schedule: { id: 'team' } });
  });

  it('is null when nothing applies, and an unscoped schedule is never picked as a unit or org match', () => {
    expect(
      selectWorkSchedule({
        hierarchy,
        schedules: [
          {
            id: 'x',
            isDefault: false,
            businessUnitId: 'other',
            organizationId: 'o1',
          },
        ],
      }),
    ).toBeNull();
    // A unit-scoped schedule inside the organisation does not answer the organisation level.
    expect(
      selectWorkSchedule({
        hierarchy: { ...hierarchy, businessUnitId: null },
        schedules: [
          {
            id: 'u',
            isDefault: false,
            businessUnitId: 'b1',
            organizationId: 'o1',
          },
        ],
      }),
    ).toBeNull();
  });

  it('breaks a tie inside one scope by list order (default, then oldest)', () => {
    expect(
      selectWorkSchedule({
        hierarchy,
        schedules: [
          {
            id: 'first',
            isDefault: true,
            businessUnitId: 'b1',
            organizationId: 'o1',
          },
          {
            id: 'second',
            isDefault: false,
            businessUnitId: 'b1',
            organizationId: 'o1',
          },
        ],
      })?.schedule.id,
    ).toBe('first');
  });
});
