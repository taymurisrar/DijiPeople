import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * DP-QA-041 - at 412px the settings content column was 0px wide because the
 * 260px sidebar and the content shared one flex row at every width. Source-level
 * guard (no jsdom here); the measured behaviour is covered by the Playwright
 * `mobile` project.
 */
function source(relativePath: string) {
  return readFileSync(join(__dirname, "../../..", relativePath), "utf8");
}

describe("DP-QA-041 settings layout is stacked on phones", () => {
  const layout = source("app/components/settings/settings-layout.tsx");
  const shell = source("app/(authenticated)/settings/_components/settings-shell.tsx");

  it("is a column below md and a row from md up", () => {
    expect(layout).toMatch(/flex-col[^"]*md:flex-row/);
  });

  it("gives the sidebar the full width on phones, not a fixed rail", () => {
    expect(layout).toContain("w-full");
    expect(shell).toContain("w-full md:w-[260px]");
    expect(shell).not.toMatch(/"w-\[260px\]"/);
  });
});
