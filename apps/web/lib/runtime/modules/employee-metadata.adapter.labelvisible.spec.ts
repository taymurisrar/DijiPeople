import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapEmployeeForms } from "./employee-metadata.adapter";

/*
 * BUG-3412 — three sections on the employee record printed their heading
 * twice: the metadata section heading, then the self-titling widget's own
 * heading directly beneath it. The profile pair disagreed outright ("Profile
 * Image" from the section, "PROFILE PHOTO" from the widget).
 *
 * `runtime-metadata-form-renderer.tsx` now honours `section.labelVisible` in
 * both branches that render a section heading (previously only one branch,
 * belonging to a different form type, did). This is the other half: the
 * sections whose only content is a self-titling system widget need
 * `labelVisible: false` set on them, or the renderer fix has nothing to read.
 * A regression here — someone adding a field back to one of these sections
 * without re-checking the flag, or a rename drifting the two names apart
 * again — would otherwise only show up as a visual defect on a live record
 * page, which is exactly how this one was found.
 */
describe("employee form sections with a self-titling widget", () => {
  const [mainForm] = mapEmployeeForms([]).filter(
    (form) => form.formType === "main",
  );
  const sectionsById = new Map(
    (mainForm?.sections ?? []).map((section) => [section.id, section]),
  );

  it.each([
    ["profile-image", "Profile Photo"],
    ["timeline", "Timeline"],
    ["reporting-hierarchy", "Reporting Hierarchy"],
    ["agent-desktop", "Agent Desktop"],
  ])("suppresses the section heading for %s", (sectionId, expectedLabel) => {
    const section = sectionsById.get(sectionId);
    expect(section).toBeDefined();
    expect(section?.labelVisible).toBe(false);
    // The label is kept (the form designer and search still need a name for
    // the section) — only whether the renderer draws it changes.
    expect(section?.label).toBe(expectedLabel);
  });

  it("does not touch labelVisible on a section that has no self-titling widget", () => {
    const basicInformation = sectionsById.get("basic-information");
    expect(basicInformation).toBeDefined();
    expect(basicInformation?.labelVisible).not.toBe(false);
  });

  it("gives the profile control one name, not two", () => {
    // The widget's own heading lives in runtime-profile-image-card.tsx and is
    // not reachable from this module-logic test (apps/web's jest has no
    // jsdom — see jest.config.js), so the fact both now read "Profile Photo"
    // is asserted at the source-text level instead of by rendering.
    const widgetSource = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "app",
        "components",
        "runtime",
        "runtime-profile-image-card.tsx",
      ),
      "utf8",
    );

    expect(sectionsById.get("profile-image")?.label).toBe("Profile Photo");
    expect(widgetSource).toContain("Profile Photo");
    expect(widgetSource).not.toContain("Profile Image");
  });
});
