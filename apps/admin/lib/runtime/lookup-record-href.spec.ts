import {
  buildLookupRecordHref,
  resolveLookupRecordRoute,
} from "./lookup-record-href";
import { getPlatformModuleDefinition } from "./platform-module-registry";

/**
 * A lookup that renders the referenced record's name and goes nowhere is a dead
 * end: the reader can see which customer a tenant belongs to and has no way to
 * open it. Only three fields in the whole registry carried an explicit
 * `displayHref`, so the link is derived from the lookup's own collection —
 * which is what makes "always clickable" true for fields nobody has written yet.
 */
describe("lookup record links", () => {
  it("maps each lookup collection to the route that can show the record", () => {
    expect(resolveLookupRecordRoute("/super-admin/customers?pageSize=100")).toBe(
      "/customers",
    );
    expect(resolveLookupRecordRoute("/super-admin/leads?pageSize=100")).toBe(
      "/leads",
    );
    expect(resolveLookupRecordRoute("/partners?pageSize=100")).toBe("/partners");
    expect(resolveLookupRecordRoute("/super-admin/plans")).toBe("/plans");
    expect(resolveLookupRecordRoute("/super-admin/tenants")).toBe("/tenants");
    expect(resolveLookupRecordRoute("/contracts?pageSize=100")).toBe(
      "/contracts",
    );
    expect(resolveLookupRecordRoute("/contract-templates")).toBe(
      "/contract-templates",
    );
    expect(
      resolveLookupRecordRoute("/super-admin/customer-onboarding?pageSize=100"),
    ).toBe("/onboarding");
  });

  it("returns nothing for a collection with no record page", () => {
    /*
     * A link to a 404 is worse than plain text. Platform users are managed as a
     * list under Settings and have no record route; promotion targets are plan
     * prices rather than records.
     */
    expect(
      resolveLookupRecordRoute("/platform-users/owner-candidates"),
    ).toBeNull();
    expect(
      resolveLookupRecordRoute("/super-admin/promotions/targets?scope=PRICE"),
    ).toBeNull();
    expect(resolveLookupRecordRoute(undefined)).toBeNull();
  });

  it("addresses the record by id, not by the label a person reads", () => {
    expect(
      buildLookupRecordHref(
        { lookupPath: "/super-admin/customers?pageSize=100" },
        "3f1c8d2e-0000-4000-8000-000000000001",
      ),
    ).toBe("/customers/3f1c8d2e-0000-4000-8000-000000000001");
  });

  it("produces no link when the id is missing, rather than one that 404s", () => {
    const field = { lookupPath: "/super-admin/customers" };
    expect(buildLookupRecordHref(field, null)).toBeNull();
    expect(buildLookupRecordHref(field, undefined)).toBeNull();
    expect(buildLookupRecordHref(field, "")).toBeNull();
    expect(buildLookupRecordHref(field, "   ")).toBeNull();
  });

  it("escapes an id rather than pasting it into a path", () => {
    expect(
      buildLookupRecordHref({ lookupPath: "/super-admin/plans" }, "a/../b"),
    ).toBe("/plans/a%2F..%2Fb");
  });

  /*
   * The requirement, asserted against the module the user reported it on: every
   * lookup the tenant record shows must be reachable, either through an explicit
   * template or through its collection.
   */
  it("gives every tenant lookup field somewhere to go", () => {
    const tenants = getPlatformModuleDefinition("tenants");
    const lookups = tenants.forms
      .flatMap((form) => form.fields)
      .filter(
        (field) => field.type === "lookup" || field.type.includes("Lookup"),
      );

    expect(lookups.length).toBeGreaterThan(0);

    const dead = lookups.filter(
      (field) =>
        !field.displayHref && !resolveLookupRecordRoute(field.lookupPath),
    );
    expect(dead.map((field) => field.key)).toEqual([]);
  });

  it("links the tenant list columns that name another record", () => {
    const tenants = getPlatformModuleDefinition("tenants");
    const byKey = new Map(
      tenants.columns.map((column) => [column.key, column] as const),
    );

    expect(byKey.get("customerAccount.companyName")?.link).toEqual({
      route: "/customers",
      idField: "customerAccount.id",
    });
    expect(byKey.get("subscription.plan.name")?.link).toEqual({
      route: "/plans",
      idField: "subscription.plan.id",
    });
  });
});
