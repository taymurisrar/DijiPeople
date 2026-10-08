import type { RuntimeFieldDefinition } from "./platform-runtime.types";

/**
 * What a lookup shows when its stored value matches no option.
 *
 * A currency lookup over the enabled-currency catalog rendered "Not set" for a
 * partner whose stored code is not in that catalog — the legacy `"5"` from
 * BUG-1747, or a code since retired — which reads as missing data when the
 * record does hold a value. Where the stored value *is* the business value
 * (a code from a static catalog, or a name stored through `submitsLabel`) it
 * is shown as stored. A record-id lookup still shows nothing: an unresolved
 * id is not something an operator can read, and printing a UUID in place of a
 * name is the defect this runtime spent BUG-1578 removing.
 */
export function lookupDisplayFallback(
  field: Pick<RuntimeFieldDefinition, "options" | "submitsLabel">,
  value: unknown,
): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!field.submitsLabel && !field.options?.length) return null;
  return text;
}
