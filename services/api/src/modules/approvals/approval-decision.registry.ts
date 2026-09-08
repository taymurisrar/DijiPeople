import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { PermissionRequirement } from '../../common/security/permission-evaluation';

export type ApprovalDecisionAction = 'approve' | 'reject' | 'cancel';

export const APPROVAL_DECISION_ACTIONS: readonly ApprovalDecisionAction[] = [
  'approve',
  'reject',
  'cancel',
];

export type ApprovalDecisionInput = {
  readonly action: ApprovalDecisionAction;
  readonly user: AuthenticatedUser;
  /** The owning module's record id — `ApprovalRequest.entityId`, not the approval's own id. */
  readonly entityId: string;
  readonly comment?: string;
};

/**
 * What one module contributes so its approvals can be decided from the generic
 * inbox.
 *
 * `ApprovalRequest` is a **mirror** for leave and attendance — `LeaveApprovalStep`
 * is the authoritative table, and the mirror is written after and outside the
 * submit transaction. Moving the mirror directly would therefore leave the leave
 * request itself PENDING while the inbox reported APPROVED. Every decision runs
 * through the owning module instead, which updates its own record, its mirror,
 * its audit row and its notifications exactly as it does from its own endpoint.
 */
export interface ApprovalDecisionDelegate {
  /** Matches `ApprovalRequest.moduleKey`. */
  readonly moduleKey: string;
  /** Matches `ApprovalRequest.entityType`; a module may raise more than one kind. */
  readonly entityTypes: readonly string[];
  /**
   * The actions this delegate accepts, each with the permission the owning
   * module's own route demands. An action absent from this map cannot be taken
   * from the inbox, and the caller is told so by name rather than shown a dead
   * button.
   */
  readonly requirements: Readonly<
    Partial<Record<ApprovalDecisionAction, PermissionRequirement>>
  >;
  execute(input: ApprovalDecisionInput): Promise<unknown>;
}

/**
 * Where the delegates meet, without the approvals module importing any of them.
 *
 * Every owning module already imports `ApprovalsModule` to raise its workflows,
 * so registration runs the same direction as the existing dependency and adds
 * no cycle. Registration happens in each module's `onModuleInit`.
 */
@Injectable()
export class ApprovalDecisionRegistry {
  private readonly logger = new Logger(ApprovalDecisionRegistry.name);
  private readonly delegates = new Map<string, ApprovalDecisionDelegate>();

  register(delegate: ApprovalDecisionDelegate): void {
    for (const entityType of delegate.entityTypes) {
      const key = registryKey(delegate.moduleKey, entityType);
      const existing = this.delegates.get(key);
      if (existing && existing !== delegate) {
        /*
         * Two delegates for one record type would make the decision path depend
         * on module registration order, which is not something a reader of
         * either module could predict. Refuse at boot rather than at 3am.
         */
        throw new Error(
          `An approval decision delegate is already registered for ${key}.`,
        );
      }
      this.delegates.set(key, delegate);
      this.logger.log(`Registered approval decision delegate for ${key}`);
    }
  }

  resolve(
    moduleKey: string,
    entityType: string,
  ): ApprovalDecisionDelegate | null {
    return this.delegates.get(registryKey(moduleKey, entityType)) ?? null;
  }

  /** Registered `module/entityType` pairs, for diagnostics and tests. */
  registeredKeys(): readonly string[] {
    return [...this.delegates.keys()].sort();
  }
}

function registryKey(moduleKey: string, entityType: string) {
  // Both are written by hand at several call sites; casing has already drifted
  // once ('TimesheetWeek' vs 'timesheetWeek'), so match case-insensitively.
  return `${moduleKey.toLowerCase()}/${entityType.toLowerCase()}`;
}
