import type { FormMetadata } from "./metadata-runtime.types";

/**
 * Whether a failed command's field errors will actually appear somewhere the
 * user can see them. This is the only safe reason to withhold the error dialog.
 *
 * The runtime suppresses its technical error dialog whenever the server returns
 * field-level errors, on the assumption that each one will be rendered against
 * its control. That assumption holds only if the form renders a control for
 * every field the server can complain about, and it does not: a leave request
 * rejected with `details.fields: [{field: "ownerId"}, {field: "status"}]` named
 * two fields that live in the record-status header and appear in no form
 * section. The inline path had nothing to render, the dialog had been turned
 * off, and the save failed in complete silence — the only trace was a 400 in
 * the network panel.
 *
 * So keep the quiet inline behaviour when at least one named field is on the
 * active form, and let the dialog through when none of them is.
 */
export function fieldValidationErrorsAreVisible(
  data: unknown,
  form: FormMetadata | null | undefined,
): boolean {
  const names = readFieldErrorNames(data);
  if (names.length === 0) return false;
  if (!form) return false;

  const rendered = new Set<string>();
  for (const section of form.sections ?? []) {
    for (const field of section.fields ?? []) {
      rendered.add(field.fieldLogicalName);
    }
  }

  return names.some((name) => rendered.has(name));
}

/** Field names from either supported error shape, at the root or under `details`. */
export function readFieldErrorNames(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const details =
    record.details &&
    typeof record.details === "object" &&
    !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : {};

  return [
    ...collectFieldErrorNames(record.fieldErrors),
    ...collectFieldErrorNames(record.fields),
    ...collectFieldErrorNames(details.fieldErrors),
    ...collectFieldErrorNames(details.fields),
  ];
}

function collectFieldErrorNames(value: unknown): string[] {
  if (!value) return [];

  // Array form, as the API's error contract emits it:
  //   details.fields: [{ field: "ownerId", message: "…" }]
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as { field?: unknown }).field
          : undefined,
      )
      .filter((field): field is string => typeof field === "string");
  }

  // Map form: { ownerId: "…" }
  if (typeof value === "object") return Object.keys(value);

  return [];
}
