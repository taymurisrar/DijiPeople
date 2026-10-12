import { PLATFORM_MODULE_REGISTRY } from "./platform-module-registry";
import { buildLookupRecordHref } from "./lookup-record-href";

/**
 * Every lookup is a link (BUG-4111).
 *
 * A lookup names another record, so it should take the operator to it. This
 * walks every field of every module and fails on a lookup that would render as
 * inert text — so a new lookup cannot quietly ship dead. The only exemptions
 * are reference catalogs: a country or a currency is a value, not a record
 * with a page.
 */
const REFERENCE_CATALOGS = [
  /^\/public\/geography\//,
  /^\/super-admin\/platform-settings\/currencies\b/,
];

const SAMPLE_ID = "6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d";

const lookups = [...PLATFORM_MODULE_REGISTRY.values()].flatMap((definition) =>
  definition.forms.flatMap((form) =>
    form.fields
      .filter((field) => field.type === "lookup" || field.type.includes("Lookup"))
      .map((field) => ({ module: definition.key, field })),
  ),
);

describe("lookup fields link to their record", () => {
  it.each(
    lookups
      .filter(
        ({ field }) =>
          !REFERENCE_CATALOGS.some((pattern) =>
            pattern.test(field.lookupPath?.split("?")[0] ?? ""),
          ),
      )
      .map(({ module, field }) => [`${module}.${field.key}`, field] as const),
  )("%s links somewhere", (_name, field) => {
    expect(
      Boolean(field.displayHref) || Boolean(buildLookupRecordHref(field, SAMPLE_ID)),
    ).toBe(true);
  });

  it("sends the tenant primary owner to the tenant's Access tab, outlined", () => {
    const customers = PLATFORM_MODULE_REGISTRY.get("customers");
    const owner = customers?.forms
      .flatMap((form) => form.fields)
      .find((field) => field.key === "primaryOwnerUserId");
    expect(owner?.displayHref).toBe(
      "/tenants/{primaryOwnerUser.tenantId}?tab=access-security&highlight={primaryOwnerUserId}",
    );
  });

  it("sends a platform user to the users list with the row highlighted", () => {
    expect(
      buildLookupRecordHref(
        { lookupPath: "/platform-users/owner-candidates" },
        SAMPLE_ID,
      ),
    ).toBe(`/settings/users?highlight=${SAMPLE_ID}`);
  });
});
