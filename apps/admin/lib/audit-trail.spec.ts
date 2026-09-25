import {
  buildAuditTrailQueryString,
  diffAuditSnapshotFields,
} from "./audit-trail";

describe("buildAuditTrailQueryString", () => {
  it("keeps only the params the API's DTO declares", () => {
    const query = buildAuditTrailQueryString({
      action: "TENANT_PROFILE_UPDATED",
      entityType: "Tenant",
      page: "2",
      // Not a filter the DTO declares — must not reach the request.
      viewId: "critical",
      sortBy: "createdAt",
    });

    const params = new URLSearchParams(query);
    expect(params.get("action")).toBe("TENANT_PROFILE_UPDATED");
    expect(params.get("entityType")).toBe("Tenant");
    expect(params.get("page")).toBe("2");
    expect(params.has("viewId")).toBe(false);
    expect(params.has("sortBy")).toBe(false);
  });

  it("drops empty values instead of sending an empty filter", () => {
    const query = buildAuditTrailQueryString({ action: "", search: undefined });
    expect(query).toBe("");
  });

  it("takes the first value of a repeated param", () => {
    const query = buildAuditTrailQueryString({ action: ["A", "B"] });
    expect(new URLSearchParams(query).get("action")).toBe("A");
  });
});

describe("diffAuditSnapshotFields", () => {
  it("reports only the fields that changed", () => {
    const diffs = diffAuditSnapshotFields(
      { name: "Old Co", plan: "starter", ownerId: "u-1" },
      { name: "New Co", plan: "starter", ownerId: "u-1" },
    );

    expect(diffs).toEqual([
      { field: "name", before: "Old Co", after: "New Co" },
    ]);
  });

  it("includes a field added or removed between snapshots, with the missing side as undefined", () => {
    const diffs = diffAuditSnapshotFields(
      { name: "Old Co" },
      { name: "Old Co", status: "ACTIVE" },
    );

    expect(diffs).toEqual([
      { field: "status", before: undefined, after: "ACTIVE" },
    ]);
  });

  it("returns nothing for two identical snapshots", () => {
    const snapshot = { name: "Same Co", count: 3 };
    expect(diffAuditSnapshotFields(snapshot, { ...snapshot })).toEqual([]);
  });

  it("returns nothing when both snapshots are absent", () => {
    expect(diffAuditSnapshotFields(null, null)).toEqual([]);
    expect(diffAuditSnapshotFields(undefined, undefined)).toEqual([]);
  });

  it("falls back to a single whole-value diff when a snapshot is not field-shaped", () => {
    // A bulk action's afterSnapshot ({ ids, count }) has no matching
    // beforeSnapshot to diff field by field.
    const diffs = diffAuditSnapshotFields(null, { ids: ["a", "b"], count: 2 });

    expect(diffs).toEqual([
      { field: "value", before: null, after: { ids: ["a", "b"], count: 2 } },
    ]);
  });

  it("sorts changed fields alphabetically for a stable render order", () => {
    const diffs = diffAuditSnapshotFields(
      { zebra: 1, apple: 1 },
      { zebra: 2, apple: 2 },
    );

    expect(diffs.map((diff) => diff.field)).toEqual(["apple", "zebra"]);
  });
});
