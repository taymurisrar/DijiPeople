import type { OnboardingTemplateRecord } from "../types";

/**
 * A single editable row in the template's task-blueprint list — TASK-0036.
 *
 * `taskBlueprints` is a plain JSON array on the API side (no per-row id, no
 * separate order column): array position *is* the order. `key` exists only so
 * React (and this module's callers) can track a row across add/remove/move
 * without depending on array index, which shifts every time a row above it is
 * removed.
 */
export type TaskBlueprintRow = {
  readonly key: string;
  title: string;
  description: string;
  dueOffsetDays: number | null;
  assignedUserId: string;
};

export function createTaskBlueprintRow(key: string): TaskBlueprintRow {
  return {
    key,
    title: "",
    description: "",
    dueOffsetDays: null,
    assignedUserId: "",
  };
}

/**
 * The form's starting rows: the template's existing blueprints in their
 * saved order, or one empty row for a brand-new template (the create DTO
 * requires at least one).
 */
export function taskBlueprintRowsFromTemplate(
  template: Pick<OnboardingTemplateRecord, "taskBlueprints"> | undefined,
): TaskBlueprintRow[] {
  const blueprints = template?.taskBlueprints ?? [];
  if (!blueprints.length) return [createTaskBlueprintRow("0")];

  return blueprints.map((blueprint, index) => ({
    key: String(index),
    title: blueprint.title ?? "",
    description: blueprint.description ?? "",
    dueOffsetDays:
      typeof blueprint.dueOffsetDays === "number"
        ? blueprint.dueOffsetDays
        : null,
    assignedUserId: blueprint.assignedUserId ?? "",
  }));
}

/** Swaps a row with its neighbour; a no-op at either end of the list. */
export function moveTaskBlueprintRow(
  rows: readonly TaskBlueprintRow[],
  index: number,
  direction: "up" | "down",
): TaskBlueprintRow[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (
    index < 0 ||
    index >= rows.length ||
    targetIndex < 0 ||
    targetIndex >= rows.length
  ) {
    return [...rows];
  }

  const next = [...rows];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

/**
 * Removes a row. A template always needs at least one task blueprint (the
 * create DTO enforces it server-side, and a template with zero tasks would
 * not do anything for whoever it onboards), so removing the last remaining
 * row is a no-op rather than leaving the form in a state the API will reject.
 */
export function removeTaskBlueprintRow(
  rows: readonly TaskBlueprintRow[],
  index: number,
): TaskBlueprintRow[] {
  if (rows.length <= 1) return [...rows];
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

/**
 * The first problem with the form, or `null` when it is ready to submit.
 * Deliberately returns one message at a time (matching the other bespoke
 * forms in this app, e.g. `JobOpeningForm`) rather than a field-keyed map —
 * there is no server-side field path for "row 3's title" to align with.
 */
export function validateTemplateForm(input: {
  name: string;
  rows: readonly TaskBlueprintRow[];
}): string | null {
  if (!input.name.trim()) {
    return "Template name is required.";
  }

  if (input.rows.length === 0) {
    return "Add at least one task.";
  }

  const blankTitleIndex = input.rows.findIndex((row) => !row.title.trim());
  if (blankTitleIndex !== -1) {
    return `Row ${blankTitleIndex + 1}: task title is required.`;
  }

  return null;
}

export type OnboardingTaskBlueprintPayload = {
  title: string;
  description?: string;
  dueOffsetDays?: number;
  assignedUserId?: string;
};

/** Rows -> the DTO's `taskBlueprints` shape. Call after `validateTemplateForm` passes. */
export function buildTaskBlueprintsPayload(
  rows: readonly TaskBlueprintRow[],
): OnboardingTaskBlueprintPayload[] {
  return rows.map((row) => ({
    title: row.title.trim(),
    ...(row.description.trim() ? { description: row.description.trim() } : {}),
    ...(row.dueOffsetDays !== null ? { dueOffsetDays: row.dueOffsetDays } : {}),
    ...(row.assignedUserId ? { assignedUserId: row.assignedUserId } : {}),
  }));
}

/**
 * The full save body. `customFields` is always included — the API's
 * `CustomFieldValuesInterceptor` lifts it out of the body before the DTO's
 * `forbidNonWhitelisted` validation ever sees it (see
 * `custom-fields.decorator.ts`), so an empty tenant with no published custom
 * fields sends `customFields: {}` and the DTO validates exactly as before.
 */
export function buildOnboardingTemplatePayload(input: {
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  rows: readonly TaskBlueprintRow[];
  customFields: Readonly<Record<string, unknown>>;
}) {
  return {
    name: input.name.trim(),
    ...(input.description.trim()
      ? { description: input.description.trim() }
      : {}),
    taskBlueprints: buildTaskBlueprintsPayload(input.rows),
    isDefault: input.isDefault,
    isActive: input.isActive,
    customFields: input.customFields,
  };
}
