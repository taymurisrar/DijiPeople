import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-1960 — "the departments table overflows its settings panel by 111px at
 * 1440px". Investigated against this branch's source (the exact commit the
 * record cites, `eb457d9d`, and current HEAD) and does not reproduce: every
 * layer between the settings panel and the table already carries the
 * `min-w-0` / `overflow-x-auto` pattern the record's own Proposed Resolution
 * asked for — `min-w-0` alone on a grid item is not enough (a grid item's
 * default `min-width` is `auto`, i.e. its content's size, regardless of the
 * track), which is why this walks every level rather than trusting one.
 *
 * No code was changed for this record. This spec is a guard, not a fix: it
 * pins the containment chain so a future edit that drops one of these
 * classes fails here instead of reintroducing this exact overflow silently.
 * `apps/web` has no jsdom and no browser was available to this task, so this
 * is a source-level assertion — the same limitation and the same precedent
 * (`label-call-sites.spec.ts`) the rest of this session's layout work uses.
 */
function source(relativePath: string) {
  const root = join(__dirname, "../../..");
  return readFileSync(join(root, relativePath), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BUG-1960 — the settings panel constrains its column track, not just min-w-0", () => {
  it("SettingsLayout sizes its content column with minmax(0, 1fr), not a bare grid", () => {
    const code = source("app/components/settings/settings-layout.tsx");
    // A bare `grid` column defaults to `auto`: it sizes to its widest child
    // and refuses to shrink, which is what let the departments table push
    // past its panel. `min-w-0` on the grid container does not fix this —
    // the constraint has to be on the column track itself.
    expect(code).toContain("grid-cols-[minmax(0,1fr)]");
  });
});

describe("BUG-1960 — every layer between the panel and the table stays out of a grid/flex item's way", () => {
  it("ModulePageLayout keeps min-w-0 on its content wrapper", () => {
    const code = source("app/components/runtime/module-page-layout.tsx");
    // A grid or flex item's default min-width is `auto` (its content's size)
    // regardless of the track/basis constraint above it — this is the class
    // of bug `minmax(0,1fr)` alone does not close, one level down.
    expect(code).toContain('<div className="relative z-0 min-w-0">{children}</div>');
  });

  it("the shared DataTable still refuses to grow past its container", () => {
    const code = source("app/components/data-table/data-table.tsx");
    expect(code).toContain('"w-full min-w-0"');
    expect(code).toMatch(/w-full min-w-0 overflow-x-auto/);
  });
});
