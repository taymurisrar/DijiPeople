import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM = join(
  __dirname,
  "../../app/_components/runtime/runtime-form.tsx",
);

/**
 * BUG-1423 — the shared runtime form drew labels that labelled nothing.
 *
 * Each field's label was a `<span>` with no connection to its control: the text
 * was visible, so the form looked correct, and axe-core found 28 unlabelled
 * controls across four create screens on production. `/plans/new` and
 * `/templates/new` — bespoke forms rather than runtime ones — were clean, which
 * is what identified this component as the cause.
 *
 * A structural assertion, and deliberately so. The defect is *the absence of an
 * association* across every control this component can render, and a rendering
 * test would cover whichever control types it happened to instantiate. What
 * matters is that no return path renders a bare control.
 */
describe("BUG-1423 — runtime form controls are labelled", () => {
  const source = readFileSync(FORM, "utf8");

  it("renders a real label bound to a real id", () => {
    expect(source).toContain("const controlId = `field-${field.key}`");
    expect(source).toContain("<label htmlFor={controlId}");
    // The label carries an id of its own so composite controls can point back
    // at it with aria-labelledby.
    expect(source).toContain("id={`${controlId}-label`}");
  });

  it("no longer draws the label as a bare span", () => {
    const wrapper = source.slice(
      source.indexOf("data-field-key={field.key}"),
      source.indexOf("function FieldControl("),
    );
    expect(wrapper).not.toMatch(
      /<span className="block min-h-4">\s*\{field\.label\}/,
    );
  });

  it("carries a name as well as an id, so autofill works", () => {
    /*
     * Two different jobs: `id` binds the label, `name` is what a password
     * manager and browser autofill read. Neither was present, so the fields
     * were both unlabelled and un-autofillable — the second looked like a
     * product decision and was a missing attribute.
     */
    expect(source).toMatch(/id: controlId,\s*\n\s*name: field\.key,/);
  });

  it("points the control at its error text", () => {
    expect(source).toContain('"aria-describedby": errorId');
    expect(source).toContain('"aria-invalid": errorId ? true : undefined');
    expect(source).toContain('role="alert"');
  });

  it("does not rely on the asterisk alone to say a field is required", () => {
    // Colour and a glyph are not an accessible name for "required".
    expect(source).toContain('<span className="sr-only"> (required)</span>');
    expect(source).toMatch(/className="ml-1 text-rose-600" aria-hidden="true"/);
  });

  it("gives composite controls a label they can point at", () => {
    // A select that renders a button and a listbox cannot be the target of
    // htmlFor, so it names itself from the label element instead.
    expect(source).toContain(
      "aria-label={labelledBy ? undefined : ariaLabel}",
    );
    expect(source).toContain("aria-labelledby={labelledBy}");
  });

  it("applies the attributes to every control it can render", () => {
    /*
     * The count is the point. Each `{...a11y}` is one return path in
     * `FieldControl`; a new control type added without it is a new unlabelled
     * field, which is exactly how twenty-eight of them accumulated.
     */
    const control = source.slice(source.indexOf("function FieldControl("));
    const applications = control.match(/\{\.\.\.a11y\}/g) ?? [];
    expect(applications.length).toBeGreaterThanOrEqual(5);
  });
});
