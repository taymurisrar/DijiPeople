/*
 * BUG-1962 — "Assigned On" was required by the API and optional to the user.
 *
 * The field now carries `required: true` on both leave-policy assignment tabs,
 * which produced the asterisk and `input.required === true` — and stopped
 * nothing. The quick-create dialog's Save buttons are `type="button"` click
 * handlers, so there is no form submit for the browser's native `required` to
 * gate; the value still reached the API, which answered
 * `effectiveFrom must be a valid ISO 8601 date string` for a control labelled
 * "Assigned On".
 *
 * This drives the real path: the subgrid metadata a settings tab declares, the
 * quick-create entity and form the dialog builds from it, and the gate the
 * dialog now runs before calling `onSave`. It asserts the message the user
 * reads, because that is what acceptance criteria 2 and 3 are about — a test
 * asserting only that validation ran would pass while still showing the DTO
 * property name.
 */
import { settingsAdapterRegistry } from "../../app/(authenticated)/settings/_lib/settings-adapter-registry";
import type { RelatedSubgridMetadata } from "./metadata-runtime.types";
import {
  buildSubgridQuickCreate,
  resolveQuickCreateSubmission,
} from "./quick-create-metadata";
import type { RuntimeFormValues } from "./runtime-form-validation";

type QuickCreateField = NonNullable<
  RelatedSubgridMetadata["quickCreateFields"]
>[number];

type RelatedTab = {
  readonly label: string;
  readonly relationshipName: string;
  readonly relatedEntityLogicalName?: string;
  readonly quickCreateFields?: readonly QuickCreateField[];
};

type DeclaredTab = { readonly origin: string; readonly tab: RelatedTab };

function declaredQuickCreateTabs(): DeclaredTab[] {
  const found: DeclaredTab[] = [];
  for (const [key, adapter] of settingsAdapterRegistry) {
    const tabs = (adapter as { spec?: { relatedTabs?: readonly RelatedTab[] } })
      .spec?.relatedTabs;
    for (const tab of tabs ?? []) {
      if (tab.quickCreateFields?.length) {
        found.push({ origin: `${key} > ${tab.relationshipName}`, tab });
      }
    }
  }
  return found;
}

/** The same shape `buildStandardRelatedSubgrid` hands the dialog. */
function asSubgrid(tab: RelatedTab): RelatedSubgridMetadata {
  return {
    id: `subgrid-${tab.relationshipName}`,
    relationshipName: tab.relationshipName,
    entityLogicalName: tab.relatedEntityLogicalName ?? tab.relationshipName,
    relatedEntityLogicalName: tab.relatedEntityLogicalName,
    title: tab.label,
    columns: [],
    quickCreateFields: tab.quickCreateFields,
  } as RelatedSubgridMetadata;
}

function submit(tab: RelatedTab, values: RuntimeFormValues) {
  const { entity, form } = buildSubgridQuickCreate(asSubgrid(tab));
  return resolveQuickCreateSubmission({ entity, form, values });
}

/** Every declared field except the ones the caller wants left empty. */
function filled(tab: RelatedTab, omit: readonly string[]) {
  const values: Record<string, string> = {};
  for (const field of tab.quickCreateFields ?? []) {
    if (omit.includes(field.fieldLogicalName)) continue;
    values[field.fieldLogicalName] =
      field.dataType === "date" ? "2026-01-01" : "value";
  }
  return values;
}

const TABS = declaredQuickCreateTabs();
const ASSIGNED_ON_TABS = TABS.filter((entry) =>
  entry.tab.quickCreateFields?.some(
    (field) =>
      field.fieldLogicalName === "effectiveFrom" &&
      field.label === "Assigned On",
  ),
);

describe("BUG-1962 — a required quick-create field stops the submission", () => {
  it("finds the leave-policy assignment tabs to check", () => {
    /*
     * Guards the guard, and records a fact the record turned on: the two tabs
     * are separate declarations of the same relationship, so fixing one would
     * have left the other rendering the field as optional. If either is
     * renamed or relabelled, this fails rather than silently checking one.
     */
    expect(TABS.length).toBeGreaterThan(5);
    expect(ASSIGNED_ON_TABS).toHaveLength(2);
  });

  it.each(ASSIGNED_ON_TABS.map((entry) => entry.origin))(
    "%s blocks an empty Assigned On before any request is sent",
    (origin) => {
      const entry = ASSIGNED_ON_TABS.find((item) => item.origin === origin);
      const submission = submit(
        entry!.tab,
        filled(entry!.tab, ["effectiveFrom"]),
      );

      expect(submission.status).toBe("blocked");
      if (submission.status !== "blocked") return;

      // Criterion 2: an inline error, on that field.
      expect(submission.errors.effectiveFrom).toEqual([
        "Assigned On is required.",
      ]);

      /*
       * Criterion 3, and the load-bearing half. The old failure was not that
       * nothing was said — it was that what the user read named the DTO
       * property. Any message here that mentions either is a regression even if
       * the field is correctly flagged.
       */
      const everything = [
        submission.summary,
        ...Object.values(submission.errors).flat(),
      ].join(" ");
      expect(everything).not.toContain("effectiveFrom");
      expect(everything).not.toContain("ISO 8601");
    },
  );

  it.each(ASSIGNED_ON_TABS.map((entry) => entry.origin))(
    "%s saves once Assigned On is supplied",
    (origin) => {
      const entry = ASSIGNED_ON_TABS.find((item) => item.origin === origin);
      expect(submit(entry!.tab, filled(entry!.tab, [])).status).toBe("valid");
    },
  );

  it("gates every other required quick-create field the same way", () => {
    /*
     * The gate belongs to the dialog, not to this field: the same gap let any
     * required quick-create field anywhere in settings reach the API empty. So
     * this asserts the class, over whatever the registry declares today.
     */
    const withRequired = TABS.filter((entry) =>
      entry.tab.quickCreateFields?.some((field) => field.required),
    );
    expect(withRequired.length).toBeGreaterThan(0);

    for (const entry of withRequired) {
      const required = (entry.tab.quickCreateFields ?? []).filter(
        (field) => field.required,
      );
      const submission = submit(
        entry.tab,
        filled(
          entry.tab,
          required.map((field) => field.fieldLogicalName),
        ),
      );
      expect(submission.status).toBe("blocked");
    }
  });

  it("does not block when the dialog has no metadata to validate against", () => {
    // The panel renders its own "form metadata is not available yet" state in
    // that case; refusing to save would strand it.
    expect(
      resolveQuickCreateSubmission({
        entity: undefined,
        form: null,
        values: {},
      }).status,
    ).toBe("valid");
  });
});
