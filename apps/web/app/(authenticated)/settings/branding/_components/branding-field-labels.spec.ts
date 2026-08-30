import { BRANDING_COLOR_KEYS, BRANDING_TEXT_KEYS } from "@/lib/branding";
import {
  resolveColorFieldLabel,
  resolveTextFieldLabel,
} from "./branding-settings-form";

/**
 * BUG-2009 (surface 1) — six of sixteen colour tokens and four of thirteen
 * text fields on `/settings/branding` fell through to their raw camelCase
 * key: `mutedTextColor`, `sidebarActiveBackgroundColor`, `supportEmail`, and
 * so on, on a page a customer configures during onboarding.
 *
 * This is the "add a check that no rendered label equals its own field key"
 * half of the record's Proposed Resolution — walking every declared key
 * rather than asserting the six or four the QA run happened to observe, so a
 * seventeenth colour token added later without a label fails this test
 * instead of shipping unlabelled.
 */
describe("branding field labels — BUG-2009", () => {
  it("labels every declared colour token, never with its own key", () => {
    for (const key of BRANDING_COLOR_KEYS) {
      const label = resolveColorFieldLabel(key);
      expect(label).not.toBe(key);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("labels every declared text field, never with its own key", () => {
    for (const key of BRANDING_TEXT_KEYS) {
      const label = resolveTextFieldLabel(key);
      expect(label).not.toBe(key);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("gets the six previously-unlabelled colour tokens right specifically", () => {
    expect(resolveColorFieldLabel("mutedTextColor")).toBe("Muted text color");
    expect(resolveColorFieldLabel("borderColor")).toBe("Border color");
    expect(resolveColorFieldLabel("sidebarBackgroundColor")).toBe(
      "Sidebar background color",
    );
    expect(resolveColorFieldLabel("sidebarTextColor")).toBe(
      "Sidebar text color",
    );
    expect(resolveColorFieldLabel("sidebarActiveBackgroundColor")).toBe(
      "Sidebar active background color",
    );
    expect(resolveColorFieldLabel("sidebarActiveTextColor")).toBe(
      "Sidebar active text color",
    );
  });

  it("gets the four previously-unlabelled text fields right specifically", () => {
    expect(resolveTextFieldLabel("supportEmail")).toBe("Support email");
    expect(resolveTextFieldLabel("supportPhone")).toBe("Support phone");
    expect(resolveTextFieldLabel("privacyPolicyUrl")).toBe(
      "Privacy policy URL",
    );
    expect(resolveTextFieldLabel("termsOfUseUrl")).toBe("Terms of use URL");
  });

  it("humanises a hypothetical undeclared key rather than repeating it", () => {
    // BRANDING_COLOR_KEYS is a readonly tuple; cast to exercise the fallback
    // as if a new token had been added to the schema without a label.
    expect(
      resolveColorFieldLabel("futureAccentGlowColor" as never),
    ).toBe("Future accent glow color");
  });
});
