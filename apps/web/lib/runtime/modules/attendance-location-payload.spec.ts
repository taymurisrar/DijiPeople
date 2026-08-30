import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-2333 — the attendance check-in path ignored the `storeUserAgent` setting.
 *
 * `storeUserAgent` is a tenant privacy control. Two capture paths exist and only
 * one honoured it: `module-runtime-command-handler.tsx` gated on the policy,
 * while this adapter — the path the attendance module's own Check In button
 * uses — attached `navigator.userAgent` unconditionally. Confirmed on a live
 * tenant whose policy reported `storeUserAgent: false` and whose check-in
 * transmitted the full UA string anyway.
 *
 * This is a source-level assertion, following the pattern this app already uses
 * where the behaviour lives inside a closure that no unit test can reach:
 * `buildAttendanceLocationPayload` is a module-private function invoked from a
 * command handler that needs a full runtime context to construct.
 *
 * Comments are stripped before matching. The fix's own comment names
 * `storeUserAgent` while explaining the bug, and without stripping this test
 * would pass against the reverted code on the strength of the prose alone —
 * the exact vacuous-pass trap `label-call-sites.spec.ts` documents.
 */

const ADAPTER = join(__dirname, "standard-module-data.adapter.ts");

function sourceWithoutComments(): string {
  const raw = readFileSync(ADAPTER, "utf8");

  return (
    raw
      // Block comments first, so a `//` inside one cannot survive as code.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Line comments. `[^\r\n]` rather than `[^\n]`: working trees here are
      // CRLF, and a \n-only class leaves the \r behind, which has silently
      // broken source-reading assertions in this repository before.
      .replace(/\/\/[^\r\n]*/g, "")
  );
}

describe("attendance location payload respects tenant privacy settings", () => {
  it("reads the adapter source at all", () => {
    // Guards the test: a moved or renamed file would otherwise make every
    // assertion below vacuous rather than failing loudly.
    const source = sourceWithoutComments();

    expect(source).toContain("buildAttendanceLocationPayload");
    expect(source).toContain("buildLocationPayload");
  });

  it("gates the user agent on the storeUserAgent policy", () => {
    const source = sourceWithoutComments();

    expect(source).toMatch(/storeUserAgent/);
  });

  it("never attaches the user agent unconditionally", () => {
    const source = sourceWithoutComments();

    /*
     * The shipped defect, verbatim in shape: a `userAgent` whose only guard is
     * whether `navigator` exists. Matching the ternary rather than the bare
     * identifier keeps this specific — `navigator.userAgent` is legitimate on
     * the guarded branch, so its mere presence proves nothing.
     */
    expect(source).not.toMatch(
      /userAgent:\s*typeof\s+navigator\s*===\s*"undefined"\s*\?\s*undefined\s*:\s*navigator\.userAgent/,
    );
  });
});
