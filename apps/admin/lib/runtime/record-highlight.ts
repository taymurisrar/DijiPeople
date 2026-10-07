import type {
  RuntimeRecordHighlightDefinition,
  RuntimeRecordHighlightItem,
  RuntimeStatusDefinition,
} from "./platform-runtime.types";
import { humanizeLabel } from "./humanize-label";

/**
 * One value in the record highlight header, resolved from the record.
 *
 * Kept apart from the component so the mapping — a partner's status read as
 * its phase, the same status read as its exact sub-status, the account status
 * with the action that sets it — is tested without rendering anything.
 */
export type ResolvedHighlight = {
  key: string;
  label: string;
  /** What the operator reads; null when the record has no value. */
  display: string | null;
  tone?: RuntimeStatusDefinition["tone"];
  /** Tooltip — why the value is what it is, or why it cannot be changed here. */
  hint?: string;
  format: "text" | "status" | "code";
};

export function readRecordPath(record: Record<string, unknown>, path: string) {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );
}

export function resolveHighlightItem(
  item: RuntimeRecordHighlightItem,
  record: Record<string, unknown>,
): ResolvedHighlight | null {
  const raw = readRecordPath(record, item.field);
  const stored =
    raw === null || raw === undefined || raw === "" ? null : String(raw);
  /*
   * A stored value the map does not know (a status added to the enum before
   * the map) still shows — as itself — rather than disappearing.
   */
  const value =
    stored === null ? null : (item.valueMap?.[stored] ?? stored);
  if (value === null && item.hideWhenEmpty) return null;
  const display =
    value === null
      ? null
      : (item.labels?.[value] ??
        (/^[A-Z][A-Z0-9_]*$/.test(value) ? humanizeLabel(value) : value));
  const hints = [value ? item.hints?.[value] : undefined, item.hint].filter(
    (hint): hint is string => Boolean(hint),
  );
  return {
    key: item.key,
    label: item.label,
    display,
    tone: value ? item.tones?.[value] : undefined,
    hint: hints.length ? hints.join(" ") : undefined,
    format: item.format ?? "text",
  };
}

export function resolveRecordHighlights(
  highlight: RuntimeRecordHighlightDefinition,
  record: Record<string, unknown>,
): ResolvedHighlight[] {
  return highlight.items
    .map((item) => resolveHighlightItem(item, record))
    .filter((item): item is ResolvedHighlight => item !== null);
}

export function resolveHighlightTitle(
  highlight: RuntimeRecordHighlightDefinition,
  record: Record<string, unknown>,
  fallback: string,
) {
  for (const field of highlight.titleFields) {
    const value = readRecordPath(record, field);
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}
