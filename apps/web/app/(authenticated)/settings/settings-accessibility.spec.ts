import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-1986 — an axe audit of `/settings/organization` returned four violations
 * at critical or serious impact, which is the threshold the browser suite gates
 * on. The selectors were Tailwind utility strings, so the first work was
 * identifying the components; these assertions pin what was found, so the next
 * reader does not have to repeat that.
 *
 * Source-reading, because `apps/web` runs jest in the node environment with no
 * jsdom. The axe run itself lives in the browser suite.
 */
const NAV = readFileSync(
  join(__dirname, "_components/settings-runtime-nav.tsx"),
  "utf8",
);
const SHELL = readFileSync(
  join(__dirname, "_components/settings-shell.tsx"),
  "utf8",
);
const DATA_TABLE = readFileSync(
  join(__dirname, "../../components/data-table/data-table.tsx"),
  "utf8",
);

describe("BUG-1986 — button-name: the five unnamed settings buttons", () => {
  it("names the category toggle, whose only child is an icon", () => {
    expect(NAV).toContain(
      'aria-label={`${categoryOpen ? "Collapse" : "Expand"} ${category.label}`}',
    );
  });

  it("hides the chevrons, so the name is the label and not the glyph", () => {
    const chevrons = NAV.match(/<Chevron(?:Down|Right) /g) ?? [];
    const hidden = NAV.match(/<Chevron(?:Down|Right) aria-hidden /g) ?? [];
    expect(hidden.length).toBe(chevrons.length);
  });
});

describe("BUG-1986 — color-contrast: the current-page indicator", () => {
  it("no longer pairs the accent colour with a tint of itself", () => {
    // `--accent-soft` is the tenant primary mixed into white and `--accent` is
    // that same primary, so no tenant palette could pass the threshold.
    expect(NAV).not.toContain("bg-accent-soft font-semibold text-accent");
    expect(NAV).toContain("bg-accent-soft font-semibold text-foreground");
  });

  it("still marks the current page programmatically", () => {
    expect(NAV).toContain('aria-current={active ? "page" : undefined}');
  });
});

describe("BUG-1986 — the one node carrying two violations", () => {
  /*
   * `aria-allowed-attr` and `nested-interactive` were reported on the same
   * `.cursor-pointer` element. Both came from `role="button"` on a clickable
   * table row: a button may not contain focusable children, and `aria-selected`
   * is not among the attributes `button` supports.
   */
  it("does not give a clickable row a widget role", () => {
    expect(DATA_TABLE).not.toContain('role={onRowClick ? "button" : undefined}');
  });

  it("keeps the keyboard access that role was added for", () => {
    expect(DATA_TABLE).toContain("tabIndex={onRowClick ? 0 : undefined}");
    expect(DATA_TABLE).toContain("onKeyDown={");
  });

  it("keeps aria-selected, which a row does support", () => {
    expect(DATA_TABLE).toContain(
      "aria-selected={enableSelection ? isSelected : undefined}",
    );
  });
});

describe("BUG-1986 — one complementary landmark per settings screen", () => {
  it("does not nest an aside inside the one SettingsLayout supplies", () => {
    expect(SHELL).not.toContain("<aside");
  });
});
