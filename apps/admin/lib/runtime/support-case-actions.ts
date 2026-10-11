import type { RuntimeActionDefinition } from "./platform-runtime.types";

/*
 * Support case commands (WS11).
 *
 * The status a command may be offered from comes from the lifecycle table the
 * API enforces — `SUPPORT_CASE_TRANSITIONS` in
 * services/api/src/modules/support-cases/support-case-lifecycle.ts. Neither
 * workspace can import the other's source, so the table is mirrored here and
 * `support-case-actions.spec.ts` proves this copy equals the API's contract
 * file. Offering a command the API would refuse is how the old panel's
 * Escalate came to fail on every click without anyone noticing.
 */
export const SUPPORT_CASE_TRANSITIONS: Readonly<
  Record<string, readonly string[]>
> = {
  NEW: ["TRIAGED", "ASSIGNED", "INVESTIGATING", "WAITING_ON_CUSTOMER", "RESOLVED", "CANCELLED"],
  TRIAGED: ["ASSIGNED", "INVESTIGATING", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL_TEAM", "RESOLVED", "CANCELLED"],
  ASSIGNED: ["INVESTIGATING", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL_TEAM", "FIX_IN_PROGRESS", "RESOLVED", "CANCELLED"],
  INVESTIGATING: ["ASSIGNED", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL_TEAM", "FIX_IN_PROGRESS", "MONITORING", "RESOLVED", "CANCELLED"],
  WAITING_ON_CUSTOMER: ["ASSIGNED", "INVESTIGATING", "WAITING_ON_INTERNAL_TEAM", "FIX_IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_ON_INTERNAL_TEAM: ["ASSIGNED", "INVESTIGATING", "WAITING_ON_CUSTOMER", "FIX_IN_PROGRESS", "RESOLVED", "CANCELLED"],
  FIX_IN_PROGRESS: ["INVESTIGATING", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL_TEAM", "MONITORING", "RESOLVED", "CANCELLED"],
  MONITORING: ["INVESTIGATING", "WAITING_ON_CUSTOMER", "FIX_IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["TRIAGED", "ASSIGNED", "INVESTIGATING", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL_TEAM", "FIX_IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  CANCELLED: ["REOPENED"],
};

const ALL_STATUSES = Object.keys(SUPPORT_CASE_TRANSITIONS);
const LOCKED = ["CLOSED", "CANCELLED"];
const INACTIVE = ["RESOLVED", ...LOCKED];

/** Every status from which `to` is a legal move. */
export function supportCaseStatesFor(to: string): string[] {
  return ALL_STATUSES.filter((from) =>
    SUPPORT_CASE_TRANSITIONS[from]!.includes(to),
  );
}

/** A merged case is read-only whatever its status says; hide every command. */
const NOT_MERGED = { field: "mergedIntoCaseId", hasValue: false } as const;

/**
 * The commands that need more than a reason open a focused dialog
 * (`SupportCaseActionDialog`). Keys are prefixed where a generic key already
 * means something else to the record handler — `cancel` there discards the
 * edit form, so cancelling a case is `cancel-case`.
 */
export const SUPPORT_CASE_DIALOG_ACTIONS = [
  "assign-case",
  "escalate-case",
  "request-info",
  "resolve-case",
  "close-case",
  "link-case",
  "merge-case",
] as const;
export type SupportCaseDialogAction =
  (typeof SUPPORT_CASE_DIALOG_ACTIONS)[number];

export function isSupportCaseDialogAction(
  key: string,
): key is SupportCaseDialogAction {
  return (SUPPORT_CASE_DIALOG_ACTIONS as readonly string[]).includes(key);
}

/**
 * Commands that only need a status (Triage) or a reason (Reopen, Cancel) and
 * are posted straight to the support case route — never to the generic
 * platform-runtime action route, which has no support case actions.
 */
export const SUPPORT_CASE_DIRECT_ACTIONS: Record<
  string,
  { path: string; body: (reason?: string) => Record<string, unknown> }
> = {
  "triage-case": {
    path: "transition",
    body: () => ({ toStatus: "TRIAGED" }),
  },
  "reopen-case": {
    path: "reopen",
    body: (reason) => ({ reason }),
  },
  "cancel-case": {
    path: "transition",
    body: (reason) => ({ toStatus: "CANCELLED", reason }),
  },
};

export const SUPPORT_CASE_ACTIONS: RuntimeActionDefinition[] = [
  {
    key: "triage-case",
    label: "Triage",
    placement: "primary",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("TRIAGED"),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "resolve-case",
    label: "Resolve",
    placement: "primary",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("RESOLVED"),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "close-case",
    label: "Close",
    placement: "primary",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("CLOSED"),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "reopen-case",
    label: "Reopen",
    placement: "primary",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("REOPENED"),
    visibleWhen: NOT_MERGED,
    reasonPrompt: { title: "Reopen case", label: "Why is this case being reopened?" },
  },
  {
    key: "assign-case",
    label: "Assign",
    placement: "secondary",
    scope: "record",
    selection: "none",
    states: ALL_STATUSES.filter((status) => !INACTIVE.includes(status)),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "escalate-case",
    label: "Escalate",
    placement: "secondary",
    scope: "record",
    selection: "none",
    states: ALL_STATUSES.filter((status) => !INACTIVE.includes(status)),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "request-info",
    label: "Request info",
    placement: "secondary",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("WAITING_ON_CUSTOMER"),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "link-case",
    label: "Link case",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ALL_STATUSES.filter((status) => !LOCKED.includes(status)),
    visibleWhen: NOT_MERGED,
  },
  {
    key: "merge-case",
    label: "Merge into…",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ALL_STATUSES.filter((status) => !LOCKED.includes(status)),
    visibleWhen: NOT_MERGED,
    destructive: true,
    confirmTitle: "Merge this case into another?",
    confirmDescription:
      "This case will be closed as a duplicate and become read-only. Its communications, attachments, incidents, links and child cases move to the target case.",
  },
  {
    key: "cancel-case",
    label: "Cancel case",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: supportCaseStatesFor("CANCELLED"),
    visibleWhen: NOT_MERGED,
    destructive: true,
    confirmTitle: "Cancel this case?",
    reasonPrompt: {
      title: "Cancel case",
      label: "Why is this case being cancelled?",
    },
  },
];

/**
 * Edit and Save are hidden on a case that is finished with, because the API
 * refuses every edit there. Reopen is the way back.
 */
export function supportCaseEditableActions(
  actions: RuntimeActionDefinition[],
): RuntimeActionDefinition[] {
  return actions.map((action) =>
    ["edit", "save", "save-close"].includes(String(action.key))
      ? {
          ...action,
          states: ALL_STATUSES.filter((status) => !LOCKED.includes(status)),
          visibleWhen: NOT_MERGED,
        }
      : action,
  );
}

/**
 * One terse line about where the case stands and what moves it on — shown in
 * the case panel. Derived from status and the information the lifecycle
 * requires, so it cannot drift from what the commands will actually accept.
 */
export function supportCaseNextStep(record: Record<string, unknown>): string {
  if (record.mergedIntoCaseId) return "Merged — read-only. Work the target case.";
  const owned = Boolean(record.assignedToUserId || record.assignedTeamId);
  switch (String(record.status ?? "NEW")) {
    case "NEW":
      return owned
        ? "New. Triage it or start investigating."
        : "New and unassigned. Triage it or assign an owner.";
    case "TRIAGED":
      return owned ? "Triaged. Start investigating." : "Triaged. Assign an owner.";
    case "REOPENED":
      return "Reopened. Triage it again or resume the investigation.";
    case "ASSIGNED":
    case "INVESTIGATING":
    case "FIX_IN_PROGRESS":
    case "MONITORING":
      return "In progress. Resolve with a summary and category when fixed.";
    case "WAITING_ON_CUSTOMER":
      return "Waiting on the customer. Resume when they reply.";
    case "WAITING_ON_INTERNAL_TEAM":
      return "Waiting on an internal team. Resume when they respond.";
    case "RESOLVED":
      return "Resolved. Close it once the customer confirms, or reopen.";
    case "CLOSED":
      return "Closed. Reopen with a reason if the problem returns.";
    case "CANCELLED":
      return "Cancelled. Reopen with a reason if it was cancelled in error.";
    default:
      return "";
  }
}
