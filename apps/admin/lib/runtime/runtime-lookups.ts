import type {
  PlatformModuleDefinition,
  RuntimeFieldDefinition,
} from "./platform-runtime.types";

export type RuntimeLookupOption = { value: string; label: string };

export function collectRuntimeLookupPaths(
  definitions: PlatformModuleDefinition[],
) {
  return new Set(
    definitions.flatMap((definition) => [
      ...definition.forms.flatMap((form) =>
        form.fields.flatMap((field) =>
          field.lookupPath ? [field.lookupPath] : [],
        ),
      ),
      /*
       * The header owner picker reads a lookup too. It happens to be the same
       * path several forms already declare, so the allowlist covered it by
       * coincidence — and would have stopped covering it the moment those
       * fields changed, turning the owner control on modules with no form
       * lookup into a 400 nobody would connect to an unrelated edit.
       */
      ...(definition.recordHeader?.owner?.lookupPath
        ? [definition.recordHeader.owner.lookupPath]
        : []),
    ]),
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

  const options = items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const value = item.id ?? item.value;
    if (typeof value !== "string" || !value) return [];
    return [{ value, label: getRuntimeLookupLabel(item), item }];
  });

  return disambiguateLookupLabels(options);
}

/**
 * Make entries the operator cannot tell apart tell themselves apart.
 *
 * The owner picker listed "Taimur Israr" twice — two genuinely different
 * accounts — and the contract template list showed the same agreement name
 * twice. In both cases the operator had to guess, and a wrong guess assigns the
 * wrong owner or generates from the wrong template (BUG-1553).
 *
 * Applied only where a label actually repeats. Showing everyone's email beside
 * their name would clutter every picker in the console to solve a problem that
 * exists in two of them, and the disambiguator is only informative when there
 * is something to disambiguate from.
 */
function disambiguateLookupLabels(
  options: Array<{ value: string; label: string; item: Record<string, unknown> }>,
): RuntimeLookupOption[] {
  const counts = new Map<string, number>();
  for (const option of options)
    counts.set(option.label, (counts.get(option.label) ?? 0) + 1);

  return options.map(({ value, label, item }) => {
    if ((counts.get(label) ?? 0) < 2) return { value, label };
    const detail = lookupDisambiguator(item, label);
    return { value, label: detail ? `${label} (${detail})` : label };
  });
}

/**
 * Something short and true that separates two records sharing a name.
 *
 * Ordered by how much it tells a person: an email identifies a colleague, a
 * version or a code identifies a document. The id is last and is a poor answer
 * — but two identical entries and no way to choose is a worse one, so it is
 * shortened rather than omitted.
 */
function lookupDisambiguator(
  item: Record<string, unknown>,
  label: string,
): string | null {
  const candidates = [
    item.email,
    item.code,
    item.key,
    item.contractNumber,
    item.version === undefined || item.version === null
      ? null
      : `v${String(item.version)}`,
    item.status,
    typeof item.id === "string" ? item.id.slice(0, 8) : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    // A disambiguator identical to the label disambiguates nothing.
    if (candidate.trim() === label) continue;
    return candidate.trim();
  }
  return null;
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

/**
 * The display name of a related record, wherever this schema happens to keep
 * it. Exported because the record header resolves the same thing for the owner
 * slot, and a second copy of this candidate list would let the header and the
 * lookup control disagree about what a person is called.
 */
export function readRuntimeLookupLabel(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const label = getRuntimeLookupLabel(value);
  /*
   * `getRuntimeLookupLabel` falls back to the id so a picker option is never
   * blank. A header field has no such obligation and a UUID there reads as a
   * bug, so an id-only record resolves to nothing and the slot says
   * "Unassigned".
   */
  if (label === "Unknown" || label === String(value.id ?? "")) return null;
  return label;
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
