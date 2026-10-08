import { resolveTableColumnState } from "@/app/_components/runtime/runtime-module-list";
import { getPlatformModuleDefinition } from "./platform-module-registry";

/*
 * The first table a list draws is the effective one. Lists used to render the
 * definition's default columns, fetch the operator's saved state, and then
 * swap — so the wrong columns flashed for a moment on every load. The list now
 * waits for the saved state (drawing a header-less skeleton meanwhile) and
 * resolves both cases through this one function.
 */
const tenants = getPlatformModuleDefinition("tenants");
const keys = tenants.columns.map((column) => column.key);

describe("resolveTableColumnState", () => {
  it("uses the definition's visible columns when nothing is saved", () => {
    const state = resolveTableColumnState(null, tenants.columns);
    expect(state.visibleColumns).toEqual(
      tenants.columns
        .filter((column) => column.visible !== false)
        .map((column) => column.key),
    );
    expect(state.columnOrder).toEqual(keys);
    expect(state.columnWidths).toEqual({});
  });

  it("applies a saved selection, order and widths in one step", () => {
    const state = resolveTableColumnState(
      {
        visibleColumns: ["status", "slug"],
        columnOrder: ["status", ...keys.filter((key) => key !== "status")],
        columnWidths: { slug: 240 },
      },
      tenants.columns,
    );
    // The tenant identity is essential: no saved state can drop it.
    expect(state.visibleColumns).toContain("displayName");
    expect(state.visibleColumns).toContain("status");
    expect(state.visibleColumns).not.toContain("customerAccount.companyName");
    expect(state.columnOrder[0]).toBe("status");
    expect(state.columnWidths).toEqual({ slug: 240 });
  });
});

/*
 * A Tenants grid whose blue name could be the customer's sent operators to the
 * customer when they meant the tenant. The record the grid lists owns the
 * primary link; the customer is labelled as one.
 */
describe("tenant grid semantics", () => {
  it("leads with the tenant, labelled and linked as the tenant", () => {
    const first = tenants.columns[0]!;
    expect(first.field).toBe("displayName");
    expect(first.label).toBe("Tenant");
    expect(first.link).toEqual({ route: "/tenants", idField: "id" });
    expect(first.essential).toBe(true);
  });

  it("labels the customer as Customer and links it to the customer", () => {
    const customer = tenants.columns.find(
      (column) => column.field === "customerAccount.companyName",
    )!;
    expect(customer.label).toBe("Customer");
    expect(customer.link?.route).toBe("/customers");
    expect(customer.link?.idField).toBe("customerAccount.id");
  });

  it("does not repeat the customer on the customer's own Tenants tab", () => {
    const relationship = getPlatformModuleDefinition(
      "customers",
    ).relatedRecords?.find((item) => item.module === "tenants");
    const columns = relationship?.columns ?? [];
    expect(columns[0]?.label).toBe("Tenant");
    expect(columns[0]?.link?.route).toBe("/tenants");
    expect(
      columns.some((column) => column.field.startsWith("customer")),
    ).toBe(false);
  });

  it("names every tenant link on related grids as the tenant", () => {
    for (const definition of ["customers", "partners"] as const) {
      for (const relationship of getPlatformModuleDefinition(definition)
        .relatedRecords ?? []) {
        if (relationship.module !== "tenants") continue;
        const identity = relationship.columns?.find(
          (column) => column.field === "displayName",
        );
        expect(identity?.label).toBe("Tenant");
        expect(identity?.link?.route).toBe("/tenants");
      }
    }
  });
});
