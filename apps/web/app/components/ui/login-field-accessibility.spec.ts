import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOGIN_FORM = join(__dirname, "../../(public)/login/login-form.tsx");
const FORM_CONTROL = join(__dirname, "form-control.tsx");
const ADMIN_LOGIN = join(
  __dirname,
  "../../../../admin/app/login/login-form.tsx",
);

/**
 * BUG-1655 — the tenant login's password field had no accessible name and no
 * autocomplete, while the email field beside it had both.
 *
 * The visible "Password" text sits in a heading row alongside the "Forgot
 * password?" link, and the shared control's own label span is suppressed with
 * `[&>span]:hidden` so the two line up. That layout decision left the input
 * with no name at all: a screen reader announced it as unlabelled, and password
 * managers were not told what it was.
 */
describe("BUG-1655 — the tenant login names its password field", () => {
  const form = readFileSync(LOGIN_FORM, "utf8");

  it("gives the hidden-label control an accessible name", () => {
    expect(form).toContain('ariaLabel="Password"');
  });

  it("tells a password manager what the field is", () => {
    expect(form).toContain('autoComplete="current-password"');
  });

  it("pairs the identifier field with it", () => {
    /*
     * `username`, not `email`. Both are valid tokens; only `username` pairs
     * with `current-password` as a credential set, which is what makes a
     * password manager offer to fill both at once.
     */
    expect(form).toContain('autoComplete="username"');
  });

  it("still hides the duplicate label rather than showing two", () => {
    // The fix is a name for assistive technology, not a second visible label.
    expect(form).toContain("[&>span]:hidden");
  });
});

describe("the shared control can carry both", () => {
  const control = readFileSync(FORM_CONTROL, "utf8");

  it("accepts an accessible name and an autocomplete token", () => {
    expect(control).toContain("autoComplete?: string;");
    expect(control).toContain("ariaLabel?: string;");
  });

  it("applies them to the input rather than dropping them", () => {
    // Scoped to TextField's own body: declaring a prop and never rendering it
    // is the failure this guards against, and the file holds other fields.
    const textField = control.slice(
      control.indexOf("export function TextField("),
      control.indexOf("export function NumberField("),
    );
    expect(textField.length).toBeGreaterThan(200);
    expect(textField).toContain("aria-label={ariaLabel}");
    expect(textField).toContain("autoComplete={autoComplete}");
  });
});

/**
 * The record asked for the admin login to be checked for the same divergence,
 * on the reasoning that the two forms were probably written from one starting
 * point. They were not: the admin form binds both labels with `htmlFor` and
 * already declares `current-password`.
 *
 * Asserted rather than merely noted, because "we checked and it was fine" is
 * worth exactly as much as the thing that keeps it fine.
 */
describe("BUG-1655 — the admin login was already correct", () => {
  const form = readFileSync(ADMIN_LOGIN, "utf8");

  it("binds both labels to their inputs", () => {
    expect(form).toContain('htmlFor="admin-email"');
    expect(form).toContain('htmlFor="admin-password"');
  });

  it("declares the password autocomplete", () => {
    expect(form).toContain('autoComplete="current-password"');
  });
});
