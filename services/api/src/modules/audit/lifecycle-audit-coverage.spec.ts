import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { OrganizationService } from '../organization/organization.service';

/**
 * BUG-2044, the structural half.
 *
 * The record's deeper finding is not that six call sites were missing — it is
 * that **the absence of an audit call is invisible**. Nothing failed when
 * employee creation went unaudited; the gap could only be found by performing
 * the operation on a live tenant and reading the log.
 *
 * A spec that hardcodes the operations this fix happened to cover would go
 * green while the next unaudited operation ships. This one instead enumerates
 * the write methods each service actually exposes, at runtime, off the
 * prototype — so a method added later appears in neither list below and fails
 * here, forcing a decision rather than a silent omission.
 *
 * The exempt list is as important as the audited one. An entry there is a
 * decision that has been taken and written down; an entry in neither is a
 * decision nobody has made yet.
 *
 * TypeScript's `private` is compile-time only, so private helpers appear here
 * too. That is deliberate: a private helper that performs a write still needs
 * the decision made about it.
 *
 * **Read this beside REG-308.** That regression records the opposite failure
 * mode on the same trail: 216 of 305 rows on one tenant were background-job
 * completions, machine events crowding out the human actions an auditor opens
 * the log to find. The two constraints pull against each other and both hold —
 * every actor decision earns a row, and nothing else does. Adding an entry to
 * the audited list below is also a claim that the operation is an actor
 * decision, not telemetry.
 */

/** Prefixes that identify a state-changing method by this codebase's naming. */
const WRITE_METHOD_PATTERN =
  /^(create|update|delete|assign|submit|cancel|archive|deactivate|provision|import|restore)/;

type Coverage = {
  readonly service: string;
  readonly prototype: object;
  /** Operations that must write an audit row. */
  readonly audited: readonly string[];
  /** Operations deliberately not audited here, each with its reason. */
  readonly exempt: Readonly<Record<string, string>>;
};

const COVERAGE: readonly Coverage[] = [
  {
    service: 'EmployeesService',
    prototype: EmployeesService.prototype,
    audited: [
      'create',
      'update',
      'assignManager',
      'assignOwner',
      'importEmployees',
      'provisionAccess',
      'provisionEmployeeUserAccess',
    ],
    exempt: {
      assignDefaultBenefitsSafely:
        'Audits its own failure path as EMPLOYEE_DEFAULT_BENEFITS_ASSIGNMENT_FAILED. The success path is part of employee creation, which is audited, and a second row per hire would be noise of exactly the kind REG-308 records.',
    },
  },
  {
    service: 'OrganizationService',
    prototype: OrganizationService.prototype,
    audited: [
      'createDepartment',
      'updateDepartment',
      'createDesignation',
      'updateDesignation',
      'deleteDesignation',
    ],
    exempt: {
      /*
       * Arrived from the organization stream of the same sweep, and this guard
       * is what surfaced it — which is the point of enumerating the prototype
       * rather than hardcoding a list. TypeScript's `private` is compile-time
       * only, so a private helper still shows up here and has to be decided.
       */
      updateDepartmentRow:
        'Private helper wrapping the repository write in the P2002 try/catch BUG-1958 needed. Its callers (createDepartment, updateDepartment) write the audit row; auditing here too would double-count every department write.',
      deleteDepartment:
        'Delegates to updateDepartment, which audits the INACTIVE/ARCHIVED status change that actually happens.',
      createOrganization:
        'Out of scope for BUG-2044, which named departments and designations. Recorded on the record rather than silently left.',
      updateOrganization: 'As createOrganization.',
      deleteOrganization: 'As createOrganization.',
      createBusinessUnit: 'As createOrganization.',
      updateBusinessUnit: 'As createOrganization.',
      deleteBusinessUnit: 'As createOrganization.',
      createLocation: 'As createOrganization.',
      updateLocation: 'As createOrganization.',
    },
  },
  {
    service: 'LeaveService',
    prototype: LeaveService.prototype,
    audited: [
      'createLeaveType',
      'updateLeaveType',
      'createLeavePolicy',
      'updateLeavePolicy',
      'createLeavePolicyRule',
      'createLeavePolicyAssignment',
      'submitLeaveRequest',
      'cancelLeaveRequest',
    ],
    exempt: {
      deactivateLeaveType:
        'Delegates to updateLeaveType, which audits the isActive change.',
      deactivateLeavePolicy:
        'Delegates to updateLeavePolicy, which audits the isActive change.',
      updateLeavePolicyRule:
        'Out of scope for BUG-2044, which named policy rule creation. Recorded on the record rather than silently left.',
      deleteLeavePolicyRule: 'As updateLeavePolicyRule.',
      updateLeavePolicyAssignment: 'As updateLeavePolicyRule.',
      deleteLeavePolicyAssignment: 'As updateLeavePolicyRule.',
    },
  },
];

function writeMethodsOf(prototype: object) {
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .filter((name) => WRITE_METHOD_PATTERN.test(name))
    .filter(
      (name) =>
        typeof (prototype as Record<string, unknown>)[name] === 'function',
    )
    .sort();
}

describe('lifecycle audit coverage', () => {
  it.each(COVERAGE.map((entry) => [entry.service, entry] as const))(
    '%s classifies every write method it exposes',
    (_service, entry) => {
      const classified = new Set([
        ...entry.audited,
        ...Object.keys(entry.exempt),
      ]);
      const unclassified = writeMethodsOf(entry.prototype).filter(
        (name) => !classified.has(name),
      );

      /*
       * A method landing here is not necessarily a defect — it is an
       * undecided question. Either it writes an audit row and belongs in
       * `audited`, or it does not and belongs in `exempt` with the reason.
       */
      expect(unclassified).toEqual([]);
    },
  );

  it.each(COVERAGE.map((entry) => [entry.service, entry] as const))(
    '%s lists no method that no longer exists',
    (_service, entry) => {
      /*
       * The other direction. A renamed method would otherwise leave its name
       * sitting in `audited`, and the list would keep claiming coverage of an
       * operation that is gone.
       */
      const present = new Set(Object.getOwnPropertyNames(entry.prototype));
      const missing = [...entry.audited, ...Object.keys(entry.exempt)].filter(
        (name) => !present.has(name),
      );

      expect(missing).toEqual([]);
    },
  );

  it('found write methods to classify at all', () => {
    /*
     * An `it.each` over an empty set is green, and so is a filter that matched
     * nothing. If the prototype reflection ever stops finding methods, these
     * assertions would pass while checking nothing.
     */
    for (const entry of COVERAGE) {
      expect(writeMethodsOf(entry.prototype).length).toBeGreaterThan(0);
      expect(entry.audited.length).toBeGreaterThan(0);
    }
  });

  it('classifies each method exactly once', () => {
    for (const entry of COVERAGE) {
      const overlap = entry.audited.filter((name) => name in entry.exempt);
      expect(overlap).toEqual([]);
    }
  });
});
