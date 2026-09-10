/*
 * ITEM-0105 — the "New Entitlements" dialog on a leave policy could not set
 * `accrualType`, which `CreateLeavePolicyRuleDto` requires
 * (`services/api/src/modules/leave/dto/create-leave-policy-rule.dto.ts`). The
 * dialog's save still returned 201 because
 * `withRelatedRecordDefaults("leave_policy_rules", …)` in
 * `standard-module-data.adapter.ts` silently substituted "FIXED_ANNUAL" for
 * any submission that omitted the field — a value the creating user never saw
 * or chose.
 *
 * This asserts the declared metadata, the same way the sibling BUG-1962 file
 * (`quick-create-validation.spec.ts`) does: the Entitlements tab's
 * quick-create dialog now declares `accrualType` as a field, with the same
 * option set the API enum allows, so a user creating an entitlement can see
 * and choose it rather than having it happen to them.
 */
import { settingsAdapterRegistry } from "../../app/(authenticated)/settings/_lib/settings-adapter-registry";
import type { RelatedSubgridMetadata } from "./metadata-runtime.types";
import { buildSubgridQuickCreate } from "./quick-create-metadata";

type QuickCreateField = NonNullable<
  RelatedSubgridMetadata["quickCreateFields"]
>[number];

type RelatedTab = {
  readonly label: string;
  readonly relationshipName: string;
  readonly relatedEntityLogicalName?: string;
  readonly quickCreateFields?: readonly QuickCreateField[];
};

type StandardFieldSpec = {
  readonly logicalName: string;
  readonly options?: readonly { readonly value: string }[];
};

function findLeavePolicyRulesTab(tabKey: "entitlements" | "accrual-rules") {
  const registryEntry = settingsAdapterRegistry.get("leave-policies") as
    | {
        key: string;
        spec?: {
          fields?: readonly StandardFieldSpec[];
          relatedTabs?: readonly (RelatedTab & { tabKey?: string })[];
        };
      }
    | undefined;
  const tab = registryEntry?.spec?.relatedTabs?.find(
    (entry) => entry.tabKey === tabKey,
  );
  if (!tab) return undefined;
  return { tab, parentFields: registryEntry?.spec?.fields ?? [] };
}

const ACCRUAL_TYPE_VALUES = [
  "FIXED_ANNUAL",
  "MONTHLY_ACCRUAL",
  "PER_PAY_PERIOD",
  "PER_WORKED_HOUR",
  "NONE",
];

describe("ITEM-0105 — the entitlement dialog can set accrualType", () => {
  it("finds the leave-policies Entitlements tab to check", () => {
    // Guards the guard: if the tab is renamed the test below would otherwise
    // silently stop checking anything.
    expect(findLeavePolicyRulesTab("entitlements")).toBeDefined();
  });

  it("declares accrualType among the Entitlements tab's quick-create fields", () => {
    const found = findLeavePolicyRulesTab("entitlements");
    const accrualField = found?.tab.quickCreateFields?.find(
      (candidate) => candidate.fieldLogicalName === "accrualType",
    );
    expect(accrualField).toBeDefined();
  });

  it("builds a quick-create form exposing the same accrual options the API accepts", () => {
    const found = findLeavePolicyRulesTab("entitlements");
    expect(found).toBeDefined();
    if (!found) return;

    const subgrid: RelatedSubgridMetadata = {
      id: "subgrid-leave-policy-rules",
      relationshipName: found.tab.relationshipName,
      entityLogicalName:
        found.tab.relatedEntityLogicalName ?? found.tab.relationshipName,
      relatedEntityLogicalName: found.tab.relatedEntityLogicalName,
      title: found.tab.label,
      columns: [],
      quickCreateFields: found.tab.quickCreateFields,
    } as RelatedSubgridMetadata;

    const parentEntity = {
      id: "entity:leave-policies",
      logicalName: "leave-policies",
      displayName: "Leave Policies",
      collectionName: "leave-policies",
      version: "1.0.0",
      lifecycleState: "published" as const,
      layer: "system" as const,
      primaryIdField: "id",
      primaryNameField: "name",
      fields: found.parentFields as never,
    };

    const { entity } = buildSubgridQuickCreate(subgrid, parentEntity);
    const accrualField = entity.fields.find(
      (candidate) => candidate.logicalName === "accrualType",
    );

    expect(accrualField).toBeDefined();
    expect(accrualField?.dataType).toBe("optionset");
    expect(
      (accrualField?.options ?? []).map((option) => option.value).sort(),
    ).toEqual([...ACCRUAL_TYPE_VALUES].sort());
  });

  it("the Accrual Rules tab declares the identical field, so both dialogs agree", () => {
    // The two tabs are separate views onto the same `leave_policy_rules`
    // record. If they ever disagreed about accrualType's option set, a value
    // chosen on one tab could look invalid when the record is opened from the
    // other.
    const entitlements = findLeavePolicyRulesTab("entitlements");
    const accrualRules = findLeavePolicyRulesTab("accrual-rules");
    expect(entitlements).toBeDefined();
    expect(accrualRules).toBeDefined();

    const entitlementsField = entitlements?.tab.quickCreateFields?.find(
      (candidate) => candidate.fieldLogicalName === "accrualType",
    );
    const accrualRulesField = accrualRules?.tab.quickCreateFields?.find(
      (candidate) => candidate.fieldLogicalName === "accrualType",
    );
    expect(entitlementsField?.dataType).toBe(accrualRulesField?.dataType);
  });
});
