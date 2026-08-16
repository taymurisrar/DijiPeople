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
 * The allowlist is the honest part. Several call sites outside the reported
 * scope of BUG-0020 still use a native prompt; each is named here with what it
 * collects, so the remaining work is visible and counted rather than implied by
 * silence.
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
  [
    "apps/admin/app/_components/documents/contract-document-editor.tsx",
    "Link URL inside the rich-text editor — an editing convenience, not a governed record field.",
  ],
  [
    "apps/admin/app/_components/runtime/runtime-module-list.tsx",
    "Bulk status change and saved-filter name. The status change IS governed and is tracked in ITEM-0031.",
  ],
  [
    "apps/web/app/(authenticated)/attendance/exceptions/_components/attendance-exceptions-table.tsx",
    "Attendance exception note — governed, tracked in ITEM-0031.",
  ],
  [
    "apps/web/app/(authenticated)/payroll/runs/[runId]/_components/payroll-payments-workspace.tsx",
    "Payment failure reason — governed and financial, tracked in ITEM-0031.",
  ],
  [
    "apps/web/app/(authenticated)/payroll/runs/[runId]/_components/payroll-run-actions.tsx",
    "Payroll reversal reason and date — governed and financial, tracked in ITEM-0031.",
  ],
  [
    "apps/web/app/(authenticated)/recruitment/_components/recruitment-applications-board.tsx",
    "Application rejection reason — governed, tracked in ITEM-0031.",
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
  `check-no-native-prompt: ${scanned} files scanned, ` +
    `${ALLOWLIST.size} known call site(s) still tracked in ITEM-0031.`,
);
