import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * A SelectField / LookupField menu is portalled to <body>, so inside a Dialog it
 * competes with the backdrop on z-index alone. At z-[80] against a z-[110]
 * backdrop the options rendered dimmed behind it and every click hit the
 * overlay (found by the Flow R browser journeys on New task > Priority). Reads
 * the source because the apps/web jest environment has no DOM.
 */
function zValues(file: string, pattern: RegExp): number[] {
  const source = readFileSync(join(__dirname, file), "utf8");
  return [...source.matchAll(pattern)].map((match) => Number(match[1]));
}

describe("popup menus stack above the dialog backdrop", () => {
  const backdrop = Math.max(...zValues("dialog.tsx", /fixed inset-0 z-\[(\d+)\]/g));

  it("finds the dialog backdrop layer", () => {
    expect(backdrop).toBeGreaterThan(0);
  });

  it("puts every portalled form menu above it", () => {
    const menus = zValues("form-control.tsx", /className="fixed z-\[(\d+)\] rounded-2xl/g);
    expect(menus.length).toBeGreaterThanOrEqual(2);
    for (const z of menus) expect(z).toBeGreaterThan(backdrop);
  });
});
