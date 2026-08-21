import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(
  __dirname,
  "..",
  "..",
  "app",
  "_components",
  "documents",
);
const templateEditor = readFileSync(
  join(COMPONENTS, "contract-template-editor.tsx"),
  "utf8",
);
const documentEditor = readFileSync(
  join(COMPONENTS, "contract-document-editor.tsx"),
  "utf8",
);

/**
 * "Preview sample data" must not be able to damage the template.
 *
 * The version this guards against implemented the preview as a *mode of the
 * editing document*: it substituted example values into the HTML, pushed the
 * result into the editor as its content, and kept the real template in a second
 * piece of state to restore on exit. Two consequences, one cosmetic and one
 * not:
 *
 *   - the preview rendered from `editor.getHTML()` read during render, so the
 *     first paint after each toggle showed the previous content — reported as
 *     "unstable";
 *   - the template survived only as long as the restore path ran, so saving
 *     while previewing wrote "Gulf Horizon" into the template in place of
 *     `{{customer.companyName}}`.
 *
 * `apps/admin` jest has no jsdom, so these are structural assertions over the
 * source rather than a render. That is a weaker check than driving the toggle,
 * and it is the strongest one available here — it pins the specific shapes that
 * caused both faults, each of which is a single edit away from returning.
 */
describe("template preview", () => {
  it("never feeds the substituted HTML back into the editor", () => {
    /*
     * The load-bearing assertion. `value` is what the editor holds and edits;
     * if the preview string is ever passed as `value`, the template is one
     * stray update away from being overwritten with resolved sample values.
     */
    expect(templateEditor).not.toMatch(/value=\{previewHtml\}/);
    expect(templateEditor).toMatch(/value=\{html\}/);
  });

  it("passes the preview as its own prop", () => {
    expect(templateEditor).toMatch(
      /previewHtml=\{samplePreview \? previewHtml : undefined\}/,
    );
  });

  it("keeps no copy of the template to restore afterwards", () => {
    /*
     * If turning a mode off requires restoring something, the mode is built
     * wrong. The state is gone rather than better managed — there is nothing
     * left for a missed code path to lose.
     */
    expect(templateEditor).not.toContain("editingHtmlBeforePreview");
  });

  it("renders the preview from the prop, not from the editor during render", () => {
    /*
     * `editor.getHTML()` is read while rendering; the effect that changes the
     * editor's content runs after. That one-commit gap is the flicker.
     */
    const article = documentEditor.slice(
      documentEditor.indexOf("dangerouslySetInnerHTML") - 400,
      documentEditor.indexOf("dangerouslySetInnerHTML") + 200,
    );
    expect(article).toContain("previewHtml ?? editor.getHTML()");
  });

  it("substitutes what the document renderer produces, not the raw example", () => {
    /*
     * `exampleValue` for a collection is a JSON string. Substituting it printed
     * `["Employees","Attendance","Payroll"]` in a preview whose entire purpose
     * is to show what the signed document will say. `exampleHtml` comes from
     * the API, produced by `renderContractPlaceholders` itself.
     */
    expect(templateEditor).toContain("exampleHtml");
    expect(templateEditor).toMatch(/item\.exampleHtml \?\? item\.exampleValue/);
  });

  it("is read-only while previewing", () => {
    // Editing a rendering of a document is editing nothing, and looks like
    // editing the document.
    expect(templateEditor).toMatch(/readOnly=\{samplePreview\}/);
  });
});
