/*
 * DP-MASTER WP-03: a workflow email action may name several recipients. The list
 * supersedes the single recipientMode/recipientAddress pair, which stays for
 * actions saved before the list existed. Pure, so the payload rules are tested
 * directly; the API validates and resolves every entry.
 */

export const WORKFLOW_LIST_RECIPIENT_MODES = [
  "SUBJECT",
  "ACTOR",
  "FIXED",
  "CANDIDATE",
  "ROLE",
] as const;
export type WorkflowListRecipientMode =
  (typeof WORKFLOW_LIST_RECIPIENT_MODES)[number];

export const MAX_RECIPIENTS_PER_ACTION = 50;

export const RECIPIENT_MODE_LABELS: Record<WorkflowListRecipientMode, string> = {
  SUBJECT: "The record's person",
  ACTOR: "The person who acted",
  FIXED: "A fixed address",
  CANDIDATE: "The candidate",
  ROLE: "Everyone holding a role",
};

/** One recipient as the API returns and accepts it. */
export type WorkflowRecipient = {
  mode: WorkflowListRecipientMode;
  address?: string;
  roleKey?: string;
};

/** A recipient row being edited; empty strings stand for "not filled in". */
export type RecipientDraft = {
  mode: WorkflowListRecipientMode;
  address: string;
  roleKey: string;
};

export function emptyRecipientDraft(
  mode: WorkflowListRecipientMode = "SUBJECT",
): RecipientDraft {
  return { mode, address: "", roleKey: "" };
}

/**
 * The editor's rows for a stored action: its recipient list, or, for a legacy
 * action, the one recipient its single-recipient fields describe.
 */
export function draftsFromAction(action: {
  recipients?: readonly WorkflowRecipient[] | null;
  recipientMode?: string | null;
  recipientAddress?: string | null;
}): RecipientDraft[] {
  if (action.recipients && action.recipients.length > 0) {
    return action.recipients.map((r) => ({
      mode: r.mode,
      address: r.address ?? "",
      roleKey: r.roleKey ?? "",
    }));
  }
  const mode = (WORKFLOW_LIST_RECIPIENT_MODES as readonly string[]).includes(
    action.recipientMode ?? "",
  )
    ? (action.recipientMode as WorkflowListRecipientMode)
    : "SUBJECT";
  return [{ mode, address: action.recipientAddress ?? "", roleKey: "" }];
}

/** A message for the first problem in the list, or null. */
export function validateRecipients(
  drafts: readonly RecipientDraft[],
): string | null {
  if (drafts.length === 0) return "Add at least one recipient.";
  if (drafts.length > MAX_RECIPIENTS_PER_ACTION) {
    return `An action can have at most ${MAX_RECIPIENTS_PER_ACTION} recipients.`;
  }
  for (const draft of drafts) {
    if (draft.mode === "FIXED" && !draft.address.trim()) {
      return "Enter the address to send to when using a fixed recipient.";
    }
    if (draft.mode === "ROLE" && !draft.roleKey.trim()) {
      return "Enter the role key when sending to a role.";
    }
  }
  return null;
}

export function buildRecipientEntries(
  drafts: readonly RecipientDraft[],
): WorkflowRecipient[] {
  return drafts.map((draft) => ({
    mode: draft.mode,
    ...(draft.mode === "FIXED" ? { address: draft.address.trim() } : {}),
    ...(draft.mode === "ROLE" ? { roleKey: draft.roleKey.trim() } : {}),
  }));
}

/**
 * The recipient fields of a saved action. An action that had no list and still
 * has a single plain recipient keeps saving in the legacy shape, unchanged;
 * anything else is sent as the list, which supersedes the legacy pair.
 */
export function buildActionRecipientFields(
  drafts: readonly RecipientDraft[],
  hadRecipientList: boolean,
):
  | { recipientMode: string; recipientAddress: string | null }
  | { recipients: WorkflowRecipient[] } {
  if (!hadRecipientList && drafts.length === 1 && drafts[0].mode !== "ROLE") {
    return {
      recipientMode: drafts[0].mode,
      recipientAddress:
        drafts[0].mode === "FIXED" ? drafts[0].address.trim() || null : null,
    };
  }
  return { recipients: buildRecipientEntries(drafts) };
}
