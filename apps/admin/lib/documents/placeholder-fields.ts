import { isSignatureTokenKey } from "./signature-block";

/**
 * A placeholder as `GET /contracts/placeholder-definitions` serves it.
 *
 * The API decides *which* placeholders an agreement or template is offered —
 * by the subject it is with (partner, lead, customer, tenant), from
 * `offeredPlaceholderEntities` in the contracts module. Nothing here narrows
 * by entity: a second, frontend-side context table is how the picker and the
 * renderer drifted apart before (ADR-0020), so this file only groups, filters
 * and orders what the API already chose.
 */
export type PlaceholderFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  dataType: string;
  sourceEntity: string;
  required?: boolean;
  exampleValue?: string;
  group?: string;
  deprecatedFor?: string;
};

/** Build the query string for the context the editor is authoring in. */
export function placeholderDefinitionsQuery(context: {
  contractType?: string;
  contractId?: string;
}) {
  const params = new URLSearchParams();
  if (context.contractType) params.set("contractType", context.contractType);
  if (context.contractId) params.set("contractId", context.contractId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The Fields list: the offered placeholders, grouped in the API's group order
 * and filtered by the search box.
 *
 * Two kinds are never listed:
 *  - superseded keys (`deprecatedFor`) — they keep resolving for templates
 *    that already use them, but new documents get the canonical key;
 *  - `signature.*` tokens — a signature is inserted through the signature box,
 *    which chooses the signer and builds the whole block. Offering the raw
 *    tokens here as well was a second, unlabelled way to place a signature
 *    that produced a mark with no name, role or date beside it.
 */
export function groupOfferedFields(
  definitions: readonly PlaceholderFieldDefinition[],
  query: string,
  groupOrder: readonly string[],
) {
  const needle = query.trim().toLowerCase();
  const byGroup = new Map<string, PlaceholderFieldDefinition[]>();
  for (const definition of definitions) {
    if (definition.deprecatedFor || isSignatureTokenKey(definition.key))
      continue;
    const group = definition.group ?? "Other";
    const haystack =
      `${definition.key} ${definition.label} ${definition.dataType} ${group}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), definition]);
  }
  const rank = (group: string) => {
    const index = groupOrder.indexOf(group);
    return index === -1 ? groupOrder.length : index;
  };
  return [...byGroup.keys()]
    .sort((first, second) => rank(first) - rank(second))
    .map((group) => ({ group, items: byGroup.get(group) ?? [] }));
}

/**
 * Classify a `{{token}}` in the document for display. Signature fields are
 * drawn differently from merge fields so an author can see at a glance where
 * each party signs.
 */
export function documentTokenKind(key: string): "signature" | "field" {
  return isSignatureTokenKey(key) ? "signature" : "field";
}

/** Every `{{token}}` in a run of text, with its offsets. */
export function findDocumentTokens(text: string) {
  return [...text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map(
    (match) => ({
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
      key: match[1],
      kind: documentTokenKind(match[1]),
    }),
  );
}
