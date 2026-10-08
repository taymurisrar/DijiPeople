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

/*
 * Lookup paths that depend on the record being edited.
 *
 * A `lookupPath` may name a value of the current form as `{field}`: the
 * commission Lead picker is `/super-admin/leads?pageSize=100&partnerId={partnerId}`,
 * so it offers the partner's own leads instead of every lead on the platform.
 * The template itself stays the allowlisted key. The browser sends the
 * template plus a `bind.<field>` parameter per placeholder, and the route
 * substitutes them. Bound values are record ids, so anything that is not a
 * short id-shaped token is refused rather than spliced into an API path.
 */
const LOOKUP_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_.]*)(\?)?\}/g;
const LOOKUP_BINDING_VALUE = /^[A-Za-z0-9_-]{1,64}$/;
/*
 * A placeholder in the query string may also carry a display name — the
 * State picker is scoped by the country *name*, because that is what the
 * Country column stores (BUG-1578). It is still refused unless it is plainly a
 * name: letters, digits, spaces and the punctuation real place names use, and
 * never `/`, `?`, `#`, `%` or `=`. It is URI-encoded into a query value, so it
 * cannot add a parameter or change the path; a path segment keeps the strict
 * id-shaped rule above, so `..` can never reach one.
 */
const LOOKUP_QUERY_BINDING_VALUE = /^[\p{L}\p{M}\p{N} .,'’()&_-]{1,120}$/u;
export const LOOKUP_BINDING_PREFIX = "bind.";

type LookupPlaceholder = {
  name: string;
  /** `{field?}` — sent empty when the form has no value, instead of blocking. */
  optional: boolean;
  /** After the `?` of the template, where a display name is acceptable. */
  inQuery: boolean;
};

function lookupPlaceholders(template: string | undefined): LookupPlaceholder[] {
  if (!template) return [];
  const queryStart = template.indexOf("?");
  const seen = new Set<string>();
  const placeholders: LookupPlaceholder[] = [];
  for (const match of template.matchAll(LOOKUP_PLACEHOLDER)) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    placeholders.push({
      name,
      optional: match[2] === "?",
      inQuery: queryStart >= 0 && (match.index ?? 0) > queryStart,
    });
  }
  return placeholders;
}

function acceptsBinding(placeholder: LookupPlaceholder, value: string) {
  return placeholder.inQuery
    ? LOOKUP_QUERY_BINDING_VALUE.test(value)
    : LOOKUP_BINDING_VALUE.test(value);
}

/** The `{field}` names a lookup path depends on, in order, without repeats. */
export function lookupPathPlaceholders(template: string | undefined): string[] {
  return lookupPlaceholders(template).map((placeholder) => placeholder.name);
}

/**
 * Fields whose lookup is scoped by `changedKey`, directly or through another
 * dependent — State and City for Country, City for State.
 *
 * A dependent's value was chosen from a list the parent scoped. When the
 * parent changes, that value belongs to a list the form no longer offers — a
 * state of the previous country — so the form clears it rather than saving a
 * Country, State and City that contradict each other.
 */
export function lookupDependents(
  fields: ReadonlyArray<Pick<RuntimeFieldDefinition, "key" | "lookupPath">>,
  changedKey: string,
): string[] {
  const dependents: string[] = [];
  const queue = [changedKey];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const field of fields) {
      if (field.key === changedKey || dependents.includes(field.key)) continue;
      if (!lookupPathPlaceholders(field.lookupPath).includes(parent)) continue;
      dependents.push(field.key);
      queue.push(field.key);
    }
  }
  return dependents;
}

/**
 * The values a templated lookup needs, read from the form. Null while any of
 * them is missing or not id-shaped: the picker then loads nothing, rather
 * than falling back to the unscoped list the template exists to avoid.
 * An empty object for a path with no placeholders.
 */
export function resolveLookupBindings(
  template: string | undefined,
  values: Record<string, unknown>,
): Record<string, string> | null {
  const bindings: Record<string, string> = {};
  for (const placeholder of lookupPlaceholders(template)) {
    const value = readPath(values, placeholder.name);
    const text =
      typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";
    if (!text && placeholder.optional) {
      bindings[placeholder.name] = "";
      continue;
    }
    if (!text || !acceptsBinding(placeholder, text)) return null;
    bindings[placeholder.name] = text;
  }
  return bindings;
}

/**
 * The API path for an allowlisted template and its bindings, or null when a
 * placeholder is unbound or a value is not id-shaped. Used by the lookup
 * route, so a hand-made request cannot widen or redirect the call.
 */
export function bindRuntimeLookupPath(
  template: string,
  bindings: Record<string, string | null | undefined>,
): string | null {
  let invalid = false;
  const placeholders = new Map(
    lookupPlaceholders(template).map((placeholder) => [
      placeholder.name,
      placeholder,
    ]),
  );
  const bound = template.replace(LOOKUP_PLACEHOLDER, (_match, name: string) => {
    const placeholder = placeholders.get(name)!;
    const value = bindings[name]?.trim();
    if (!value && placeholder.optional) return "";
    if (!value || !acceptsBinding(placeholder, value)) {
      invalid = true;
      return "";
    }
    return encodeURIComponent(value);
  });
  return invalid ? null : bound;
}

/**
 * The API path a lookup request may call: the `path` parameter must be an
 * allowlisted template, and each of its placeholders is filled from the
 * matching `bind.<field>` parameter. Null for anything else.
 */
export function resolveAllowedLookupSource(
  allowed: ReadonlySet<string>,
  parameters: URLSearchParams,
): string | null {
  const template = parameters.get("path") ?? "";
  if (!allowed.has(template)) return null;
  const bindings: Record<string, string | null> = {};
  for (const name of lookupPathPlaceholders(template))
    bindings[name] = parameters.get(`${LOOKUP_BINDING_PREFIX}${name}`);
  return bindRuntimeLookupPath(template, bindings);
}

function readPath(values: Record<string, unknown>, path: string): unknown {
  if (path in values) return values[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[part];
  }, values);
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
  const label = String(
    candidates.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    ) ?? "Unknown",
  );
  return partnerLookupSuffix(item, label) ?? label;
}

/**
 * TASK-0032 WP-04, item 4. A partner selector that only ever shows a name
 * gives an operator no way to tell a live partner from a suspended one, or an
 * individual from a company, until they open the record. `item.type` being
 * `COMPANY`/`INDIVIDUAL` is unique to a `Partner` row among everything this
 * registry looks up — no other lookup target carries both a `type` in that
 * pair and a `status` — so this stays scoped to partners without a
 * per-lookup flag the registry would have to declare and keep in sync.
 */
function partnerLookupSuffix(
  item: Record<string, unknown>,
  label: string,
): string | null {
  const type = item.type;
  const status = item.status;
  if (
    (type !== "COMPANY" && type !== "INDIVIDUAL") ||
    typeof status !== "string" ||
    !status
  )
    return null;
  return `${label} — ${titleCaseEnum(type)} · ${titleCaseEnum(status)}`;
}

function titleCaseEnum(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
