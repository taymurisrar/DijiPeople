import {
  displayForOpaqueValue,
  isOpaqueId,
  siblingRelationLabel,
} from "./reference-display";
import { relatedCellValue } from "./related-records-model";
import { getPlatformModuleDefinition } from "./platform-module-registry";

const OWNER_ID = "6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d";

describe("a record id is never the label", () => {
  it("recognises a UUID and nothing else", () => {
    expect(isOpaqueId(OWNER_ID)).toBe(true);
    expect(isOpaqueId("AGR-0001")).toBe(false);
    expect(isOpaqueId(42)).toBe(false);
  });

  it("shows the customer's Tenant primary owner by name", () => {
    const record = {
      primaryOwnerUserId: OWNER_ID,
      primaryOwnerUser: { id: OWNER_ID, firstName: "Amina", lastName: "Khan" },
    };
    expect(
      displayForOpaqueValue(
        record,
        { key: "primaryOwnerUserId", label: "Tenant primary owner" },
        OWNER_ID,
      ),
    ).toBe("Amina Khan");
  });

  it("declares the primary owner as a lookup, so the form resolves it", () => {
    const customers = getPlatformModuleDefinition("customers");
    const field = customers.forms
      .flatMap((form) => form.fields)
      .find((item) => item.key === "primaryOwnerUserId");
    expect(field?.type).toBe("userLookup");
  });

  it("reads a sibling *Name field when there is no relation object", () => {
    expect(
      siblingRelationLabel({ createdByName: "Sam Lee" }, "createdById"),
    ).toBe("Sam Lee");
  });

  it("falls back to a readable label for a deleted reference", () => {
    expect(
      displayForOpaqueValue({}, { key: "createdById", label: "Created by" }, OWNER_ID),
    ).toBe("Unknown user");
    expect(
      displayForOpaqueValue({}, { key: "templateId", label: "Template" }, OWNER_ID),
    ).toBe("Unavailable record");
  });

  it("keeps a field that is itself an identifier", () => {
    expect(
      displayForOpaqueValue({}, { key: "id", label: "Customer ID" }, OWNER_ID),
    ).toBeNull();
    expect(
      displayForOpaqueValue({}, { key: "demoBatchId", label: "Demo batch ID" }, OWNER_ID),
    ).toBeNull();
  });

  it("resolves an id column in a subgrid through the embedded relation", () => {
    expect(
      relatedCellValue(
        { id: "r1", subscription: { planId: OWNER_ID, plan: { name: "Growth" } } },
        { key: "plan", field: "subscription.planId", label: "Plan" },
      ),
    ).toEqual({ kind: "text", text: "Growth" });
    expect(
      relatedCellValue(
        { id: "r1", tenantId: OWNER_ID },
        { key: "tenant", field: "tenantId", label: "Tenant" },
      ),
    ).toEqual({ kind: "text", text: "Unavailable record" });
  });
});
