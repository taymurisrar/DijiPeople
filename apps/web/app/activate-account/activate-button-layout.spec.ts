import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * DP-QA-032: the "Passwords match." line used to be inserted only after the
 * confirmation field blurred, i.e. on mousedown over the submit button. The
 * button moved before mouseup and the click never fired. The line must stay in
 * the layout from the first render. Source-level because web jest has no DOM.
 */
describe("activate-account submit button layout", () => {
  const source = readFileSync(
    join(__dirname, "activate-account-form.tsx"),
    "utf8",
  );

  it("always renders the match status line with reserved height", () => {
    expect(source).toMatch(/<p className="min-h-5 [^"]*" role="status">/);
  });

  it("does not mount the match line conditionally", () => {
    expect(source).not.toMatch(/liveComparison\.ok\s*\?\s*\(\s*<p/);
  });
});
