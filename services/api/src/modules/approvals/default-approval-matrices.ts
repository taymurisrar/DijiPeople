import type { ApprovalActorType, ApprovalModuleKey } from '@prisma/client';

/**
 * The approval chains every tenant is seeded with.
 *
 * Lives here rather than in `prisma/seed-config.ts` so the invariant it has to
 * satisfy can be tested: that file creates a Prisma client at import time, and
 * jest's rootDir is `src`, so a spec beside it would neither import safely nor
 * run. ITEM-0113 is what made that worth fixing - the seeded chain was wrong
 * for two years' worth of tenants and no test could have said so.
 */
/*
 * ITEM-0113 — the seeded chain a new tenant could not satisfy.
 *
 * This used to seed leave as two **active** steps: sequence 1 `LINE_MANAGER`,
 * sequence 2 `ROLE(hr)`. Every matched step must bind to an active approver or
 * the whole submission is refused (BUG-1968), and a newly provisioned tenant
 * satisfies neither: nobody has a reporting manager yet, and nobody holds `hr`.
 * Leave was therefore blocked on day one for every customer, by default rather
 * than by misconfiguration.
 *
 * The repository owner chose to seed a chain a new tenant can satisfy, keeping
 * the line-manager chain as a template the administrator activates.
 *
 * Sequence 1 now routes to `system-admin`, which is the one role provisioning
 * guarantees: `provisionTenantForCustomer` assigns it to the tenant owner and
 * throws if it cannot be provisioned.
 *
 * **Satisfiable is not the same as satisfied**, and the difference is worth
 * being exact about. Provisioning creates the owner with status `INVITED`, and
 * `findActiveUsersByRoleId` requires `ACTIVE` — so this chain begins routing the
 * moment the owner accepts their invitation and signs in, not the instant the
 * tenant exists. That is a real improvement rather than a rename: signing in is
 * a precondition of using the product at all, whereas building a reporting
 * hierarchy and hiring somebody into an HR role are not. See BUG-1969 and
 * ITEM-0106 for the invited-approver question itself, which is unchanged here.
 *
 * The richer chain is seeded **inactive**, so an administrator opening Approval
 * Matrices sees the intended shape and switches it on once the hierarchy and
 * the `hr` role are populated, rather than facing a blank screen.
 */
export const DEFAULT_APPROVAL_MATRICES: Array<{
  moduleKey: ApprovalModuleKey;
  recordType: string;
  steps: Array<{
    name: string;
    sequence: number;
    approverType: ApprovalActorType;
    roleKey?: string;
    /** Seeded inactive: a template to switch on, not a step that must bind. */
    isActive?: boolean;
  }>;
}> = [
  {
    moduleKey: 'LEAVE_REQUEST' as ApprovalModuleKey,
    recordType: 'leaveRequest',
    steps: [
      {
        name: 'Leave request to tenant administrator',
        sequence: 1,
        approverType: 'ROLE' as ApprovalActorType,
        roleKey: 'system-admin',
      },
      {
        name: 'Leave request to line manager (activate once reporting lines are set)',
        sequence: 1,
        approverType: 'LINE_MANAGER' as ApprovalActorType,
        isActive: false,
      },
      {
        name: 'Leave request to HR (activate once the HR role has members)',
        sequence: 2,
        approverType: 'ROLE' as ApprovalActorType,
        roleKey: 'hr',
        isActive: false,
      },
    ],
  },
  {
    moduleKey: 'TIMESHEET' as ApprovalModuleKey,
    recordType: 'timesheet',
    steps: [
      {
        name: 'Timesheet to tenant administrator',
        sequence: 1,
        approverType: 'ROLE' as ApprovalActorType,
        roleKey: 'system-admin',
      },
      {
        name: 'Timesheet to line manager (activate once reporting lines are set)',
        sequence: 1,
        approverType: 'LINE_MANAGER' as ApprovalActorType,
        isActive: false,
      },
    ],
  },
];
