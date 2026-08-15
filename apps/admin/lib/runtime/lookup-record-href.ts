import type { RuntimeFieldDefinition } from "./platform-runtime.types";

/**
 * Where a lookup's referenced record actually lives in Platform Admin.
 *
 * WHY THIS EXISTS. A lookup field already knows where its options come from —
 * `lookupPath` names the API collection. What it did not know was where the
 * chosen record can be *read*, so a resolved lookup rendered as inert text: the
 * tenant record showed "Maseer Group" and a plan name and an owner, and none of
 * them went anywhere. Only three fields in the whole registry carried an
 * explicit `displayHref`, and adding one per field would mean every new lookup
 * silently starts out dead again.
 *
 * So the route is derived from the collection instead. One entry per module,
 * added once, and every lookup that reads from that collection becomes
 * clickable — including ones that do not exist yet.
 *
 * A collection with no record page is deliberately absent rather than guessed:
 * a link to a 404 is worse than plain text.
 */
const RECORD_ROUTE_BY_COLLECTION: Array<{ match: RegExp; route: string }> = [
  { match: /^\/super-admin\/customers\b/, route: "/customers" },
  { match: /^\/super-admin\/customer-onboarding\b/, route: "/onboarding" },
  { match: /^\/super-admin\/leads\b/, route: "/leads" },
  { match: /^\/super-admin\/tenants\b/, route: "/tenants" },
  { match: /^\/super-admin\/plans\b/, route: "/plans" },
  { match: /^\/super-admin\/subscriptions\b/, route: "/subscriptions" },
  { match: /^\/super-admin\/invoices\b/, route: "/invoices" },
  { match: /^\/super-admin\/payments\b/, route: "/payments" },
  { match: /^\/partners\b/, route: "/partners" },
  { match: /^\/contracts\b/, route: "/contracts" },
  { match: /^\/contract-templates\b/, route: "/contract-templates" },
  { match: /^\/signature-requests\b/, route: "/signature-requests" },
  { match: /^\/support-cases\b/, route: "/support" },
  /*
   * Deliberately not mapped:
   *   /platform-users/owner-candidates — platform users have no record page;
   *     they are managed as a list under Settings.
   *   /super-admin/promotions/targets — targets are plan prices, not records.
   */
];

/** The module a lookup reads from, if Platform Admin can show that record. */
export function resolveLookupRecordRoute(
  lookupPath: string | undefined,
): string | null {
  if (!lookupPath) return null;
  /* Query strings are pagination, not identity. */
  const path = lookupPath.split("?")[0] ?? "";
  const entry = RECORD_ROUTE_BY_COLLECTION.find((candidate) =>
    candidate.match.test(path),
  );
  return entry?.route ?? null;
}

/**
 * The link for a resolved lookup value.
 *
 * An explicit `displayHref` on the field always wins — some fields link
 * somewhere the collection does not imply. Otherwise the route is derived, and
 * the *raw id* is used: the label is what a person reads, the id is what
 * addresses the record.
 */
export function buildLookupRecordHref(
  field: Pick<RuntimeFieldDefinition, "lookupPath">,
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  if (!id) return null;

  const route = resolveLookupRecordRoute(field.lookupPath);
  if (!route) return null;

  return `${route}/${encodeURIComponent(id)}`;
}
