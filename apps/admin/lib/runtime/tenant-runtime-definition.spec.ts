import { getPlatformModuleDefinition } from "./platform-module-registry";
import { TenantStatusLabels, toTenantStatus } from "@/lib/domain";

/**
 * The tenant runtime definition is what the record page renders, so the rules
 * that were previously broken on that screen are asserted against it here:
 * the tab set, the removal of Branding and Integrations, and the presentation
 * metadata that stops foreign keys and actor ids rendering as UUIDs.
 */
describe("tenant runtime definition", () => {
  const definition = getPlatformModuleDefinition("tenants");
  const detail = definition.forms.find((form) => form.key === "detail")!;

  it("uses the eight control-plane tabs in order", () => {
    expect(detail.tabs?.map((tab) => tab.label)).toEqual([
      "Overview",
      "Configuration",
      "Access & Security",
      "Commercial",
      "Apps & Modules",
      "Operations",
      "Timeline",
      "System",
    ]);
  });

  it("derives stable tab keys the section placement is written against", () => {
    expect(detail.tabs?.map((tab) => tab.key)).toEqual([
      "overview",
      "configuration",
      "access-security",
      "commercial",
      "apps-modules",
      "operations",
      "timeline",
      "system",
    ]);
  });

  it("no longer exposes Branding or Integrations from Platform Admin", () => {
    const tabKeys = detail.tabs?.map((tab) => tab.key) ?? [];
    expect(tabKeys).not.toContain("integrations");
    expect(tabKeys).not.toContain("branding");
    const relationshipKeys = (definition.relatedRecords ?? []).map(
      (item) => item.key,
    );
    expect(relationshipKeys).not.toContain("tenantBranding");
    expect(relationshipKeys).not.toContain("attendanceIntegrationConfigs");
  });

  it("resolves the customer to a business label and links to its record", () => {
    const customer = detail.fields.find(
      (field) => field.key === "customerAccountId",
    )!;
    expect(customer.displayValueField).toBe("customerAccount.companyName");
    expect(customer.displayHref).toBe("/customers/{customerAccountId}");
    expect(customer.readOnly).toBe(true);
  });

  it("resolves actor ids to names rather than rendering UUIDs", () => {
    expect(
      detail.fields.find((field) => field.key === "createdById")
        ?.displayValueField,
    ).toBe("createdByName");
    expect(
      detail.fields.find((field) => field.key === "updatedById")
        ?.displayValueField,
    ).toBe("updatedByName");
    expect(
      detail.fields.find((field) => field.key === "ownerUserId")
        ?.displayValueField,
    ).toBe("owner.fullName");
  });

  it("resolves attribution lookups to labels", () => {
    expect(
      detail.fields.find((field) => field.key === "originatingLeadId")
        ?.displayValueField,
    ).toBe("originatingLead.label");
    expect(
      detail.fields.find((field) => field.key === "originatingPartnerId")
        ?.displayValueField,
    ).toBe("originatingPartner.label");
  });

  it("keeps technical identifiers on the System tab and marks them as identifiers", () => {
    const tenantId = detail.fields.find((field) => field.key === "id")!;
    expect(tenantId.tab).toBe("system");
    expect(tenantId.renderAs).toBe("identifier");
  });

  it("holds the workspace slug and tenant code immutable after provisioning", () => {
    expect(detail.fields.find((field) => field.key === "slug")?.readOnly).toBe(
      true,
    );
    expect(
      detail.fields.find((field) => field.key === "tenantCode")?.readOnly,
    ).toBe(true);
  });

  it("declares every lifecycle status with a readable label", () => {
    const values = definition.statuses?.map((status) => status.value) ?? [];
    expect(values).toEqual(
      expect.arrayContaining([
        "PROVISIONING",
        "PROVISIONING_FAILED",
        "DECOMMISSIONING",
        "DECOMMISSIONED",
      ]),
    );
    expect(
      definition.statuses?.find((status) => status.value === "PROVISIONING_FAILED")
        ?.label,
    ).toBe("Provisioning Failed");
  });

  it("offers suspend only from states a tenant can be suspended from", () => {
    const suspend = definition.actions.find(
      (action) => action.key === "suspend-tenant",
    )!;
    expect(suspend.states).toContain("ACTIVE");
    expect(suspend.states).not.toContain("SUSPENDED");
    expect(suspend.destructive).toBe(true);
  });

  it("offers reactivate only from stopped states", () => {
    const reactivate = definition.actions.find(
      (action) => action.key === "reactivate-tenant",
    )!;
    expect(reactivate.states).toContain("SUSPENDED");
    expect(reactivate.states).not.toContain("ACTIVE");
  });

  it("offers retry provisioning only while provisioning is unfinished or failed", () => {
    const retry = definition.actions.find(
      (action) => action.key === "retry-provisioning",
    )!;
    expect(retry.states).toEqual(
      expect.arrayContaining(["PROVISIONING", "PROVISIONING_FAILED"]),
    );
    expect(retry.states).not.toContain("ACTIVE");
  });

  it("never offers erasure of a live tenant", () => {
    const erase = definition.actions.find(
      (action) => action.key === "erase-tenant",
    )!;
    expect(erase.states).not.toContain("ACTIVE");
    expect(erase.destructive).toBe(true);
    expect(erase.placement).toBe("overflow");
  });

  it("keeps Open Tenant as the primary operational action for a live tenant", () => {
    const open = definition.actions.find(
      (action) => action.key === "open-tenant",
    )!;
    expect(open.placement).toBe("primary");
    expect(open.states).toEqual(["ACTIVE"]);
  });

  it("keeps the ordinary record actions available", () => {
    const keys = definition.actions.map((action) => action.key);
    expect(keys).toEqual(
      expect.arrayContaining(["back", "edit", "save", "save-close"]),
    );
  });
});

describe("tenant status vocabulary", () => {
  it("accepts every lifecycle value the API can return", () => {
    for (const value of [
      "ONBOARDING",
      "PENDING_SETUP",
      "PROVISIONING",
      "PROVISIONING_FAILED",
      "ACTIVE",
      "SUSPENDED",
      "INACTIVE",
      "DECOMMISSIONING",
      "DECOMMISSIONED",
      "ARCHIVED",
      "CHURNED",
    ]) {
      expect(() => toTenantStatus(value)).not.toThrow();
      expect(TenantStatusLabels[toTenantStatus(value)]).toBeTruthy();
    }
  });

  it("never presents a raw enum value as a label", () => {
    for (const label of Object.values(TenantStatusLabels)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toMatch(/^[A-Z]+$/);
    }
  });
});
