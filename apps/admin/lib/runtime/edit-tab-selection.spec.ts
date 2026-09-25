import { editEntryTab, tabHasEditableField } from "./edit-tab-selection";

/*
 * BUG-3546 — clicking Edit on a tenant record enabled Save while leaving the
 * operator on Overview, which has no editable field at all; the three
 * writable fields (`name`/`displayName`/`legalName`) live on Configuration.
 * This shape reproduces that field layout generically (no tenant-specific
 * code in the fix), plus the visibility/readOnly conditions a real module
 * uses to decide what actually renders.
 */
const TENANT_SHAPED = [
  { key: "tenantCode", tab: "overview", readOnly: true },
  { key: "status", tab: "overview", readOnly: true },
  { key: "name", tab: "configuration", readOnly: false },
  { key: "displayName", tab: "configuration", readOnly: false },
  { key: "legalName", tab: "configuration", readOnly: false },
  { key: "createdAt", tab: "system", readOnly: true },
];

const TABS = [
  { key: "overview" },
  { key: "configuration" },
  { key: "system" },
];

describe("editEntryTab", () => {
  it("switches to the first tab with an editable field when the current tab has none", () => {
    expect(editEntryTab(TABS, TENANT_SHAPED, {}, "overview")).toBe(
      "configuration",
    );
  });

  it("leaves the tab alone when the current tab already has something editable", () => {
    expect(editEntryTab(TABS, TENANT_SHAPED, {}, "configuration")).toBeNull();
  });

  it("returns null when no tab has anything editable at all", () => {
    const readOnlyOnly = TENANT_SHAPED.map((field) => ({
      ...field,
      readOnly: true,
    }));
    expect(editEntryTab(TABS, readOnlyOnly, {}, "overview")).toBeNull();
  });

  it("skips a field blocked by readOnlyWhen for the current values", () => {
    const fields = [
      {
        key: "amount",
        tab: "overview",
        readOnly: false,
        readOnlyWhen: { field: "locked", equals: true },
      },
      { key: "note", tab: "details", readOnly: false },
    ];
    expect(
      editEntryTab([{ key: "overview" }, { key: "details" }], fields, {
        locked: true,
      }, "overview"),
    ).toBe("details");
  });

  it("does not count a hidden field as editable", () => {
    const fields = [
      { key: "secret", tab: "overview", readOnly: false, hidden: true },
      { key: "note", tab: "details", readOnly: false },
    ];
    expect(
      editEntryTab([{ key: "overview" }, { key: "details" }], fields, {}, "overview"),
    ).toBe("details");
  });

  it("counts a conditionally-visible field only when its condition currently matches", () => {
    const fields = [
      {
        key: "partnerRate",
        tab: "overview",
        readOnly: false,
        visibleWhen: { field: "partnerId", hasValue: true },
      },
    ];
    expect(
      tabHasEditableField(fields, { partnerId: "" }, "overview"),
    ).toBe(false);
    expect(
      tabHasEditableField(fields, { partnerId: "p1" }, "overview"),
    ).toBe(true);
  });

  it("does not treat a non-input field type (timeline/relatedRecords/process) as editable", () => {
    const fields = [
      { key: "history", tab: "overview", type: "timeline", readOnly: false },
    ];
    expect(tabHasEditableField(fields, {}, "overview")).toBe(false);
  });
});
