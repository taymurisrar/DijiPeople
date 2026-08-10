import type {
  PlatformModuleDefinition,
  RuntimeFieldDefinition,
} from "./platform-runtime.types";

export type RuntimeLookupOption = { value: string; label: string };

export function collectRuntimeLookupPaths(
  definitions: PlatformModuleDefinition[],
) {
  return new Set(
    definitions.flatMap((definition) =>
      definition.forms.flatMap((form) =>
        form.fields.flatMap((field) =>
          field.lookupPath ? [field.lookupPath] : [],
        ),
      ),
    ),
  );
}

export function buildRuntimeLookupPath(source: string, search?: string) {
  const url = new URL(source, "http://runtime.local");
  const normalizedSearch = search?.trim();
  if (normalizedSearch) url.searchParams.set("search", normalizedSearch);
  return `${url.pathname}${url.search}`;
}

export function normalizeRuntimeLookupPayload(
  payload: unknown,
): RuntimeLookupOption[] {
  const record = isRecord(payload) ? payload : null;
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.items)
      ? record.items
      : [];

  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const value = item.id ?? item.value;
    if (typeof value !== "string" || !value) return [];
    return [{ value, label: getRuntimeLookupLabel(item) }];
  });
}

export function mergeRuntimeLookupOptions(
  options: RuntimeLookupOption[],
  current: RuntimeLookupOption | undefined,
) {
  if (!current || options.some((option) => option.value === current.value)) {
    return options;
  }
  return [current, ...options];
}

export function isLookupField(field: RuntimeFieldDefinition) {
  return field.type === "lookup" || field.type.includes("Lookup");
}

function getRuntimeLookupLabel(item: Record<string, unknown>) {
  const customer = isRecord(item.customer) ? item.customer : null;
  const tenant = isRecord(item.tenant) ? item.tenant : null;
  const plan = isRecord(item.plan) ? item.plan : null;
  const candidates = [
    item.fullName,
    item.displayName,
    item.companyName,
    item.name,
    item.title,
    item.contractNumber,
    customer?.companyName,
    tenant?.name,
    plan?.name,
    item.email,
    item.label,
    item.id,
  ];
  return String(
    candidates.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    ) ?? "Unknown",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
