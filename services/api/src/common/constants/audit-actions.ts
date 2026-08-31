/**
 * The declared names of audit actions.
 *
 * Every `AuditService.log()` call site in this repository passes a string
 * literal, so until now the convention was whatever the author of that module
 * chose: `LEAVE_REQUEST_APPROVED` in one module, `attendance.manual_created` in
 * the next. Eighteen distinct actions were observed on one tenant, split across
 * two conventions with no mapping between them (BUG-2046).
 *
 * **The canonical convention is `SCREAMING_SNAKE`.** It is what the majority of
 * existing actions already use, it matches the enum-member convention this
 * repository states in `AGENTS.md`, and it matches the error catalog next door.
 * New actions are declared here and referenced by constant.
 *
 * Existing rows are not rewritten. Rewriting historical `action` values would
 * be an audit trail editing itself, which is the one thing an audit trail must
 * not do; the read side reconciles the two conventions instead — see
 * `resolveAuditActionAliases()`.
 *
 * This catalog is not yet exhaustive. It declares the actions written by the
 * call sites added for BUG-2044, the attendance/project/auth call sites
 * migrated to canonical form for BUG-2046 (the ones the bug report cited as
 * evidence, plus their direct siblings in the same files), and the legacy
 * names needed to read the log consistently. Migrating the remaining
 * literals across the rest of the ~82 files is its own task; a call site
 * that still passes a literal is not broken, it is simply not yet declared.
 */
export const AUDIT_ACTIONS = {
  /*
   * Reports & Analytics — TASK-0028.
   *
   * Deliberately NOT audited: running a report, changing a filter, or
   * repainting a chart. Those are reads a user performs dozens of times an
   * hour, and recording them would bury the events below — a share, an
   * export, a schedule change — in noise. What is audited is the creation
   * and movement of data OUT of the product, and any change to who can see
   * it. Viewing is tracked as product state on ReportRecentView instead,
   * which is not an audit trail and does not pretend to be one.
   */
  REPORT_DEFINITION_CREATED: 'REPORT_DEFINITION_CREATED',
  REPORT_DEFINITION_UPDATED: 'REPORT_DEFINITION_UPDATED',
  REPORT_DEFINITION_DELETED: 'REPORT_DEFINITION_DELETED',
  REPORT_DEFINITION_DUPLICATED: 'REPORT_DEFINITION_DUPLICATED',
  REPORT_SHARED: 'REPORT_SHARED',
  REPORT_EXPORTED: 'REPORT_EXPORTED',
  SENSITIVE_REPORT_EXPORTED: 'SENSITIVE_REPORT_EXPORTED',
  REPORT_SCHEDULE_CREATED: 'REPORT_SCHEDULE_CREATED',
  REPORT_SCHEDULE_UPDATED: 'REPORT_SCHEDULE_UPDATED',
  REPORT_SCHEDULE_DELETED: 'REPORT_SCHEDULE_DELETED',
  REPORT_SCHEDULE_EXECUTED: 'REPORT_SCHEDULE_EXECUTED',
  DESKTOP_ANALYTICS_VIEWED: 'DESKTOP_ANALYTICS_VIEWED',

  /* Employee lifecycle — BUG-2044. */
  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  EMPLOYEE_REPORTING_MANAGER_ASSIGNED: 'EMPLOYEE_REPORTING_MANAGER_ASSIGNED',

  /* Organizational placement — BUG-2044. */
  /*
   * There is no `DEPARTMENT_DELETED`. `deleteDepartment()` delegates to
   * `updateDepartment()`, which records the status change it actually performs.
   */
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  DESIGNATION_CREATED: 'DESIGNATION_CREATED',
  DESIGNATION_UPDATED: 'DESIGNATION_UPDATED',
  DESIGNATION_DELETED: 'DESIGNATION_DELETED',

  /* Leave — BUG-2044. Approval and rejection already existed. */
  LEAVE_REQUEST_SUBMITTED: 'LEAVE_REQUEST_SUBMITTED',
  LEAVE_REQUEST_CANCELLED: 'LEAVE_REQUEST_CANCELLED',
  LEAVE_REQUEST_APPROVED: 'LEAVE_REQUEST_APPROVED',
  LEAVE_REQUEST_REJECTED: 'LEAVE_REQUEST_REJECTED',
  LEAVE_TYPE_CREATED: 'LEAVE_TYPE_CREATED',
  LEAVE_TYPE_UPDATED: 'LEAVE_TYPE_UPDATED',
  LEAVE_POLICY_CREATED: 'LEAVE_POLICY_CREATED',
  LEAVE_POLICY_UPDATED: 'LEAVE_POLICY_UPDATED',
  LEAVE_POLICY_RULE_CREATED: 'LEAVE_POLICY_RULE_CREATED',
  LEAVE_POLICY_ASSIGNMENT_CREATED: 'LEAVE_POLICY_ASSIGNMENT_CREATED',

  /*
   * Migrated to canonical form for BUG-2046. These five call sites are the
   * ones the bug report cited as evidence of the dotted convention —
   * `attendance.manual_created`, `attendance.deleted`, `project.create`,
   * `project.update`, `auth.login.succeeded` — plus their direct siblings in
   * the same files (`attendance.manual_updated`, the project-allocation
   * delete, and the login-failure branches). New rows are written under
   * these names; the dotted spelling a row was written under before this fix
   * stays in `LEGACY_AUDIT_ACTION_ALIASES` below so it is still findable.
   */
  ATTENDANCE_MANUAL_CREATED: 'ATTENDANCE_MANUAL_CREATED',
  ATTENDANCE_MANUAL_UPDATED: 'ATTENDANCE_MANUAL_UPDATED',
  ATTENDANCE_DELETED: 'ATTENDANCE_DELETED',
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_ALLOCATION_DELETED: 'PROJECT_ALLOCATION_DELETED',
  AUTH_LOGIN_SUCCEEDED: 'AUTH_LOGIN_SUCCEEDED',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Stored spellings that mean the same thing as a canonical action.
 *
 * BUG-2046. These are the `dot.lower_snake` names observed live on a tenant.
 * They are **not** a migration plan: the rows carrying them stay exactly as
 * written. Rewriting historical `action` values would be an audit trail editing
 * itself, which is the one thing an audit trail must not do — so the two
 * conventions are reconciled when the log is read, and never in the table.
 *
 * Keyed by the stored value, valued by the canonical one. A name absent here is
 * its own canonical form, which is the correct answer for every action already
 * written in `SCREAMING_SNAKE`.
 *
 * The dotted set is not internally consistent either — `project.create` against
 * `attendance.manual_created` mixes tense as well as convention — so the mapping
 * is per-name rather than a transformation rule. A rule would have to guess.
 */
export const LEGACY_AUDIT_ACTION_ALIASES: Readonly<Record<string, string>> = {
  'attendance.manual_created': 'ATTENDANCE_MANUAL_CREATED',
  'attendance.manual_updated': 'ATTENDANCE_MANUAL_UPDATED',
  'attendance.deleted': 'ATTENDANCE_DELETED',
  'project.create': 'PROJECT_CREATED',
  'project.update': 'PROJECT_UPDATED',
  'project-allocation.delete': 'PROJECT_ALLOCATION_DELETED',
  'auth.login.succeeded': 'AUTH_LOGIN_SUCCEEDED',
  'auth.login.failed': 'AUTH_LOGIN_FAILED',
};

/** Canonical name → every stored spelling that means it, canonical included. */
const STORED_SPELLINGS_BY_CANONICAL = Object.entries(
  LEGACY_AUDIT_ACTION_ALIASES,
).reduce<Record<string, string[]>>((accumulator, [stored, canonical]) => {
  accumulator[canonical] = [...(accumulator[canonical] ?? []), stored];
  return accumulator;
}, {});

/**
 * The canonical name for a stored action.
 *
 * An unknown value returns unchanged rather than null. The log holds actions
 * written by call sites this catalog has not yet reached, and dropping them
 * would hide rows — a worse outcome than presenting an undeclared name.
 */
export function canonicalAuditAction(action: string) {
  const trimmed = action.trim();
  return LEGACY_AUDIT_ACTION_ALIASES[trimmed] ?? trimmed;
}

/**
 * Every stored spelling a filter on `action` should match.
 *
 * This is the read-side half of the fix. A tenant whose log spans the change
 * holds rows under both conventions; filtering by either name must find all of
 * them, or the screen answers a compliance question with half the evidence.
 */
export function resolveAuditActionAliases(action: string): string[] {
  const trimmed = action.trim();
  if (!trimmed) return [];

  const canonical = canonicalAuditAction(trimmed);
  return [
    ...new Set([
      trimmed,
      canonical,
      ...(STORED_SPELLINGS_BY_CANONICAL[canonical] ?? []),
    ]),
  ];
}

/** The entity types the actions above are recorded against. */
export const AUDIT_ENTITY_TYPES = {
  EMPLOYEE: 'Employee',
  DEPARTMENT: 'Department',
  DESIGNATION: 'Designation',
  LEAVE_REQUEST: 'LeaveRequest',
  LEAVE_TYPE: 'LeaveType',
  LEAVE_POLICY: 'LeavePolicy',
  LEAVE_POLICY_RULE: 'LeavePolicyRule',
  LEAVE_POLICY_ASSIGNMENT: 'LeavePolicyAssignment',
  REPORT_DEFINITION: 'ReportDefinition',
  REPORT_SCHEDULE: 'ReportSchedule',
  REPORT_RUN: 'ReportRun',
} as const;
