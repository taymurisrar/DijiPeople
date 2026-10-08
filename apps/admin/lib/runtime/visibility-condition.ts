/*
 * The runtime's one visibility condition, shared by form fields
 * (`visibleWhen`/`visibleWhenAny` — `runtime-form.tsx` and
 * `edit-tab-selection.ts`) and record commands
 * (`RuntimeActionDefinition.visibleWhen`, see `command-visibility.ts`).
 *
 * Pure logic with no React import, so the pure-logic jest suites can reach it
 * and the "use client" form imports it as well. The form used to keep a
 * private copy of this matcher; one definition means the two cannot drift.
 */
export type VisibilityCondition = {
  field: string;
  equals?: unknown;
  in?: unknown[];
  hasValue?: boolean;
};

/**
 * The value a condition reads: the key itself when `values` has it, otherwise
 * a dot path into nested objects (`owner.id`) — what the form always read.
 */
export function readConditionValue(
  values: Record<string, unknown>,
  path: string,
): unknown {
  if (path in values) return values[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[part];
  }, values);
}

/**
 * `hasValue` wins over `in`, which wins over `equals`. A value that is missing
 * from `values` reads as undefined, so `equals: true` is false for a record
 * that does not carry the field at all.
 */
export function matchesVisibility(
  condition: VisibilityCondition,
  values: Record<string, unknown>,
): boolean {
  const value = readConditionValue(values, condition.field);
  if (condition.hasValue !== undefined)
    return condition.hasValue
      ? value != null && value !== ""
      : value == null || value === "";
  if (condition.in) return condition.in.includes(value);
  return value === condition.equals;
}
