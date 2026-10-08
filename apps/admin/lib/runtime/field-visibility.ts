import { matchesVisibility, readConditionValue } from "./visibility-condition";
import type { RuntimeFieldDefinition } from "./platform-runtime.types";

type FormMode = "create" | "read" | "edit";

/**
 * Does a stored value count as "nothing here" for `hideWhenEmpty`?
 *
 * Null, undefined and blank strings, as before — and also an empty JSON
 * object or array. A `json` column such as `Partner.applicationSnapshot` can
 * come back as `{}` for a partner created in the console, which rendered an
 * empty code block under a heading as though there were something to read.
 */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object")
    return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

/**
 * Should the record form render this field?
 *
 * `hideWhenEmpty` applies in read mode, where an empty value has nothing to
 * say. It also applies in edit mode to a field that is unconditionally
 * read-only: the operator cannot fill it there either, so the empty control
 * is the same "Not set" noise. The Partner record's Application details
 * (source, submitted, snapshot) are such fields — set only by a partner
 * application, so every console-created partner showed three "Not set"
 * values. A section whose fields are all hidden is not rendered at all
 * (`RuntimeForm` skips a section with no visible fields).
 */
export function isRuntimeFieldVisible(
  field: Pick<
    RuntimeFieldDefinition,
    | "key"
    | "hidden"
    | "hideOnCreate"
    | "hideWhenEmpty"
    | "readOnly"
    | "visibleWhen"
    | "visibleWhenAny"
  >,
  values: Record<string, unknown>,
  mode?: FormMode,
): boolean {
  if (field.hidden || (mode === "create" && field.hideOnCreate)) return false;
  if (
    field.hideWhenEmpty &&
    (mode === "read" || (mode === "edit" && field.readOnly)) &&
    isEmptyFieldValue(readConditionValue(values, field.key))
  )
    return false;
  if (field.visibleWhenAny?.length)
    return field.visibleWhenAny.some((condition) =>
      matchesVisibility(condition, values),
    );
  if (!field.visibleWhen) return true;
  return matchesVisibility(field.visibleWhen, values);
}
