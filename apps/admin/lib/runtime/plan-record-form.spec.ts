import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import { getRuntimeSchema } from "@repo/config";

const UPDATE_PLAN_DTO = join(
  __dirname,
  "../../../../services/api/src/modules/super-admin/dto/update-plan.dto.ts",
);

/**
 * The plan record form.
 *
 * `PlatformRuntimeService` validates with class-validator's
 * `forbidNonWhitelisted`, so one field the DTO does not declare fails the
 * whole save with a 400 — and the runtime completes a form from the Prisma
 * schema, which happily reports `isPublic`, `publicationStatus`, `salesModel`
 * and the publication timestamps as editable columns. `UpdatePlanDto` accepts
 * none of them, so every save from this screen failed.
 *
 * These assertions are written against the DTO source rather than a list
 * repeated here: adding a property to the DTO should let the form open that
 * field, and removing one must fail here rather than in the browser.
 */
describe("plan record form", () => {
  const definition = getPlatformModuleDefinition("plans");
  const detail = definition.forms.find((form) => form.key === "detail")!;
  const dtoSource = readFileSync(UPDATE_PLAN_DTO, "utf8");
  const accepted = new Set(
    [...dtoSource.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((match) => match[1]!),
  );

  it("reads the DTO it is asserting against", () => {
    expect(dtoSource).toContain("export class UpdatePlanDto");
    expect(accepted.has("name")).toBe(true);
    expect(accepted.has("featureKeys")).toBe(true);
  });

  it("leaves writable only the fields UpdatePlanDto accepts", () => {
    const schema = getRuntimeSchema("plans")!;
    const writable = detail.fields
      .filter((field) => !field.readOnly)
      .filter((field) => schema.fields[field.key]?.editable)
      .map((field) => field.key);
    const rejected = writable.filter((key) => !accepted.has(key));
    expect(rejected).toEqual([]);
    expect(writable.length).toBeGreaterThan(0);
  });

  it("still shows the publication state it will not let anyone edit", () => {
    for (const key of [
      "publicationStatus",
      "salesModel",
      "isPublic",
      "publishedAt",
      "archivedAt",
    ]) {
      const field = detail.fields.find((item) => item.key === key);
      expect([key, field?.readOnly]).toEqual([key, true]);
      expect([key, Boolean(field?.description)]).toEqual([key, true]);
    }
  });

  it("renders every declared tab", () => {
    expect(detail.tabs?.map((tab) => tab.key)).toEqual([
      "overview",
      "pricing",
      "entitlements",
      "commercial",
      "subscriptions",
      "customers",
      "stripe",
      "system",
    ]);
  });

  it("places the related record panels on tabs that exist", () => {
    const tabKeys = new Set((detail.tabs ?? []).map((tab) => tab.key));
    // Both panels declared no tab, and the record page only draws a
    // relationship whose tab is active — so neither ever rendered.
    for (const relationship of definition.relatedRecords ?? []) {
      expect([relationship.key, relationship.tab]).toEqual([
        relationship.key,
        relationship.tab,
      ]);
      expect([relationship.key, tabKeys.has(String(relationship.tab))]).toEqual([
        relationship.key,
        true,
      ]);
    }
    expect((definition.relatedRecords ?? []).length).toBeGreaterThan(0);
  });

  it("does not lead with the legacy price columns checkout ignores", () => {
    // BUG-0027: Admin showed monthlyBasePrice while checkout charged a
    // PlanPrice row. The legacy fields stay for manual billing, labelled as
    // legacy, and are not what the list or the summary reads.
    const columnFields = definition.columns.map((column) => column.field);
    expect(columnFields).not.toContain("monthlyBasePrice");
    expect(columnFields).not.toContain("annualBasePrice");
    for (const key of ["monthlyBasePrice", "annualBasePrice"]) {
      expect([
        key,
        detail.fields.find((item) => item.key === key)?.label,
      ]).toEqual([key, expect.stringContaining("Legacy")]);
    }
  });
});
