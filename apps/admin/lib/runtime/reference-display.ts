/**
 * What a screen shows for a value that is a record id.
 *
 * The runtime already resolves foreign keys declared as lookups (BUG-1578),
 * but only those. A reference declared as plain `text` — the customer's Tenant
 * primary owner, Created by / Updated by, a payment's tenant and invoice —
 * printed its UUID verbatim, and so did any list or subgrid column bound to an
 * `…Id` path. This is the one rule every renderer applies after its own
 * resolution has failed: a UUID is never the label.
 *
 * Ids stay in the data — the API, links and payloads still carry them. Only
 * the text an operator reads changes.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/**
 * A field that *is* an identifier — "Customer ID" on the System tab, the
 * record's own `id` — rather than a reference to another record. Its value is
 * the thing being shown, for support and reconciliation, so it stays.
 */
export function isIdentifierField(field: { key: string; label?: string }) {
  return field.key === "id" || /\bID$/.test(field.label?.trim() ?? "");
}

/** The readable stand-in for a reference nothing could resolve. */
export function unresolvedReferenceLabel(field: {
  key: string;
  type?: string;
}) {
  const userish =
    field.type === "userLookup" ||
    /(User|By|Owner|Manager)Id$/.test(field.key.split(".").pop() ?? "");
  return userish ? "Unknown user" : "Unavailable record";
}

/**
 * The label of an embedded relation object, in the order every renderer
 * already used: explicit label, then the naming fields records actually carry.
 */
export function relationObjectLabel(relation: unknown): string | null {
  if (!relation || typeof relation !== "object" || Array.isArray(relation))
    return null;
  const record = relation as Record<string, unknown>;
  const candidates = [
    record.label,
    record.displayName,
    record.companyName,
    record.name,
    record.fullName,
    record.title,
    [record.firstName, record.lastName].filter(Boolean).join(" ") || undefined,
    record.contractNumber,
    record.invoiceNumber,
    record.email,
  ];
  const found = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  return found ? String(found) : null;
}

/**
 * For a record and the path of an id field (`primaryOwnerUserId`,
 * `subscription.planId`), the sibling relation's label (`primaryOwnerUser`,
 * `subscription.plan`) when the API embedded one.
 */
export function siblingRelationLabel(
  record: Record<string, unknown>,
  path: string,
): string | null {
  const segments = path.split(".");
  const last = segments.pop() ?? "";
  const relationKey = last.replace(/Id$/, "");
  if (!relationKey || relationKey === last) return null;
  let parent: unknown = record;
  for (const segment of segments) {
    parent =
      parent && typeof parent === "object"
        ? (parent as Record<string, unknown>)[segment]
        : undefined;
  }
  if (!parent || typeof parent !== "object") return null;
  const container = parent as Record<string, unknown>;
  return (
    relationObjectLabel(container[relationKey]) ??
    (typeof container[`${relationKey}Name`] === "string" &&
    String(container[`${relationKey}Name`]).trim()
      ? String(container[`${relationKey}Name`])
      : null)
  );
}

/**
 * The text for a cell or read-only field whose value may be an id. Returns
 * `null` when the value is not an opaque id (render it as usual), otherwise a
 * resolved label or the readable fallback.
 */
export function displayForOpaqueValue(
  record: Record<string, unknown>,
  field: { key: string; label?: string; type?: string; path?: string },
  value: unknown,
): string | null {
  if (!isOpaqueId(value) || isIdentifierField(field)) return null;
  return (
    siblingRelationLabel(record, field.path ?? field.key) ??
    unresolvedReferenceLabel(field)
  );
}
