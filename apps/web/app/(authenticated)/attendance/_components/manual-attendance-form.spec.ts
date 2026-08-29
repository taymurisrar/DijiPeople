import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-2006 — a successful `POST /api/attendance/manual` returned 201 and the
 * page stayed exactly as it looked mid-submit: no toast, no inline
 * confirmation. The form was already cleared on success (`setForm(initialForm)`);
 * only the outcome was never reported, so a user who pressed Save again got a
 * 409 as the first feedback the flow gave them.
 *
 * `apps/web` has no jsdom (`jest.config.js` is `testEnvironment: "node"`), so
 * this cannot render the form and click Save. It asserts over the source
 * instead: that the success branch calls the shared toast hook and that the
 * toast element is actually rendered, not just constructed and discarded.
 */
function source() {
  return readFileSync(join(__dirname, "manual-attendance-form.tsx"), "utf8");
}

describe("BUG-2006 — manual attendance reports a successful save", () => {
  it("uses the shared side-toast hook rather than a bespoke one", () => {
    const code = source();
    expect(code).toContain(
      'import { useSideToast } from "@/app/components/notifications"',
    );
    expect(code).toContain("useSideToast()");
  });

  it("calls notifySuccess on the 201 branch, before the form is cleared", () => {
    const code = source();
    const successBranch = code.slice(
      code.indexOf("if (!response.ok)"),
      code.indexOf("setForm(initialForm);") + "setForm(initialForm);".length,
    );
    expect(successBranch).toContain("notifySuccess(");
    // The confirmation must be issued before or alongside the reset, not
    // after the component has already moved on — same branch, same tick.
    expect(successBranch.indexOf("notifySuccess(")).toBeLessThan(
      successBranch.indexOf("setForm(initialForm)"),
    );
  });

  it("renders the toast element returned by the hook", () => {
    const code = source();
    expect(code).toMatch(/\{toast\}/);
  });
});
