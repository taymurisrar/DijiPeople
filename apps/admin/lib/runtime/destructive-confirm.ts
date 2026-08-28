/*
 * What a destructive confirmation should say.
 *
 * Two records, one sentence:
 *
 *   - The single-record dialog did not name the record it was about to delete,
 *     so the operator confirmed a destructive action without being told what it
 *     applied to (BUG-1560).
 *   - The bulk dialog said "Delete selected records?" with no count and no
 *     names, and the list showed no selection count either — so there was
 *     nothing anywhere on screen telling the operator whether they were
 *     deleting one row or every row on the page (BUG-1756).
 *
 * The tenant erasure panel is the reference for what a destructive
 * confirmation contains. A lead does not need typing confirmation; it does need
 * naming the target, which is the part both dialogs were missing.
 */

const MAX_NAMED = 5;

export type DestructiveConfirmInput = {
  /** Display names of the records the action will affect. */
  labels?: string[];
  /** How many records are affected, when their names are not all known. */
  count?: number;
  singular: string;
  plural: string;
  /** The action's own wording, used when there is nothing to name. */
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export type DestructiveConfirmCopy = {
  title: string;
  description: string;
  /** Names rendered one per line, so a list of five is readable. */
  names: string[];
};

/**
 * Title, description and names for a destructive confirmation.
 *
 * Names up to five records and counts the rest. Listing forty names turns the
 * dialog into a wall nobody reads, which is the same failure as naming none —
 * so past that point the count carries the weight and the names stop.
 */
export function describeDestructiveConfirm(
  input: DestructiveConfirmInput,
): DestructiveConfirmCopy {
  const labels = (input.labels ?? []).filter(
    (label): label is string => typeof label === "string" && label.trim() !== "",
  );
  const total = input.count ?? labels.length;

  if (total === 0) {
    return {
      title: input.fallbackTitle ?? "Confirm action",
      description:
        input.fallbackDescription ?? "This action may not be reversible.",
      names: [],
    };
  }

  const noun = total === 1 ? input.singular.toLowerCase() : input.plural.toLowerCase();

  if (total === 1 && labels.length === 1) {
    return {
      title: `Delete ${labels[0]}?`,
      description: `This permanently deletes this ${input.singular.toLowerCase()}. It cannot be undone.`,
      names: [],
    };
  }

  const named = labels.slice(0, MAX_NAMED);
  const remaining = total - named.length;

  return {
    title: `Delete ${total} ${noun}?`,
    description:
      remaining > 0 && named.length > 0
        ? `This permanently deletes ${total} ${noun}, including the ${named.length} below and ${remaining} more. It cannot be undone.`
        : `This permanently deletes ${total} ${noun}. It cannot be undone.`,
    names: named,
  };
}

/**
 * The best display name for a record, from whatever the row happens to carry.
 *
 * Every module names its records differently and none of them agree, so the
 * candidates are tried in order of how specific they are. Falls back to the id
 * rather than to nothing: an id is a poor name and still better than asking
 * somebody to confirm deleting "a record".
 */
export function recordDisplayName(
  record: Record<string, unknown> | undefined,
): string | null {
  if (!record) return null;
  const candidates = [
    record.displayName,
    record.name,
    record.companyName,
    record.fullName,
    record.title,
    record.invoiceNumber,
    record.code,
    record.key,
    record.email,
    record.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}
