/*
 * DP-MASTER WP-21.S1. Work units, work profiles and work queues travel in
 * packages like any other component. The pure rules for naming them, choosing
 * them and the exact body `POST /customization/packages/:id/work-components`
 * accepts (an unknown field is a 400). No I/O.
 */

/** Mirrors `WORK_COMPONENT_TYPES` in the API's `package-artifact.ts`. */
export const WORK_COMPONENT_TYPES = [
  "workUnit",
  "workProfile",
  "workQueue",
] as const;
export type WorkComponentType = (typeof WORK_COMPONENT_TYPES)[number];

export const WORK_COMPONENT_LABELS: Record<WorkComponentType, string> = {
  workUnit: "Work unit",
  workProfile: "Work profile",
  workQueue: "Work queue",
};

/** The human label for a work component type, or null for any other type. */
export function workComponentTypeLabel(type: string): string | null {
  return (WORK_COMPONENT_LABELS as Record<string, string>)[type] ?? null;
}

export function isWorkComponentType(type: string): type is WorkComponentType {
  return (WORK_COMPONENT_TYPES as readonly string[]).includes(type);
}

/** Mirrors the key pattern on the API's `WorkComponentRefDto`. */
const WORK_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type WorkComponentRef = { type: WorkComponentType; key: string };

/** A selection is keyed `type:key`, the form the API's own messages use. */
export function selectionId(ref: WorkComponentRef): string {
  return `${ref.type}:${ref.key}`;
}

export function buildWorkComponentsPayload(
  selected: readonly WorkComponentRef[],
):
  | { ok: true; body: { components: WorkComponentRef[] } }
  | { ok: false; message: string } {
  if (!selected.length) {
    return { ok: false, message: "Select at least one work component." };
  }
  if (selected.length > 200) {
    return { ok: false, message: "Add at most 200 work components at a time." };
  }
  const invalid = selected.find((ref) => !WORK_KEY_PATTERN.test(ref.key));
  if (invalid) {
    return {
      ok: false,
      message: `"${invalid.key}" is not a valid work component key.`,
    };
  }
  return {
    ok: true,
    body: {
      components: selected.map((ref) => ({ type: ref.type, key: ref.key })),
    },
  };
}

/** Adds or removes one selection, keeping the order it was chosen in. */
export function toggleSelection(
  selected: readonly WorkComponentRef[],
  ref: WorkComponentRef,
): WorkComponentRef[] {
  const id = selectionId(ref);
  return selected.some((entry) => selectionId(entry) === id)
    ? selected.filter((entry) => selectionId(entry) !== id)
    : [...selected, ref];
}

/** "Work unit kitchen-prep", from the API's own `type:key` form. */
export function describeWorkComponentKey(value: string): string {
  const [type, ...rest] = value.split(":");
  const label = workComponentTypeLabel(type);
  const key = rest.join(":");
  return label && key ? `${label} ${key}` : value;
}

/**
 * The uninstall result's retained work components, in words. They are
 * deactivated rather than deleted because history points at them.
 */
export function retainedWorkComponentsMessage(
  retained: readonly string[] | null | undefined,
): string | null {
  if (!retained || retained.length === 0) return null;
  return `Work components kept (deactivated), history preserved: ${retained
    .map(describeWorkComponentKey)
    .join(", ")}.`;
}
