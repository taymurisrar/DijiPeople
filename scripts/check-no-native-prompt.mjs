#!/usr/bin/env node
/**
 * INVARIANT — governed input is not collected with `window.prompt`.
 *
 * A native prompt is unstyled, unlabelled beyond a single string, unvalidated,
 * impossible to cancel meaningfully, rendered outside the app's theme, and
 * untestable. That is tolerable for a throwaway convenience; it is not tolerable
 * when the value becomes part of an audited business record — a lead
 * disqualification reason, a contract moved backward, a payroll reversal — which
 * someone reads later when deciding whether a decision was sound (BUG-0020).
 *
 * The apps already have the right mechanism: `PanelDialog` with `DialogField`,
 * focus-trapped and escapable, reached from a plain module through the
 * `useReasonPrompt` hook. Nothing failed when a call site skipped it, so this
 * check exists to fail instead.
 *
 * The allowlist is now empty, and that is the point of it. BUG-0020 fixed the
 * two worst instances and this check counted the other six by name rather than
 * implying them by silence; ITEM-0031 replaced all six. `window.prompt` no
 * longer appears in any of the three apps.
 *
 * The map stays because the next exemption should have to be argued for in
 * review, and because a stale entry fails this check — so an exemption cannot
 * outlive its justification.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];
const CALL = /\b(window\.)?prompt\s*\(/;

/**
 * Known remaining call sites, each with what it collects.
 *
 * Tracked as [[ITEM-0031]]. An entry here is a debt with a name, not an
 * exemption: adding a new one should be argued for in review.
 */
const ALLOWLIST = new Map([
  // Empty. Every call site BUG-0020 left behind was replaced under ITEM-0031:
  // the payroll reversal reason and date, the payment failure reason, the
  // application rejection reason, the attendance exception note, the bulk
  // status change (now a select over the module's own statuses, not free text)
  // and the saved-filter name.
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
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const offenders = [];
const seen = new Set();
let scanned = 0;

for (const app of APPS) {
  for (const file of walk(join(ROOT, "apps", app))) {
    scanned += 1;
    const source = readFileSync(file, "utf8");
    // Skip comment lines: a doc comment explaining the ban is not a violation.
    const offending = source
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .some((line) => CALL.test(line));
    if (!offending) continue;

    const rel = relative(ROOT, file).split(sep).join("/");
    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(rel);
  }
}

if (scanned < 100) {
  console.error(
    `check-no-native-prompt: only ${scanned} files scanned — the walk is wrong.\n` +
      "A check that examines nothing passes for the wrong reason.",
  );
  process.exit(1);
}

const stale = [...ALLOWLIST.keys()].filter((entry) => !seen.has(entry));
if (stale.length > 0) {
  console.error(
    "check-no-native-prompt: the allowlist names call sites that no longer use a\n" +
      "native prompt. Remove them — a stale entry hides the next real one:\n",
  );
  for (const entry of stale) console.error(`  ${entry}`);
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(
    `check-no-native-prompt: ${offenders.length} file(s) collect input with a native prompt.\n` +
      "Use the design system dialog instead — `useReasonPrompt` for a governed\n" +
      "reason, or `PanelDialog` directly. See BUG-0020.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-no-native-prompt: ${scanned} files scanned, no native prompts` +
    (ALLOWLIST.size > 0 ? ` (${ALLOWLIST.size} allowed).` : "."),
);
