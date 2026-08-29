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
 * call sites added for BUG-2044 plus the legacy names needed to read the log
 * consistently. Migrating the remaining literals across 82 files is its own
 * task; a call site that still passes a literal is not broken, it is simply not
 * yet declared.
 */
export const AUDIT_ACTIONS = {
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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

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
} as const;
