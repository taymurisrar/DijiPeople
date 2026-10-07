import {
  buildDependencyDeleteModel,
  describeDependencyCount,
} from "./dependency-delete-model";
import type {
  RecordDependency,
  RecordDependencyReport,
} from "./platform-runtime.types";

/*
 * EXECPLAN-0055 D5 — the delete dialog shows what blocks the delete before the
 * operator confirms, and never offers a Confirm that the API would answer with
 * "Nothing was deleted".
 */

const dep = (
  key: string,
  policy: RecordDependency["policy"],
  count = 1,
): RecordDependency => ({
  key,
  label: key,
  count,
  policy,
  reason: `${key} reason`,
  href: `/partners/p1?tab=${key}`,
});

const report = (
  ...dependencies: RecordDependency[]
): RecordDependencyReport => ({
  canDelete: !dependencies.some(
    (item) =>
      item.count > 0 && (item.policy === "BLOCKS" || item.policy === "RETAIN"),
  ),
  dependencies,
});

describe("dependency-aware delete model", () => {
  it("is loading, with Confirm disabled, until every check has answered", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A" },
      { id: "b", label: "B", report: report() },
    ]);
    expect(model.status).toBe("loading");
    expect(model.canConfirm).toBe(false);
  });

  it("falls back to the plain confirmation for a module with no provider", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", report: null },
    ]);
    expect(model.status).toBe("unsupported");
    expect(model.canConfirm).toBe(true);
  });

  it("groups blocking, cascading and detaching dependencies", () => {
    const model = buildDependencyDeleteModel([
      {
        id: "a",
        label: "A",
        report: report(
          dep("referralLinks", "BLOCKS", 2),
          dep("attributedCustomers", "RETAIN"),
          dep("timeline", "CASCADE", 4),
          dep("notes", "DETACH"),
        ),
      },
    ]);
    const [record] = model.records;
    expect(record?.blocking.map((item) => item.key)).toEqual([
      "referralLinks",
      "attributedCustomers",
    ]);
    expect(record?.cascading.map((item) => item.key)).toEqual(["timeline"]);
    expect(record?.detaching.map((item) => item.key)).toEqual(["notes"]);
  });

  it("disables Confirm for a single blocked record and says why", () => {
    const model = buildDependencyDeleteModel([
      {
        id: "a",
        label: "A",
        report: report(dep("attributedTenants", "RETAIN")),
      },
    ]);
    expect(model.canConfirm).toBe(false);
    expect(model.disabledReason).toMatch(/blocking records/);
  });

  it("enables Confirm when only cascading records remain", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", report: report(dep("timeline", "CASCADE", 3)) },
    ]);
    expect(model.canConfirm).toBe(true);
    expect(model.deletableCount).toBe(1);
  });

  it("enables Confirm for a selection while at least one record can go", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", report: report() },
      { id: "b", label: "B", report: report(dep("commissions", "BLOCKS")) },
    ]);
    expect(model.canConfirm).toBe(true);
    expect(model.deletableCount).toBe(1);
    expect(model.blockedCount).toBe(1);
  });

  it("disables Confirm when every selected record is blocked", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", report: report(dep("agreements", "BLOCKS")) },
      { id: "b", label: "B", report: report(dep("commissions", "BLOCKS")) },
    ]);
    expect(model.canConfirm).toBe(false);
  });

  it("trusts the server's canDelete over rows it does not recognise", () => {
    const model = buildDependencyDeleteModel([
      {
        id: "a",
        label: "A",
        report: { canDelete: false, dependencies: [] },
      },
    ]);
    expect(model.records[0]?.blocked).toBe(true);
    expect(model.canConfirm).toBe(false);
  });

  it("keeps Confirm disabled when a check failed — no information is not no dependencies", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", error: "Network down" },
    ]);
    expect(model.canConfirm).toBe(false);
    expect(model.errors).toEqual([
      { id: "a", label: "A", message: "Network down" },
    ]);
  });

  it("ignores zero-count dependencies", () => {
    const model = buildDependencyDeleteModel([
      { id: "a", label: "A", report: report(dep("agreements", "BLOCKS", 0)) },
    ]);
    expect(model.records[0]?.blocking).toEqual([]);
    expect(model.canConfirm).toBe(true);
  });

  it("phrases a count line", () => {
    expect(
      describeDependencyCount({
        ...dep("x", "BLOCKS", 2),
        label: "Referral links",
      }),
    ).toBe("2 referral links");
  });

  it("prints the API's pluralised count label over the lowercased plural", () => {
    // The browser pass read "1 portal users" for one contact.
    expect(
      describeDependencyCount({
        ...dep("contacts", "CASCADE", 1),
        label: "Contacts",
        countLabel: "1 contact",
      }),
    ).toBe("1 contact");
    expect(
      describeDependencyCount({
        ...dep("portalUsers", "BLOCKS", 2),
        label: "Contacts with portal access",
        countLabel: "2 contacts with portal access",
      }),
    ).toBe("2 contacts with portal access");
  });
});
