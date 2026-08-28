import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeDestructiveConfirm,
  recordDisplayName,
} from "./destructive-confirm";

/**
 * BUG-1560 and BUG-1756 — destructive dialogs that did not say what they
 * destroyed.
 *
 * The single-record dialog did not name the record. The bulk dialog said
 * "Delete selected records?" with no count and no names, and the list showed no
 * selection count either — so nothing anywhere on screen told the operator
 * whether they were deleting one row or every row on the page.
 */
describe("BUG-1560 — a single delete names the record", () => {
  it("puts the record's name in the title", () => {
    const copy = describeDestructiveConfirm({
      labels: ["Acme Partners"],
      count: 1,
      singular: "Partner",
      plural: "Partners",
    });
    expect(copy.title).toBe("Delete Acme Partners?");
    expect(copy.description).toContain("cannot be undone");
  });

  it("says which kind of record it is", () => {
    const copy = describeDestructiveConfirm({
      labels: ["Q3 renewal"],
      count: 1,
      singular: "Lead",
      plural: "Leads",
    });
    expect(copy.description).toContain("lead");
  });
});

describe("BUG-1756 — a bulk delete counts and names", () => {
  it("states the count", () => {
    const copy = describeDestructiveConfirm({
      labels: ["A", "B", "C"],
      count: 3,
      singular: "Partner",
      plural: "Partners",
    });
    expect(copy.title).toBe("Delete 3 partners?");
    expect(copy.names).toEqual(["A", "B", "C"]);
  });

  it("uses the singular when exactly one is selected", () => {
    const copy = describeDestructiveConfirm({
      labels: [],
      count: 1,
      singular: "Partner",
      plural: "Partners",
    });
    expect(copy.title).toBe("Delete 1 partner?");
  });

  it("names the first few and counts the rest", () => {
    /*
     * Forty names turn the dialog into a wall nobody reads, which fails the
     * same way naming none does. Past five the count carries the weight.
     */
    const copy = describeDestructiveConfirm({
      labels: ["A", "B", "C", "D", "E", "F", "G"],
      count: 40,
      singular: "Lead",
      plural: "Leads",
    });
    expect(copy.title).toBe("Delete 40 leads?");
    expect(copy.names).toHaveLength(5);
    expect(copy.description).toContain("35 more");
  });

  it("counts a selection whose names are unknown", () => {
    const copy = describeDestructiveConfirm({
      count: 12,
      singular: "Invoice",
      plural: "Invoices",
    });
    expect(copy.title).toBe("Delete 12 invoices?");
    expect(copy.names).toEqual([]);
  });

  it("falls back to the action's own wording when there is nothing to name", () => {
    const copy = describeDestructiveConfirm({
      count: 0,
      singular: "Lead",
      plural: "Leads",
      fallbackTitle: "Archive this view?",
      fallbackDescription: "The view will be hidden.",
    });
    expect(copy.title).toBe("Archive this view?");
    expect(copy.description).toBe("The view will be hidden.");
  });
});

describe("naming a record from whatever the row carries", () => {
  it.each([
    [{ displayName: "Acme" }, "Acme"],
    [{ name: "Acme" }, "Acme"],
    [{ companyName: "Acme Ltd" }, "Acme Ltd"],
    [{ fullName: "Aisha Rahman" }, "Aisha Rahman"],
    [{ title: "Renewal" }, "Renewal"],
    [{ invoiceNumber: "INV-004" }, "INV-004"],
  ])("reads %p", (record, expected) => {
    expect(recordDisplayName(record)).toBe(expected);
  });

  it("prefers the most specific name available", () => {
    expect(recordDisplayName({ id: "abc", name: "Acme" })).toBe("Acme");
  });

  it("falls back to the id rather than to nothing", () => {
    // A poor name, and still better than asking somebody to confirm deleting
    // "a record".
    expect(recordDisplayName({ id: "abc-123" })).toBe("abc-123");
  });

  it("returns null when there is genuinely nothing", () => {
    expect(recordDisplayName(undefined)).toBeNull();
    expect(recordDisplayName({})).toBeNull();
    expect(recordDisplayName({ name: "   " })).toBeNull();
  });
});

describe("the dialog and the list actually use it", () => {
  const componentDir = join(__dirname, "../../app/_components/runtime");

  it("the action bar renders the composed copy, not the static strings", () => {
    const bar = readFileSync(join(componentDir, "module-action-bar.tsx"), "utf8");
    expect(bar).toContain("describeDestructiveConfirm(");
    expect(bar).toContain("{confirmCopy.title}");
    expect(bar).toContain("{confirmCopy.description}");
    // The old wording must not remain as a second source of truth.
    expect(bar).not.toContain('{confirmAction.confirmTitle ?? "Confirm action"}');
  });

  it("the list shows the selection before the dialog opens", () => {
    const list = readFileSync(
      join(componentDir, "runtime-module-list.tsx"),
      "utf8",
    );
    expect(list).toContain("selectedLabels");
    expect(list).toContain("selected of");
  });
});
