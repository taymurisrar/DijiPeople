type FormField = {
  key: string;
  label?: string;
  tab?: string;
};

/*
 * What a blocked save should say, and where it should take the operator.
 *
 * Field errors render only on the mounted tab, so a multi-tab form could refuse
 * to save with "Complete the required fields." while every visible field looked
 * complete and no element anywhere in the DOM carried an error marker. On the
 * Partner form that was a total dead end: the failing field was worded
 * differently and lived two tabs away (BUG-1746, and BUG-1546 before it).
 *
 * Extracted from the record page so the behaviour can be asserted without
 * mounting it — the defect was never about rendering, it was about which tab
 * the operator is looking at when the message appears.
 */

/** The tab holding the first failure, or null when none of them declare one. */
export function firstFailingTab(
  fields: readonly FormField[],
  errors: Record<string, string>,
): string | null {
  for (const field of fields) {
    if (errors[field.key] && field.tab) return field.tab;
  }
  return null;
}

/** How many failures sit on each tab, for the tab strip's badges. */
export function errorCountByTab(
  fields: readonly FormField[],
  errors: Record<string, string>,
  fallbackTab?: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const field of fields) {
    if (!errors[field.key]) continue;
    const tab = field.tab ?? fallbackTab;
    if (tab) counts.set(tab, (counts.get(tab) ?? 0) + 1);
  }
  return counts;
}

/**
 * The summary message. Names the fields so it stands on its own even when the
 * tab strip has scrolled out of view — the message was previously the only
 * feedback available and said nothing.
 */
export function describeBlockedSave(
  fields: readonly FormField[],
  errors: Record<string, string>,
): string {
  const labels = fields
    .filter((field) => errors[field.key])
    .map((field) => field.label)
    .filter((label): label is string => Boolean(label));

  if (!labels.length) return "Complete the required fields.";
  const named = labels.slice(0, 3).join(", ");
  return labels.length > 3
    ? `Complete the required fields: ${named} and ${labels.length - 3} more.`
    : `Complete the required fields: ${named}.`;
}
