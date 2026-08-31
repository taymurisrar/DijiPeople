import Link from "next/link";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import type {
  ApprovalActionItem,
  ApprovalDetailResponse,
} from "./approval-types";

type ApprovalDetail = ApprovalDetailResponse["item"];

/**
 * The approval chain and its history.
 *
 * The record page rendered the same six fields as the list and nothing else, so
 * the questions an approver actually arrives with — who else has to sign this,
 * where is it now, what did the last person say, and what am I approving — had
 * no answer on the screen. `GET /approvals/:id` has always returned the steps,
 * the assignments and every action with its comment; nothing displayed them.
 */
export function ApprovalChain({
  approval,
  moduleLabel,
}: {
  readonly approval: ApprovalDetail;
  readonly moduleLabel: string;
}) {
  const steps = [...(approval.steps ?? [])].sort(
    (left, right) => left.stepOrder - right.stepOrder,
  );
  const history = [...(approval.actions ?? [])].sort(sortByActionTime);

  return (
    <div className="grid gap-6">
      <SectionCard
        description={`This request was raised by ${moduleLabel}, which is where the record it approves lives.`}
        title="Source record"
      >
        <Link
          className="inline-flex items-center rounded-full border border-accent/20 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
          href={approval.relatedRecordUrl}
        >
          Open the {moduleLabel.toLowerCase()} record
        </Link>
        {approval.decision.reason ? (
          /*
           * The same sentence the command bar shows on a disabled button, kept
           * here as well: someone who cannot act needs to know why without
           * hovering a greyed-out control to find out.
           */
          <p className="mt-4 text-sm leading-6 text-muted">
            {approval.decision.reason}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        description="Every step this request has to pass, in order, and who it sits with."
        title="Approval chain"
      >
        {steps.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            This request has no approval steps. It was approved on submission
            because no approval route resolved for it.
          </p>
        ) : (
          <ol className="grid gap-3">
            {steps.map((step) => {
              const isCurrent = step.id === approval.currentStep?.id;
              return (
                <li
                  className={`rounded-[18px] border p-4 ${
                    isCurrent
                      ? "border-accent/40 bg-accent-soft/40"
                      : "border-border bg-surface"
                  }`}
                  key={step.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {step.stepName || `Step ${step.stepOrder}`}
                      </span>
                      {isCurrent ? (
                        <StatusPill tone="info">Awaiting decision</StatusPill>
                      ) : null}
                    </div>
                    <StatusPill tone={stepTone(step.status)}>
                      {humanize(step.status)}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {describeAssignees(step.assignments)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>

      <SectionCard
        description="What has happened to this request, oldest first."
        title="History"
      >
        {history.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            Nothing has been recorded against this request yet.
          </p>
        ) : (
          <ol className="grid gap-3">
            {history.map((action) => (
              <li
                className="rounded-[18px] border border-border bg-surface p-4"
                key={action.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {humanize(action.actionType)}
                    {action.actionByUser
                      ? ` by ${fullName(action.actionByUser)}`
                      : ""}
                  </span>
                  {action.actionAtUtc ? (
                    <time
                      className="text-xs text-muted"
                      dateTime={action.actionAtUtc}
                    >
                      {formatUtc(action.actionAtUtc)}
                    </time>
                  ) : null}
                </div>
                {action.comment ? (
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {action.comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

function describeAssignees(
  assignments: ApprovalDetail["steps"][number]["assignments"],
) {
  if (!assignments?.length) return "Nobody is assigned to this step.";

  const names = assignments
    .map((assignment) =>
      assignment.assignedToUser
        ? fullName(assignment.assignedToUser)
        : (assignment.assignedToRole?.name ?? ""),
    )
    .filter(Boolean);

  if (names.length === 0) return "Nobody is assigned to this step.";

  return `Assigned to ${names.join(", ")}`;
}

function sortByActionTime(left: ApprovalActionItem, right: ApprovalActionItem) {
  return (left.actionAtUtc ?? "").localeCompare(right.actionAtUtc ?? "");
}

function stepTone(status: string) {
  const normalized = status?.toUpperCase() ?? "";
  if (normalized === "APPROVED") return "good" as const;
  if (normalized === "REJECTED") return "danger" as const;
  if (normalized === "PENDING") return "warning" as const;
  if (normalized === "SKIPPED") return "muted" as const;
  return "muted" as const;
}

/** `NOT_STARTED` is not a word. */
function humanize(value: string) {
  if (!value) return "";
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/*
 * UTC, stated as UTC.
 *
 * This is a server component, so a locale-dependent format would be rendered
 * with the server's locale and then hydrated with the visitor's — the defect
 * BUG-2626 records on the dashboard. A fixed format with the zone named avoids
 * both the mismatch and the ambiguity.
 */
function formatUtc(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const date = parsed.toISOString().slice(0, 10);
  const time = parsed.toISOString().slice(11, 16);
  return `${date} ${time} UTC`;
}

function fullName(user: { firstName: string; lastName: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
