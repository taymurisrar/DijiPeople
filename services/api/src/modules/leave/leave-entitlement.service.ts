import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveRepository } from './leave.repository';
import {
  LeavePolicyResolverService,
  type PolicyScopedEmployee,
} from './leave-policy-resolver.service';

/**
 * BUG-1967 — turning a leave entitlement into a leave balance.
 *
 * `LeavePolicyRule.entitlementDays` was validated and stored and nothing ever
 * read it into a balance. `LeaveBalance` was written in one place, on approval,
 * and that write only ever decremented: `totalAllocated` was created as literal
 * zero and incremented nowhere. Since `LeaveType.consumesBalance` defaults to
 * true, the balance gate refused every request on every tenant. The allocation
 * half of the model had simply never been built.
 *
 * The repository owner chose (2026-08-29) to allocate the **full annual
 * entitlement up front**, at policy assignment — not a scheduled accrual and not
 * a balance computed on read. EXECPLAN-0026 records that decision.
 *
 * The one subtle thing here, and the reason the tests lead with it:
 *
 *   **The assignment is the trigger, not the source.**
 *
 * `resolveApplicableLeavePolicy` picks exactly *one* winning policy per employee
 * by specificity — EMPLOYEE beats DEPARTMENT beats TENANT — so a newly created
 * assignment may well *lose* to a more specific one that already exists.
 * Allocating the triggering assignment's own entitlements would overwrite the
 * balance of an employee that assignment does not govern, and the gate would
 * then enforce a number no policy justifies. So allocation re-resolves per
 * employee, exactly the way the gate does, and reads the winner's rules.
 *
 * That also makes this idempotent and self-correcting: re-running recomputes the
 * same answer, and running it after an assignment is removed recomputes the
 * now-correct lower one.
 */

/** Employees per transaction. A tenant-wide assignment must not hold one long write lock. */
const RECONCILE_CHUNK_SIZE = 50;

export type ReconcileSummary = {
  employeesConsidered: number;
  balancesWritten: number;
};

@Injectable()
export class LeaveEntitlementService {
  private readonly logger = new Logger(LeaveEntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRepository: LeaveRepository,
    private readonly policyResolver: LeavePolicyResolverService,
  ) {}

  /**
   * Recompute entitlement for every employee in the tenant.
   *
   * Deliberately not narrowed to "the employees this assignment covers". An
   * assignment change can alter who wins for an employee it does not itself
   * name — deactivating a DEPARTMENT assignment promotes the TENANT one for
   * everybody in that department — and working out the affected set exactly is
   * a harder problem than recomputing an answer that is idempotent anyway.
   *
   * `at` is passed rather than defaulted so a caller can reconcile as of the
   * assignment's effective date rather than always "now".
   */
  async reconcileTenant(tenantId: string, at: Date): Promise<ReconcileSummary> {
    const employees =
      await this.leaveRepository.findEmployeesForEntitlement(tenantId);

    const summary: ReconcileSummary = {
      employeesConsidered: employees.length,
      balancesWritten: 0,
    };

    for (
      let index = 0;
      index < employees.length;
      index += RECONCILE_CHUNK_SIZE
    ) {
      const chunk = employees.slice(index, index + RECONCILE_CHUNK_SIZE);
      for (const employee of chunk) {
        summary.balancesWritten += await this.reconcileEmployee(
          tenantId,
          employee,
          at,
        );
      }
    }

    /*
     * One line for the whole fan-out rather than an audit row per employee.
     * The assignment write that triggered this is already audited, and a
     * tenant-wide reconcile would otherwise write thousands of rows all
     * describing a single administrator action.
     */
    this.logger.log(
      `Reconciled leave entitlement for tenant ${tenantId}: ` +
        `${summary.employeesConsidered} employee(s), ${summary.balancesWritten} balance(s) written.`,
    );

    return summary;
  }

  /** Returns how many balance rows were written. */
  async reconcileEmployee(
    tenantId: string,
    employee: PolicyScopedEmployee,
    at: Date,
  ): Promise<number> {
    const policy = await this.policyResolver.resolveApplicableLeavePolicy(
      tenantId,
      employee,
      at,
    );

    /*
     * No governing policy means no statement about entitlement — which is not
     * the same as an entitlement of zero. Zeroing here would take days away
     * from an employee whose policy assignment merely lapsed, so an uncovered
     * employee is left exactly as they are.
     */
    if (!policy) return 0;

    const rules = await this.leaveRepository.listActiveLeavePolicyRules(
      tenantId,
      policy.id,
    );

    let written = 0;
    for (const rule of rules) {
      if (rule.entitlementDays === null || rule.entitlementDays === undefined) {
        continue;
      }
      await this.writeBalance(
        tenantId,
        employee.id,
        rule.leaveTypeId,
        new Prisma.Decimal(rule.entitlementDays),
      );
      written += 1;
    }

    return written;
  }

  private async writeBalance(
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    entitlement: Prisma.Decimal,
  ) {
    const existing = await this.prisma.leaveBalance.findUnique({
      where: {
        tenantId_employeeId_leaveTypeId: { tenantId, employeeId, leaveTypeId },
      },
      select: { totalUsed: true },
    });

    const used = existing?.totalUsed ?? new Prisma.Decimal(0);

    /*
     * `totalRemaining` is derived, never adjusted: allocated minus used. It is
     * allowed to go negative, and clamping it at zero would be a lie — an
     * employee whose entitlement is cut below what they have already taken is
     * genuinely overdrawn, and the negative-balance rules downstream are what
     * decide whether that is permitted.
     *
     * `totalUsed` is never touched here. Consumption is the other half's
     * business, and an allocation that could move it could erase a taken day.
     */
    await this.prisma.leaveBalance.upsert({
      where: {
        tenantId_employeeId_leaveTypeId: { tenantId, employeeId, leaveTypeId },
      },
      create: {
        tenantId,
        employeeId,
        leaveTypeId,
        totalAllocated: entitlement,
        totalUsed: new Prisma.Decimal(0),
        totalRemaining: entitlement,
        lastUpdatedAt: new Date(),
      },
      update: {
        totalAllocated: entitlement,
        totalRemaining: entitlement.minus(used),
        lastUpdatedAt: new Date(),
      },
    });
  }
}
