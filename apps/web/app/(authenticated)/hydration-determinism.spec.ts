/**
 * BUG-4441. Twelve production rows are React #418 (hydration mismatch) on
 * settings, profile and approval pages. The one nondeterminism found there was
 * argument-less locale formatting — `toLocaleDateString()` and
 * `toLocaleString(undefined, ...)` — which renders with the server's locale and
 * zone on the first pass and the browser's on the second.
 *
 * This reads the source on purpose: the failure needs a server and a browser
 * with different locales to show, which no unit environment has. It fails the
 * moment such a call returns to these directories.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["settings", "profile", "my-profile", "my-preferences", "approvals"];
const BANNED = /toLocale(Date|Time)?String\((undefined)?[,)]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe("hydration determinism (BUG-4441)", () => {
  it("renders no locale- or zone-dependent text from the host default", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const dir = path.join(__dirname, root);
      try {
        statSync(dir);
      } catch {
        continue;
      }
      for (const file of walk(dir)) {
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .forEach((line, i) => {
            if (BANNED.test(line)) offenders.push(`${file}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
