/**
 * Where an employee's work schedule and work calendar come from.
 *
 * WHY THIS IS ITS OWN FILE. The precedence is the whole rule, and it was
 * previously an inline array in a repository method that also did the querying —
 * which meant the only way to check the order was to run a database. Kept pure
 * here so the order can be asserted directly, and so the same order serves both
 * the schedule and the calendar without being written twice.
 *
 * THE RULE. Most specific wins, running down the organizational hierarchy:
 *
 *   Employee -> Team -> Department -> Business Unit -> Organization -> Tenant
 *
 * WORK SITE DOES NOT PARTICIPATE. A Work Site is a physical place. One office
 * holds a Finance team on 09:00-18:00 and a Support team on a 24/7 rotation, and
 * its employees may follow different regional calendars. Letting the site decide
 * forced every one of them onto a single pattern, which is the defect this
 * replaces. `Location.defaultWorkScheduleId` and `Location.holidayCalendarId`
 * still exist so tenant data is preserved, but nothing below reads them.
 */

export type WorkConfigurationSource =
  | 'EMPLOYEE_ASSIGNMENT'
  | 'EMPLOYEE_DEFAULT'
  | 'TEAM_DEFAULT'
  | 'DEPARTMENT_DEFAULT'
  | 'BUSINESS_UNIT_SCOPE'
  | 'ORGANIZATION_SCOPE'
  | 'WORK_SCHEDULE_CALENDAR'
  | 'TENANT_DEFAULT';

export interface WorkConfigurationCandidate {
  readonly id: string;
  readonly source: WorkConfigurationSource;
}

export interface EmployeeHierarchy {
  readonly teamId: string | null;
  readonly departmentId: string | null;
  readonly businessUnitId: string | null;
  readonly organizationId: string | null;
}

/**
 * Schedule candidates, most specific first.
 *
 * `assignmentScheduleId` is the effective-dated `EmployeeScheduleAssignment`,
 * which outranks the employee's standing default: a temporary reassignment is a
 * deliberate, dated statement about a period, and the default is what applies
 * when no such statement covers the day.
 *
 * Business Unit and Organization carry no schedule column of their own; those
 * layers are resolved from the schedule's own `businessUnitId`/`organizationId`
 * scope, which the WorkSchedule model already carries. Adding two more pointer
 * columns to say the same thing would have created a second source of truth.
 */
export function scheduleCandidates(input: {
  readonly assignmentScheduleId?: string | null;
  readonly employeeScheduleId?: string | null;
  readonly teamScheduleId?: string | null;
  readonly departmentScheduleId?: string | null;
}): readonly WorkConfigurationCandidate[] {
  return compact([
    { id: input.assignmentScheduleId, source: 'EMPLOYEE_ASSIGNMENT' as const },
    { id: input.employeeScheduleId, source: 'EMPLOYEE_DEFAULT' as const },
    { id: input.teamScheduleId, source: 'TEAM_DEFAULT' as const },
    { id: input.departmentScheduleId, source: 'DEPARTMENT_DEFAULT' as const },
  ]);
}

/**
 * Calendar candidates, most specific first.
 *
 * The owning work schedule's calendar sits below every organizational layer but
 * above the tenant default: a schedule that names a calendar is describing the
 * pattern it belongs to, which is more specific than "whatever the tenant uses"
 * and less specific than a statement made about this employee or their team.
 */
export function calendarCandidates(input: {
  readonly employeeCalendarId?: string | null;
  readonly teamCalendarId?: string | null;
  readonly departmentCalendarId?: string | null;
}): readonly WorkConfigurationCandidate[] {
  return compact([
    { id: input.employeeCalendarId, source: 'EMPLOYEE_DEFAULT' as const },
    { id: input.teamCalendarId, source: 'TEAM_DEFAULT' as const },
    { id: input.departmentCalendarId, source: 'DEPARTMENT_DEFAULT' as const },
  ]);
}

/**
 * The organizational scopes to search, broadest-last.
 *
 * Returned as an ordered list rather than two separate lookups so the caller
 * cannot accidentally consult the Organization before the Business Unit.
 */
export function organizationalScopes(hierarchy: EmployeeHierarchy): readonly {
  readonly source: WorkConfigurationSource;
  readonly businessUnitId?: string;
  readonly organizationId?: string;
}[] {
  const scopes: {
    source: WorkConfigurationSource;
    businessUnitId?: string;
    organizationId?: string;
  }[] = [];

  if (hierarchy.businessUnitId) {
    scopes.push({
      source: 'BUSINESS_UNIT_SCOPE',
      businessUnitId: hierarchy.businessUnitId,
    });
  }
  if (hierarchy.organizationId) {
    scopes.push({
      source: 'ORGANIZATION_SCOPE',
      organizationId: hierarchy.organizationId,
    });
  }

  return scopes;
}

/**
 * True when a source came from an explicit assignment rather than a fallback.
 *
 * Used to explain a resolution to an administrator: "this employee is on the
 * Support rotation because their team says so" reads very differently from
 * "because nothing else was configured".
 */
export function isExplicitSource(source: WorkConfigurationSource) {
  return (
    source === 'EMPLOYEE_ASSIGNMENT' ||
    source === 'EMPLOYEE_DEFAULT' ||
    source === 'TEAM_DEFAULT' ||
    source === 'DEPARTMENT_DEFAULT'
  );
}

function compact(
  entries: readonly {
    readonly id?: string | null;
    readonly source: WorkConfigurationSource;
  }[],
): readonly WorkConfigurationCandidate[] {
  return entries.filter(
    (entry): entry is WorkConfigurationCandidate =>
      typeof entry.id === 'string' && entry.id.length > 0,
  );
}
