#!/usr/bin/env node
/**
 * INVARIANT — a modal contains focus, closes with Escape, and says it is one.
 *
 * BUG-0043. `apps/web/AGENTS.md` required focus-trapped, Escape-dismissible,
 * announced dialogs, and a hand-rolled dialog was already "a review failure".
 * The rule was unfulfillable: `app/components/ui/` had `button`,
 * `empty-state`, `form-control`, `section-card` and `status-pill`, and no
 * dialog. So all 21 modal surfaces in the app were bespoke
 * `<div className="fixed inset-0">`, no `<dialog>` element existed anywhere,
 * `focus-trap` was not a dependency, and Tab walked out of every one of them.
 *
 * Prose does not survive twenty-one authors. This does: every modal overlay
 * must obtain its behaviour from the shared primitive — either by rendering
 * `<Dialog>`, or by spreading `useDialogBehavior()` onto its own panel.
 *
 * A modal overlay is recognised the way one is actually written here: a
 * `fixed inset-0` container that is **not** `pointer-events-none`. That
 * exclusion is the difference between a dialog and a busy veil — the refresh
 * overlay covers the screen, activates nothing, and is correctly not a dialog.
 *
 * Sibling checks: `check-proxies-decide-nothing.mjs` (BUG-0041),
 * `check-proxies-forward-refusals.mjs` (BUG-0039).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_ROOTS = [["apps", "web", "app"]];

/** The primitive itself, which is where the behaviour is implemented. */
const PRIMITIVE = "apps/web/app/components/ui/dialog.tsx";

const MODAL_OVERLAY = /fixed inset-0/;
const NOT_A_DIALOG = /pointer-events-none/;
const USES_PRIMITIVE = /\buseDialogBehavior\b|<Dialog\b/;

/**
 * Overlays that are deliberately not dialogs, each with the reason. A stale
 * entry fails the check, so an exemption cannot outlive its justification.
 */
const ALLOWLIST = new Map([
  [
    "apps/web/app/components/runtime/module-refresh-overlay.tsx",
    "pointer-events-none busy veil with role=status; nothing to activate, nothing to contain.",
  ],
]);

function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (/\.tsx$/.test(entry)) found.push(full);
  }
  return found;
}

const offenders = [];
const seen = new Set();
let scanned = 0;
let overlays = 0;

for (const parts of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, ...parts))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel === PRIMITIVE) continue;
    scanned += 1;

    const source = readFileSync(file, "utf8")
      .split(/\r?\n/)
      // A comment describing the overlay that was replaced is not an overlay.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");

    if (!MODAL_OVERLAY.test(source)) continue;
    overlays += 1;

    if (NOT_A_DIALOG.test(source)) {
      seen.add(rel);
      continue;
    }
    if (USES_PRIMITIVE.test(source)) continue;

    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(rel);
  }
}

if (scanned < 100) {
  console.error(
    `check-dialogs-are-contained: only ${scanned} components scanned — the walk is wrong.`,
  );
  process.exit(1);
}

for (const entry of ALLOWLIST.keys()) {
  if (!seen.has(entry)) {
    console.error(`check-dialogs-are-contained: stale allowlist entry: ${entry}`);
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-dialogs-are-contained: ${offenders.length} modal overlay(s) do not use\n` +
      "the shared dialog primitive. A modal must contain Tab, close on Escape,\n" +
      "restore focus on close and be announced as a dialog. Render <Dialog>, or\n" +
      "spread useDialogBehavior() onto the panel to keep a bespoke layout.\n" +
      "See apps/web/app/components/ui/dialog.tsx and BUG-0043.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-dialogs-are-contained: ${overlays} modal overlay(s) across ${scanned} components, all contained.`,
);
