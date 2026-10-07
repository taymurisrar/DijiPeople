import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRuntimeField } from "@repo/config";
import { getPlatformModuleDefinition } from "./platform-module-registry";

/*
 * EXECPLAN-0055 WP-08 — every partner tab is real.
 *
 * The record page drops a tab with no fields, no subgrid, no timeline and no
 * panel, which is how a declared Documents tab never rendered; and subgrids
 * declared columns the related payload never filled, so Contacts, Customers,
 * Tenants and Referred Leads were rows of dashes. Each tab must resolve to a
 * data source, each subgrid must say what an empty grid means, and each
 * subgrid key must be one the API serves.
 */
const partners = getPlatformModuleDefinition("partners");
const detail = partners.forms.find((form) => form.key === "detail")!;
const tabs = detail.tabs ?? [];
const related = partners.relatedRecords ?? [];
const TIMELINE_TABS = ["timeline", "activities"];
const FULL_ROW_RELATIONS = [
  "agreements",
  "commissions",
  "inquiries",
  "referralLinks",
];

const apiRoot = join(__dirname, "../../../../services/api/src/modules");
const relationsSource = readFileSync(
  join(apiRoot, "platform-runtime/platform-runtime-relations.service.ts"),
  "utf8",
);
const partnerReadSource = [
  "partners/partners.service.ts",
  "partners/partner-related-records.ts",
  "partners/partner-commission-lifecycle.ts",
]
  .map((file) => readFileSync(join(apiRoot, file), "utf8"))
  .join("\n");

describe("partner record tabs", () => {
  it("labels the contacts tab Contacts and has no Documents tab", () => {
    expect(tabs.find((tab) => tab.key === "contacts")?.label).toBe("Contacts");
    expect(tabs.some((tab) => tab.key === "documents")).toBe(false);
    expect(
      JSON.stringify(partners).toLowerCase().includes("contacts and users"),
    ).toBe(false);
  });

  it.each(tabs.map((tab) => [tab.key, tab.label] as const))(
    "%s (%s) has something to show",
    (key) => {
      const hasFields = detail.fields.some(
        (field) => field.tab === key && !field.hidden,
      );
      const hasSubgrid = related.some((item) => item.tab === key);
      expect(hasFields || hasSubgrid || TIMELINE_TABS.includes(key)).toBe(true);
    },
  );

  it.each([
    ["application", ["inquiries", "onboardingApplications"]],
    ["contacts", ["portalUsers"]],
    ["agreements", ["agreements"]],
    ["referral-links", ["referralLinks"]],
    ["referred-leads", ["leads"]],
    ["customers", ["attributedCustomers"]],
    ["tenants", ["attributedTenants"]],
    ["summary", ["commissions"]],
  ])("the %s tab lists %j", (tab, keys) => {
    expect(
      related.filter((item) => item.tab === tab).map((item) => item.key),
    ).toEqual(keys);
  });

  it.each(related.map((item) => [item.key, item] as const))(
    "%s has an empty state and columns, and the API serves it",
    (key, relationship) => {
      expect(relationship.emptyTitle).toBeTruthy();
      expect(relationship.emptyDescription).toBeTruthy();
      expect(relationship.columns?.length).toBeGreaterThan(0);
      expect(relationsSource).toContain(`'${key}'`);
    },
  );

  it.each(
    related.flatMap((relationship) =>
      (relationship.columns ?? []).map(
        (column) => [relationship.key, column.field] as const,
      ),
    ),
  )("%s column %s is a value the partner read returns", (key, field) => {
    const leaf = field.split(".")[0]!;
    /*
     * Relations `PartnersService.get` includes whole (no `select`) carry every
     * column of their model; the rest carry only what the read selects or the
     * shapers in partner-related-records.ts compute.
     */
    const modelColumn =
      FULL_ROW_RELATIONS.includes(key) &&
      Boolean(resolveRuntimeField("partners", `${key}.${leaf}`));
    const readOrComputed = new RegExp(`\\b${leaf}\\b`).test(partnerReadSource);
    expect({ key, field, served: modelColumn || readOrComputed }).toEqual({
      key,
      field,
      served: true,
    });
  });

  it("offers Add where the API can create the record", () => {
    const creatable = related
      .filter((item) => item.quickCreate)
      .map((item) => [item.key, item.quickCreate!.actionLabel]);
    expect(creatable).toEqual([
      ["commissions", "Add commission"],
      ["portalUsers", "Add contact"],
      ["referralLinks", "Add referral link"],
    ]);
  });

  it("gates Add and every writing row command on partners.manage", () => {
    expect(partners.permissions.update).toBe("partners.manage");
    for (const item of related)
      expect(item.quickCreate?.permission ?? partners.permissions.update).toBe(
        "partners.manage",
      );
    const writing = related
      .flatMap((item) => item.rowActions ?? [])
      .filter((action) => action.kind !== "copy");
    expect(writing.some((action) => action.kind === "delete")).toBe(true);
    for (const action of writing)
      expect(action.permission).toBe("partners.manage");
  });
});
