/*
 * ITEM-0036 / ADR-0007. `metadata-registry.ts`'s `getEntityMetadata()` was
 * deleted because nothing ever populated it — every lookup field routed
 * through it fell back to a hardcoded `"name"`, silently wrong for any entity
 * whose primary field is not literally that. `employee-metadata.adapter.ts`'s
 * lookup fields were the one place that live fallback was actually reachable:
 * they set only `lookupTargets: [{ entityLogicalName }]`, so an
 * Employee-to-Employee lookup (e.g. "Reporting Manager") rendered
 * `record.name` — `undefined` on an `Employee`, whose display field is
 * `fullName`.
 *
 * These assert both halves of the fix: the shared helper resolves the known
 * entities correctly, and the employee adapter now calls it when building a
 * lookup field, so the field itself carries the right answer instead of
 * depending on a caller's fallback.
 */
import { defaultPrimaryNameFieldForEntity } from "./entity-primary-name-field";
import { buildEmployeeEntityMetadata } from "./employee-metadata.adapter";

describe("defaultPrimaryNameFieldForEntity", () => {
  it("resolves employee to fullName, not the generic default", () => {
    expect(defaultPrimaryNameFieldForEntity("employee")).toBe("fullName");
  });

  it("resolves employeeBankAccount to accountTitle", () => {
    expect(defaultPrimaryNameFieldForEntity("employeeBankAccount")).toBe(
      "accountTitle",
    );
  });

  it("falls back to name for an entity it does not specifically know", () => {
    expect(defaultPrimaryNameFieldForEntity("someFutureEntity")).toBe("name");
  });
});

describe("employee lookup fields carry a real primaryNameField", () => {
  const fields = buildEmployeeEntityMetadata().fields;

  it("reportingManagerEmployeeId resolves to the employee's own display field", () => {
    const field = fields.find(
      (candidate) => candidate.logicalName === "reportingManagerEmployeeId",
    );
    expect(field?.lookupTargets?.[0]).toMatchObject({
      entityLogicalName: "employee",
      primaryNameField: "fullName",
    });
  });

  it("every lookup field declares a primaryNameField on its target", () => {
    const lookupFields = fields.filter(
      (candidate) => candidate.dataType === "lookup" && candidate.lookupTargets?.length,
    );
    expect(lookupFields.length).toBeGreaterThan(0);
    for (const field of lookupFields) {
      for (const target of field.lookupTargets ?? []) {
        expect(target.primaryNameField).toBeTruthy();
      }
    }
  });
});
