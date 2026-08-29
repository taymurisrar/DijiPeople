import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-1668 — the tenant workspace scrolled horizontally at mobile width.
 * Re-measured on a populated tenant (2026-08-29), the record found three
 * separable causes; this covers the two this task changed code for.
 *
 * `apps/web` has no jsdom and no browser tooling is available to this task
 * (see the record's own note that a fix here is "reasoned, not visually
 * verified"), so — matching the precedent this app already uses for defects
 * jsdom cannot reach (`label-call-sites.spec.ts`) — this asserts over the
 * source: the specific classes the fix depends on are present, and the
 * specific unconstrained patterns that produced the measured overflow are
 * gone.
 */
/*
 * Comments are stripped, matching `label-call-sites.spec.ts`: several of
 * these assertions quote the code they replaced or explain the fix in a
 * comment right beside it, which would otherwise make a `.toContain`
 * assertion pass against the comment even with the code reverted.
 */
function source(relativePath: string) {
  const root = join(__dirname, "../../..");
  return readFileSync(join(root, relativePath), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BUG-1668 — the sidebar no longer sizes itself from unwrapped label text", () => {
  const code = source(
    "app/(authenticated)/_components/dashboard-sidebar.tsx",
  );

  it("gives the <aside> a fixed width below xl instead of none at all", () => {
    // The literal absence of any width class below `xl` is what let content
    // (217px of unwrapped label text, measured on a populated tenant) set
    // the element's width instead.
    expect(code).toContain("w-16");
    expect(code).toContain("shrink-0");
  });

  it("hides the nav-item label visually rather than reserving space it cannot fill at the rail width", () => {
    expect(code).toContain("sr-only min-w-0 flex-1 xl:not-sr-only");
  });

  it("still expands to the full label at xl, where the collapse control becomes reachable", () => {
    // The full-label desktop rendering is not removed, only made
    // breakpoint-conditional; xl:w-[280px]/xl:w-[76px] and the collapse
    // toggle logic are unchanged by this fix.
    expect(code).toContain("xl:w-[76px]");
    expect(code).toContain("xl:w-[280px]");
  });

  it("reduces the compact brand card so it fits the narrower rail instead of overflowing it", () => {
    // The full brand card (logo at h-10 w-10, plus two lines of text) does
    // not fit inside a 64px rail; only a smaller logo does.
    const compactBrand = code.slice(
      code.indexOf("function CompactBrand"),
      code.indexOf("function TenantCard"),
    );
    expect(compactBrand).not.toContain('sizeClassName="h-10 w-10"');
    expect(compactBrand).toContain('sizeClassName="h-8 w-8"');
    expect(compactBrand).not.toMatch(/effectiveBrandName\s*}\s*<\/p>/);
  });
});

describe("BUG-1668 — a payroll nav group can wrap instead of forcing one unbroken row", () => {
  const code = source(
    "app/(authenticated)/payroll/_components/payroll-nav.tsx",
  );

  it("no longer has the flex row that could not wrap while its parent could", () => {
    // The record's own diagnosis: the outer `<nav>` had `flex-wrap` and
    // could move a whole group onto its own line, but each group's own row
    // (six items in "Operations") had none, so wrapping the group did not
    // help once that group's own row was still wider than the viewport.
    expect(code).not.toContain(
      'className="flex items-center gap-1 rounded-xl bg-background p-1"',
    );
    expect(code).toContain("flex-wrap items-center gap-1");
  });
});

describe("BUG-1668 — the shared data table's resize handle is already contained (not reproduced)", () => {
  const code = source("app/components/data-table/data-table.tsx");

  it("keeps the resize handle positioned against its own <th>, inside the scrolling container", () => {
    // The record's own evidence already certified tables as correct at
    // 1440px ("the tables are not at fault"). The `/employees` overflow this
    // record attributed to the resize handle does not reproduce against this
    // source: the handle is `absolute` inside a `relative` <th>, and that
    // <th> sits inside a div with `overflow-x-auto` — the same containment
    // pattern the record's own 1440px measurement already trusted. No code
    // changed here; this is a verification, not a fix — see BUG-1668's
    // Resolution for why the sidebar (a cause the record's later
    // re-measurement identified as the dominant one) is the likelier
    // explanation for the /employees figures.
    expect(code).toContain("className={`relative px-3 py-2 text-xs font-medium");
    expect(code).toMatch(/overflow-x-auto/);
  });
});
