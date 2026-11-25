import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * A SectionCard is a grid/flex item on most screens. Without min-w-0 it takes
 * the min-content width of what it holds, so a wide table inside it widened the
 * whole page (My evidence at 768px scrolled sideways to 1064px) instead of
 * scrolling inside its own container. Reads the source: the apps/web jest
 * environment has no DOM.
 */
describe("SectionCard", () => {
  it("can shrink below its content", () => {
    const source = readFileSync(join(__dirname, "section-card.tsx"), "utf8");
    expect(source).toMatch(/<section className="min-w-0 /);
  });
});
