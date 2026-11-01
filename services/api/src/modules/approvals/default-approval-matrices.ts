import type {
  ApprovalActorType,
  ApprovalModuleKey,
  PrismaClient,
} from '@prisma/client';

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
/** Roles that may carry the default "tenant administrator" step, in preference order. */
export const ADMINISTRATOR_ROLE_KEYS = ['system-admin', 'global-admin'] as const;

export const DEFAULT_APPROVAL_MATRICES: Array<{
  moduleKey: ApprovalModuleKey;
  recordType: string;
  steps: Array<{
    name: string;
    sequence: number;
    approverType: ApprovalActorType;
    roleKey?: string;
    /**
     * Candidate roles in preference order; the seed binds the FIRST one that has
     * an ACTIVE holder in the tenant (DP-QA-036). Used instead of a fixed
     * `roleKey` because provisioning paths disagree on which administrator role
     * the owner ends up with (`system-admin` via onboarding records,
     * `global-admin` via identity provisioning).
     */
    roleKeys?: readonly string[];
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
        roleKeys: ADMINISTRATOR_ROLE_KEYS,
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
        roleKeys: ADMINISTRATOR_ROLE_KEYS,
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

/*
 * DP-QA-036 - the default chain pointed at `system-admin`, a role the tenant
 * owner does not hold when the tenant was created through the identity
 * provisioning path (owner = `global-admin` only). Every deploy's `seed:config`
 * then installed an active step nobody could satisfy, and leave and timesheet
 * submission were refused with APPROVAL_ROUTE_UNRESOLVED.
 *
 * Rules this implements:
 *  - a role step is only seeded ACTIVE when its role has an ACTIVE holder now;
 *  - a tenant with no administrator holder yet gets NOTHING for the module (the
 *    resolver's reporting-manager -> HR fallback keeps submissions working) and
 *    is picked up by the next seed once the owner has activated;
 *  - a tenant that already has any matrix for the module is never touched,
 *    except for the exact repair below.
 */
type SeedTarget = { id: string };

async function activeHolderCount(
  client: PrismaClient,
  tenantId: string,
  roleId: string,
) {
  return client.user.count({
    where: { tenantId, status: 'ACTIVE', userRoles: { some: { roleId } } },
  });
}

async function findStaffedAdministratorRole(
  client: PrismaClient,
  tenantId: string,
  roleKeys: readonly string[],
) {
  for (const key of roleKeys) {
    const role = await client.role.findFirst({
      where: { tenantId, key, isActive: true },
      select: { id: true },
    });
    if (role && (await activeHolderCount(client, tenantId, role.id)) > 0) {
      return role.id;
    }
  }
  return null;
}

export async function seedDefaultApprovalMatrices(
  client: PrismaClient,
  tenants: SeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    for (const matrix of DEFAULT_APPROVAL_MATRICES) {
      const existing = await client.approvalMatrix.count({
        where: { tenantId: tenant.id, moduleKey: matrix.moduleKey },
      });

      // A tenant that already configured this module keeps its own rules.
      if (existing > 0) continue;

      const rows: Array<{
        step: (typeof matrix.steps)[number];
        approverRoleId?: string;
      }> = [];
      let routable = true;
      for (const step of matrix.steps) {
        const active = step.isActive ?? true;
        if (!step.roleKey && !step.roleKeys) {
          rows.push({ step });
          continue;
        }
        const candidates = step.roleKeys ?? [step.roleKey as string];
        // Inactive templates only need the role to exist; active steps need a holder.
        let roleId: string | null | undefined;
        if (active) {
          roleId = await findStaffedAdministratorRole(
            client,
            tenant.id,
            candidates,
          );
          if (!roleId) {
            routable = false;
            break;
          }
        } else {
          roleId = (
            await client.role.findFirst({
              where: { tenantId: tenant.id, key: candidates[0] },
              select: { id: true },
            })
          )?.id;
          if (!roleId) continue;
        }
        rows.push({ step, approverRoleId: roleId });
      }

      // Nobody can be bound to the active step yet: seed nothing, leave the
      // fallback route in charge, and retry on the next run.
      if (!routable) continue;

      for (const { step, approverRoleId } of rows) {
        await client.approvalMatrix.create({
          data: {
            tenantId: tenant.id,
            moduleKey: matrix.moduleKey,
            recordType: matrix.recordType,
            name: step.name,
            sequence: step.sequence,
            approverType: step.approverType,
            approvalMode: 'ANY_ONE',
            isActive: step.isActive ?? true,
            ...(approverRoleId ? { approverRoleId } : {}),
          },
        });
        count += 1;
      }
    }
  }

  return count;
}

/**
 * Repairs the rows RUN-006 found in the field: the seed's own default step,
 * still active and still unchanged, bound to a role with no active holder.
 * Re-points it at a staffed administrator role, or - when none exists yet -
 * deactivates it so the fallback route works instead of every submission being
 * refused. A step an administrator renamed, re-pointed or edited in any other way
 * does not match and is never touched.
 */
export async function repairUnroutableDefaultApprovalMatrices(
  client: PrismaClient,
  tenants: SeedTarget[],
) {
  let repaired = 0;
  const defaultSteps = DEFAULT_APPROVAL_MATRICES.flatMap((matrix) =>
    matrix.steps
      .filter((step) => step.roleKeys && (step.isActive ?? true))
      .map((step) => ({ matrix, step })),
  );

  for (const tenant of tenants) {
    for (const { matrix, step } of defaultSteps) {
      const rows = await client.approvalMatrix.findMany({
        where: {
          tenantId: tenant.id,
          moduleKey: matrix.moduleKey,
          name: step.name,
          isActive: true,
          approverType: step.approverType,
          approverRole: { key: { in: [...(step.roleKeys ?? [])] } },
        },
        select: { id: true, approverRoleId: true },
      });

      for (const row of rows) {
        if (
          row.approverRoleId &&
          (await activeHolderCount(client, tenant.id, row.approverRoleId)) > 0
        ) {
          continue;
        }
        const staffed = await findStaffedAdministratorRole(
          client,
          tenant.id,
          step.roleKeys ?? [],
        );
        await client.approvalMatrix.updateMany({
          where: { id: row.id, tenantId: tenant.id },
          data: staffed
            ? { approverRoleId: staffed }
            : { isActive: false },
        });
        repaired += 1;
      }
    }
  }

  return repaired;
}
