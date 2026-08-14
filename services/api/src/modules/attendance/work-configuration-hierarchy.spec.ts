import {
  calendarCandidates,
  isExplicitSource,
  organizationalScopes,
  scheduleCandidates,
} from './work-configuration-hierarchy';

/**
 * The precedence, asserted directly.
 *
 * The order used to be an inline array inside a repository method that also did
 * the querying, so the only way to check it was to run a database — and the
 * defect it hid was real: the Work Site sat between Department and the tenant
 * default, which forced every team in one office onto a single pattern.
 */

describe('work schedule precedence', () => {
  it('puts the employee assignment above every other layer', () => {
    const candidates = scheduleCandidates({
      assignmentScheduleId: 'assignment',
      employeeScheduleId: 'employee',
      teamScheduleId: 'team',
      departmentScheduleId: 'department',
    });

    expect(candidates.map((candidate) => candidate.source)).toEqual([
      'EMPLOYEE_ASSIGNMENT',
      'EMPLOYEE_DEFAULT',
      'TEAM_DEFAULT',
      'DEPARTMENT_DEFAULT',
    ]);
    expect(candidates[0].id).toBe('assignment');
  });

  it('lets an employee override their team', () => {
    const candidates = scheduleCandidates({
      employeeScheduleId: 'employee',
      teamScheduleId: 'team',
      departmentScheduleId: 'department',
    });

    expect(candidates[0]).toEqual({
      id: 'employee',
      source: 'EMPLOYEE_DEFAULT',
    });
  });

  it('lets a team override its department', () => {
    const candidates = scheduleCandidates({
      teamScheduleId: 'team',
      departmentScheduleId: 'department',
    });

    expect(candidates[0]).toEqual({ id: 'team', source: 'TEAM_DEFAULT' });
  });

  it('falls through to the department when employee and team say nothing', () => {
    const candidates = scheduleCandidates({
      departmentScheduleId: 'department',
    });

    expect(candidates).toEqual([
      { id: 'department', source: 'DEPARTMENT_DEFAULT' },
    ]);
  });

  it('offers no candidate when nothing is assigned', () => {
    expect(scheduleCandidates({})).toEqual([]);
  });

  /*
   * The regression this whole change exists for. A Work Site is a physical
   * place; a schedule is an organizational fact. There is no input on this
   * function that could reintroduce one.
   */
  it('has no work site layer at all', () => {
    const sources = scheduleCandidates({
      assignmentScheduleId: 'a',
      employeeScheduleId: 'b',
      teamScheduleId: 'c',
      departmentScheduleId: 'd',
    }).map((candidate) => candidate.source);

    expect(sources).not.toContain('WORK_SITE_DEFAULT');
    expect(sources.some((source) => source.includes('WORK_SITE'))).toBe(false);
  });

  it('ignores blank identifiers rather than querying for them', () => {
    const candidates = scheduleCandidates({
      assignmentScheduleId: null,
      employeeScheduleId: '',
      teamScheduleId: undefined,
      departmentScheduleId: 'department',
    });

    expect(candidates).toEqual([
      { id: 'department', source: 'DEPARTMENT_DEFAULT' },
    ]);
  });
});

describe('work calendar precedence', () => {
  it('runs employee, then team, then department', () => {
    const candidates = calendarCandidates({
      employeeCalendarId: 'employee',
      teamCalendarId: 'team',
      departmentCalendarId: 'department',
    });

    expect(candidates.map((candidate) => candidate.source)).toEqual([
      'EMPLOYEE_DEFAULT',
      'TEAM_DEFAULT',
      'DEPARTMENT_DEFAULT',
    ]);
  });

  /*
   * A Karachi office may hold employees who follow a UAE calendar. The site
   * used to win outright, which made that impossible to express.
   */
  it('has no work site layer at all', () => {
    const sources = calendarCandidates({
      employeeCalendarId: 'a',
      teamCalendarId: 'b',
      departmentCalendarId: 'c',
    }).map((candidate) => candidate.source);

    expect(sources.some((source) => source.includes('WORK_SITE'))).toBe(false);
  });

  it('lets a team override its department', () => {
    const candidates = calendarCandidates({
      teamCalendarId: 'team',
      departmentCalendarId: 'department',
    });

    expect(candidates[0]).toEqual({ id: 'team', source: 'TEAM_DEFAULT' });
  });
});

describe('organizational scopes', () => {
  it('consults the business unit before the organization', () => {
    const scopes = organizationalScopes({
      teamId: null,
      departmentId: null,
      businessUnitId: 'bu-1',
      organizationId: 'org-1',
    });

    expect(scopes.map((scope) => scope.source)).toEqual([
      'BUSINESS_UNIT_SCOPE',
      'ORGANIZATION_SCOPE',
    ]);
    expect(scopes[0].businessUnitId).toBe('bu-1');
    expect(scopes[1].organizationId).toBe('org-1');
  });

  it('skips a layer the employee does not belong to', () => {
    expect(
      organizationalScopes({
        teamId: null,
        departmentId: null,
        businessUnitId: null,
        organizationId: 'org-1',
      }).map((scope) => scope.source),
    ).toEqual(['ORGANIZATION_SCOPE']);

    expect(
      organizationalScopes({
        teamId: null,
        departmentId: null,
        businessUnitId: null,
        organizationId: null,
      }),
    ).toEqual([]);
  });
});

describe('explaining a resolution', () => {
  it('separates an explicit assignment from a fallback', () => {
    expect(isExplicitSource('EMPLOYEE_ASSIGNMENT')).toBe(true);
    expect(isExplicitSource('TEAM_DEFAULT')).toBe(true);
    expect(isExplicitSource('DEPARTMENT_DEFAULT')).toBe(true);
    expect(isExplicitSource('BUSINESS_UNIT_SCOPE')).toBe(false);
    expect(isExplicitSource('TENANT_DEFAULT')).toBe(false);
  });
});
