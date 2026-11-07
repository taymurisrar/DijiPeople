import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * DP-QA-006. AccessDeniedState defaulted `actionHref` to "". `Button` treats a
 * falsy href as "not a link" and renders a native <button href="">: a dead
 * "Back to dashboard" and, in development, React's "empty string was passed to
 * the href attribute" error on every screen that shows the state (it surfaced
 * on /my-profile). Production builds never print it, which is why QA's
 * production-build runs could not reproduce it. Source-level: web jest has no DOM.
 */
describe("AccessDeniedState default action", () => {
  const source = readFileSync(
    join(__dirname, "access-denied-state.tsx"),
    "utf8",
  );

  it("links somewhere by default", () => {
    expect(source).toMatch(/actionHref\s*=\s*"\/"/);
    expect(source).not.toMatch(/actionHref\s*=\s*""/);
  });
});
