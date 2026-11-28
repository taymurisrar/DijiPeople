/*
 * DP-MASTER WP-06.S5. The pure rules behind linking a timesheet entry to one of
 * the person's own work items. An entry's `taskId` that is a work item of the
 * tenant is a link, checked by the API (it must be owned or shared by the person,
 * not archived, and on the entry's project); any other `taskId` is free text and
 * stays possible. This only decides what to offer and how to read an answer: the
 * API stays the authority on every link.
 */

export type LinkableWorkItem = {
  id: string;
  title: string;
  status: string;
  projectId?: string | null;
  archivedAt?: string | null;
};

/** The sentinel option that switches an entry to a free-text task. */
export const FREE_TEXT_TASK = "__free-text__";

/** Mirrors `@MaxLength(80)` on the entry's `taskId` in the API's week DTO. */
export const TASK_ID_MAX_LENGTH = 80;

const CLOSED = new Set(["DONE", "CANCELLED"]);

/** The work items the person owns or shares; the API scopes it to them. */
export function buildMyWorkItemsQuery(): string {
  return "mine=true&take=100";
}

/**
 * What the picker offers: the open items by title, plus the one the entry is
 * already linked to even when that item has since been closed, so a saved link
 * is never silently dropped from the list.
 */
export function pickerItems(
  items: readonly LinkableWorkItem[],
  currentTaskId?: string | null,
): LinkableWorkItem[] {
  return items
    .filter(
      (item) =>
        !item.archivedAt &&
        (!CLOSED.has(item.status) || item.id === currentTaskId),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export type TaskMode = "none" | "item" | "text";

export function taskMode(
  entry: { taskId?: string | null; freeTask?: boolean },
  items: readonly LinkableWorkItem[],
): TaskMode {
  if (entry.freeTask) return "text";
  const id = entry.taskId?.trim();
  if (!id) return "none";
  return items.some((item) => item.id === id) ? "item" : "text";
}

/** The value the picker shows for an entry. */
export function pickerValue(
  entry: { taskId?: string | null; freeTask?: boolean },
  items: readonly LinkableWorkItem[],
): string {
  const mode = taskMode(entry, items);
  if (mode === "item") return entry.taskId!.trim();
  return mode === "text" ? FREE_TEXT_TASK : "";
}

/** The entry fields a picker choice sets. */
export function applyPickerChoice(choice: string): {
  taskId: string | null;
  freeTask: boolean;
} {
  if (choice === FREE_TEXT_TASK) return { taskId: null, freeTask: true };
  return { taskId: choice || null, freeTask: false };
}

/** The `taskId` sent to the API: trimmed, or null when there is none. */
export function taskIdForPayload(taskId?: string | null): string | null {
  const value = taskId?.trim();
  return value ? value.slice(0, TASK_ID_MAX_LENGTH) : null;
}

/** The title to show for a linked entry; free text is shown as typed. */
export function taskDisplay(
  taskId: string | null | undefined,
  items: readonly LinkableWorkItem[],
): string {
  const id = taskId?.trim();
  if (!id) return "No work item";
  return items.find((item) => item.id === id)?.title ?? id;
}

const WORK_ITEM_ERROR_CODES = new Set([
  "TIMESHEET_WORK_ITEM_NOT_YOURS",
  "TIMESHEET_WORK_ITEM_PROJECT",
]);

/**
 * The wording of the two refusals in the API's `assertWorkItemLinks`. The error
 * body's `errorCode` is the generic VALIDATION_FAILED for a 400 (the specific
 * code is not carried through), so the message is what tells them apart.
 */
const WORK_ITEM_ERROR_MESSAGES = [
  /work item you own or share/i,
  /work item belongs to a different project/i,
];

/** True when the API refused a save because of a work-item link, not the hours. */
export function isWorkItemLinkError(code: unknown, message?: string): boolean {
  if (typeof code === "string" && WORK_ITEM_ERROR_CODES.has(code)) return true;
  return (
    typeof message === "string" &&
    WORK_ITEM_ERROR_MESSAGES.some((pattern) => pattern.test(message))
  );
}
