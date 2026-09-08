import { moduleDisplayName } from "./approval-display";
import type { ApprovalRequestItem } from "./approval-types";

/**
 * One approval, flattened into the shape the runtime record page reads.
 *
 * Extracted from the two pages that build it so the mapping can be tested. The
 * capability keys are the reason it matters: `dynamicDisabled` on each approval
 * command names a **single field by logical name** on the record, and if the
 * spec and this mapping ever disagree about that name, every button silently
 * falls back to disabled — the exact defect BUG-2718 fixed, arrived at from the
 * other direction and just as invisible. `approval-decision-commands.spec.ts`
 * asserts the two agree.
 */
export function buildApprovalRecord(approval: ApprovalRequestItem) {
  return {
    ...approval,
    approvalName: approval.title || approval.requestNumber || approval.id,
    moduleLabel: moduleDisplayName(approval.moduleKey),
    requesterName:
      fullName(approval.submittedByUser) ||
      fullName(approval.submittedForEmployee) ||
      "Unknown requester",
    assignedToName:
      approval.currentStep?.assignments
        .map((assignment) =>
          assignment.assignedToUser
            ? fullName(assignment.assignedToUser)
            : assignment.assignedToRole?.name,
        )
        .filter(Boolean)
        .join(", ") ?? "",
    submittedAt: approval.submittedAtUtc,
    canApprove: approval.decision?.canApprove ?? false,
    canReject: approval.decision?.canReject ?? false,
    canCancel: approval.decision?.canCancel ?? false,
    decisionReason: approval.decision?.reason ?? "",
  };
}

function fullName(
  user:
    | {
        readonly firstName: string;
        readonly lastName: string;
      }
    | null
    | undefined,
) {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
