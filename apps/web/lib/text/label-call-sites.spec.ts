import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-1964 and BUG-2009 — the call sites, not the helpers.
 *
 * `inflection.spec.ts` proves `singularize` and `humanizeFieldKey` are correct.
 * That is not the same as proving they are used: the defect was never a wrong
 * helper, it was a `label.replace(/s$/, "")` written inline and a `??` chain
 * ending at a database column name. A helper nobody calls fixes nothing, so
 * these assertions are over the places that used to derive a display string by
 * hand.
 */
const WEB = join(__dirname, "../..");

/*
 * Comments are stripped. Each of these fixes carries a comment quoting the
 * expression it replaced — which is the point of the comment and would
 * otherwise make every "no longer contains" assertion fail against the fix and
 * pass against the defect.
 */
function source(relativePath: string) {
  return readFileSync(join(WEB, relativePath), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BUG-1964 — no label is singularised by deleting a character", () => {
  const registry = source(
    "app/(authenticated)/settings/_lib/settings-adapter-registry.ts",
  );

  it("does not strip a trailing s from a settings label", () => {
    // The literal that produced "LEAVE POLICIE" on a record header.
    expect(registry).not.toContain('input.label.replace(/s$/, "")');
    expect(registry).toContain("singularize(input.label)");
  });

  it("still prefers a declared singular over a derived one", () => {
    // Irregular labels are declared, not guessed at; the derivation is only a
    // floor under the ones nobody declared.
    expect(registry).toContain("input.singular ?? singularize(input.label)");
  });
});

describe("BUG-1964 — a dialog that creates one record is titled in the singular", () => {
  const subgrid = source("app/components/runtime/module-related-subgrid.tsx");

  it("singularises the related-list quick-create titles", () => {
    // These were `New ${subgrid.title}` and `New ${metadata.logicalName}` —
    // "New Entitlements", "New Assignments", "New leave_entitlements".
    expect(subgrid).not.toContain("displayName: `New ${subgrid.title}`");
    expect(subgrid).toContain("displayName: `New ${singularize(subgrid.title)}`");
    expect(subgrid).toContain("displayName: `New ${singularize(entityLabel)}`");
  });

  it("reads the same helper the record header reads", () => {
    /*
     * The record header and the dialog title were two mechanisms — one
     * singularising badly, the other not at all — which is how they disagreed
     * about the same entity on the same screen.
     */
    expect(subgrid).toContain('from "@/lib/text/inflection"');
  });
});

describe("BUG-2009 — a related list does not head a column with a column name", () => {
  const subgrid = source("app/components/runtime/module-related-subgrid.tsx");

  it("humanises the field key rather than printing it", () => {
    // The Attendance tab on an employee record was headed `attendanceDate`,
    // `attendanceStatus`, `checkInAt`, `checkOutAt`, while the standalone
    // /attendance list over the same data was headed properly.
    expect(subgrid).not.toContain(
      "header: column.label ?? field?.displayName ?? column.fieldLogicalName",
    );
    expect(subgrid).toContain("humanizeFieldKey(column.fieldLogicalName)");
  });

  it("keeps the declared label and the entity's display name ahead of it", () => {
    const header = subgrid.slice(
      subgrid.indexOf("header:"),
      subgrid.indexOf("humanizeFieldKey(column.fieldLogicalName)"),
    );
    expect(header).toContain("column.label");
    expect(header).toContain("field?.displayName");
  });
});
