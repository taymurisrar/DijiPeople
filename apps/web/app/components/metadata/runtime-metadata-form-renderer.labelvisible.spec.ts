import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-3412 — `section.labelVisible` was honoured in exactly one of this
 * file's several section-heading branches. The other two rendered `<h4>`
 * unconditionally (or guarded only on `section.label` being present), so a
 * section whose only content was a self-titling widget still showed its name
 * twice.
 *
 * This repo's own knowledge base flags the exact failure mode a fix here can
 * fall into: a `replace(..., 1)`-style edit landing on the wrong one of two
 * near-identical lines, passing both tests and typecheck because the edit is
 * syntactically fine — just aimed at the wrong branch. `apps/web`'s jest has
 * no jsdom (see `jest.config.js`), so this reads the source directly rather
 * than rendering, and counts occurrences rather than trusting a single
 * substring match to land in the right place.
 */
describe("runtime-metadata form renderer — labelVisible", () => {
  const source = readFileSync(
    join(__dirname, "runtime-metadata-form-renderer.tsx"),
    "utf8",
  );

  it("honours labelVisible in all three section-heading branches, not just one", () => {
    // Was exactly one occurrence before this fix (the `CustomizationFormRenderer`
    // branch, a different form type entirely) — the other two, belonging to
    // the renderer that actually serves entity record pages, ignored it.
    const occurrences = source.split("section.labelVisible !== false").length - 1;
    expect(occurrences).toBe(3);
  });

  it("keeps the custom-content branch's guard against an empty label", () => {
    // That branch's section type allows a falsy label in a way the other
    // branch's does not; losing this guard would print an empty heading
    // rather than fix BUG-3412.
    expect(source).toContain("section.labelVisible !== false && section.label");
  });

  it("wraps every section <h4> in a labelVisible check, not just the custom one", () => {
    // Each of the two entity-record-page branches wraps its own <h4> in a
    // `{section.labelVisible !== false ... ? ( <h4> ... ) : null}` ternary —
    // guarded, then closed with `) : null}` before the next section-level
    // JSX. Splitting on the guard and requiring each remainder to still
    // contain its own closing `) : null}` before the block ends is what a
    // `replace(..., 1)`-on-the-wrong-line edit (this repo's own recorded
    // failure mode) would break: the edit still compiles and the occurrence
    // count above can still pass while one <h4> stays unconditional.
    const guardedBlocks = source
      .split("labelVisible !== false")
      .slice(1, 3); // the two entity-record branches, not the CustomizationFormRenderer one
    for (const block of guardedBlocks) {
      expect(block.slice(0, 200)).toContain(") : null}");
    }
  });
});
