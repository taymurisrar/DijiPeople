import type { FormSectionMetadata } from "./metadata-runtime.types";

export type FormGridColumnCount = 1 | 2 | 3;
export type FormGridColumnSpan = 1 | 2 | 3;

export function normalizeFormGridColumnCount(
  value: unknown,
  fallback: FormGridColumnCount = 1,
): FormGridColumnCount {
  const numeric = Number(value);
  if (numeric === 3) return 3;
  if (numeric === 2) return 2;
  if (numeric === 1) return 1;
  if (numeric > 3) return 3;
  return fallback;
}

export function normalizeFormGridColumnSpan(
  value: unknown,
  configuredColumns: unknown,
): FormGridColumnSpan {
  const columns = normalizeFormGridColumnCount(configuredColumns);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  if (numeric >= columns) return columns;
  if (numeric >= 3) return 3;
  if (numeric >= 2) return 2;
  return 1;
}

export function normalizeFormGridColumn(
  value: unknown,
  configuredColumns: unknown,
): FormGridColumnSpan | null {
  const columns = normalizeFormGridColumnCount(configuredColumns);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  if (numeric > columns) return columns;
  if (numeric >= 3) return 3;
  if (numeric >= 2) return 2;
  return 1;
}

export function columnsFromSectionLayout(
  layout: FormSectionMetadata["layout"] | undefined,
): FormGridColumnCount {
  if (layout === "three-column") return 3;
  if (layout === "two-column") return 2;
  return 1;
}

export function getEffectiveFormGridColumnCount(
  configuredColumns: unknown,
  containerWidth: number,
): FormGridColumnCount {
  const columns = normalizeFormGridColumnCount(configuredColumns);
  if (columns === 1) return 1;
  if (containerWidth < 480) return 1;
  if (columns === 2) return 2;
  if (containerWidth < 720) return 2;
  return 3;
}

export const FORM_LAYOUT_GRID_TEST_SCENARIOS = [
  {
    name: "one-column tab with one section",
    columns: normalizeFormGridColumnCount(1),
    span: normalizeFormGridColumnSpan(1, 1),
  },
  {
    name: "two-column tab with two one-span sections",
    columns: normalizeFormGridColumnCount(2),
    span: normalizeFormGridColumnSpan(1, 2),
  },
  {
    name: "three-column tab with one section remains one track",
    columns: normalizeFormGridColumnCount(3),
    span: normalizeFormGridColumnSpan(1, 3),
  },
  {
    name: "three-column tab with spanning section",
    columns: normalizeFormGridColumnCount("3"),
    span: normalizeFormGridColumnSpan(2, "3"),
  },
  {
    name: "three-column tab clamps full section span",
    columns: normalizeFormGridColumnCount("3"),
    span: normalizeFormGridColumnSpan(3, "3"),
  },
  {
    name: "three-column section with invalid large field span",
    columns: normalizeFormGridColumnCount(3),
    span: normalizeFormGridColumnSpan(99, 3),
  },
  {
    name: "legacy four-column metadata renders as three-column maximum",
    columns: normalizeFormGridColumnCount(4),
    span: normalizeFormGridColumnSpan(4, 4),
  },
  {
    name: "missing legacy span defaults to one track",
    columns: normalizeFormGridColumnCount(undefined),
    span: normalizeFormGridColumnSpan(undefined, 3),
  },
  {
    name: "three-column section has three effective tracks when wide",
    columns: getEffectiveFormGridColumnCount(3, 960),
    span: normalizeFormGridColumnSpan(3, 3),
  },
  {
    name: "three-column section falls back to two effective tracks",
    columns: getEffectiveFormGridColumnCount(3, 640),
    span: normalizeFormGridColumnSpan(2, 2),
  },
  {
    name: "three-column section falls back to one effective track",
    columns: getEffectiveFormGridColumnCount(3, 360),
    span: normalizeFormGridColumnSpan(1, 1),
  },
] as const;
