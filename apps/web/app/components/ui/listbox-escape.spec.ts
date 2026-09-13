import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeListboxOnEscape } from "./form-control";

/*
 * BUG-3495 — pressing Escape in an open dropdown inside a dialog closed the
 * whole dialog and discarded what had been typed.
 *
 * `apps/web` jest has no jsdom, so the ordering that fixes it is asserted on the
 * source: the dialog listens on `document` in the capture phase, and an open
 * listbox listens on `window` in the capture phase, which the browser runs first.
 * If either side moves, the listbox no longer gets Escape before the dialog.
 * The decision itself is a plain function and is tested as one.
 */
function stripComments(source: string) {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FORM_CONTROL = stripComments(
  readFileSync(join(__dirname, "form-control.tsx"), "utf8"),
);
const DIALOG = stripComments(readFileSync(join(__dirname, "dialog.tsx"), "utf8"));

function keyEvent(key: string) {
  return {
    key,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  };
}

describe("closeListboxOnEscape", () => {
  it("closes the listbox and stops Escape from reaching the dialog", () => {
    const event = keyEvent("Escape");
    const close = jest.fn();

    expect(closeListboxOnEscape(event, close)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("leaves every other key alone", () => {
    const event = keyEvent("ArrowDown");
    const close = jest.fn();

    expect(closeListboxOnEscape(event, close)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("Escape ordering between a listbox and its dialog", () => {
  it("registers the dialog's Escape on document, capture phase", () => {
    expect(DIALOG).toMatch(
      /document\.addEventListener\("keydown", handleKeyDown, true\)/,
    );
  });

  it("registers an open listbox's Escape on window, capture phase, which runs first", () => {
    expect(FORM_CONTROL).toMatch(
      /window\.addEventListener\("keydown", handleKeyDown, true\)/,
    );
  });

  it("wires both comboboxes to it", () => {
    const calls = FORM_CONTROL.match(/useListboxEscape\(isOpen, /g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it("names both comboboxes from their visible label", () => {
    const named = FORM_CONTROL.match(/aria-labelledby=\{labelId\}/g) ?? [];
    expect(named).toHaveLength(2);
  });

  it("renders a hint once, not also as a tooltip", () => {
    expect(FORM_CONTROL).not.toMatch(/aria-label=\{`\$\{label\} help`\}/);
  });
});
