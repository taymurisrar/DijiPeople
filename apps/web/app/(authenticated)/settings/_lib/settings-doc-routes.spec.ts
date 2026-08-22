import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { settingsRuntimeCategories } from "./settings-runtime";

/**
 * REG-220 — BUG-0045.
 *
 * `docs/architecture/settings-and-branding.md` is declared **canonical** by
 * `docs/README.md`: it "overrides other documents where they differ". Its
 * Settings Route Audit is an enumeration — the documentation form that ages
 * worst — and roughly twenty of its rows named URLs that no longer resolve. A
 * specialist consulting the authoritative contract was handed a route map that
 * was wrong, and told to trust it over the code.
 *
 * One row was not merely stale: `/settings/tenant` was quoted out of the
 * document and into `require-settings-permission.ts` as a live `fallbackHref`,
 * so a permission failure redirected the user to a 404.
 *
 * `settings-runtime.spec.ts` already asks the filesystem whether the
 * *runtime's* routes resolve. This asks the same question of the *document's*,
 * which turns the enumeration from a liability into a checked artifact.
 */

const DOC_PATH = join(
  __dirname,
  "..", "..", "..", "..", "..", "..",
  "docs",
  "architecture",
  "settings-and-branding.md",
);

/** The App Router directory that `/settings/...` routes live under. */
const SETTINGS_ROOT = join(__dirname, "..", "..", "..", "(authenticated)");

/**
 * Extract every `/settings/...` route the document *claims currently exists*.
 *
 * Two exclusions, both deliberate:
 *
 * - **Backticks only.** Prose that mentions a path without marking it as one is
 *   not a claim about routing, and treating it as one would make this noisy
 *   enough to be turned off.
 * - **Not inside a blockquote.** The document explains what it used to get
 *   wrong, and doing that means naming dead routes — `/settings/tenant` is
 *   quoted precisely because it 404s. A `>` line is history, not a claim, which
 *   is also how a route is "marked removed" here.
 */
function documentedSettingsRoutes(markdown: string): string[] {
  const claims = markdown
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");

  const found = new Set<string>();
  for (const match of claims.matchAll(/`(\/settings[^`]*)`/g)) {
    for (const route of match[1].split(/[,\s]+/)) {
      const trimmed = route.trim();
      if (trimmed.startsWith("/settings")) found.add(trimmed);
    }
  }
  return [...found].sort();
}

/**
 * Does this route resolve?
 *
 * A route resolves when the App Router can reach a `page.tsx` for it. Three
 * shapes need care:
 *
 * - **`:param` segments** are the document's notation for a dynamic segment.
 *   Any `[…]` directory at that position satisfies them, so the check stops at
 *   the segment before and asks only that the static prefix exists.
 * - **`*` and trailing `/*`** mean "and everything below". Same treatment.
 * - **A single-segment `/settings/<x>`** is the case the audit got wrong:
 *   `[category]/page.tsx` calls `getSettingsRuntimeCategory(x)` and `notFound()`s
 *   on a miss, so it resolves *only* for the eleven runtime categories — a
 *   directory of that name, or a category key.
 */
function routeResolves(route: string): boolean {
  const segments = route
    .replace(/^\//, "")
    .split("/")
    .filter((segment) => segment.length > 0);

  // Drop everything from the first dynamic, wildcard or placeholder segment
  // onward. `<key>` is how the prose refers to a segment generically, the same
  // way `:param` does in the tables.
  const staticIndex = segments.findIndex(
    (segment) =>
      segment.startsWith(":") ||
      segment.includes("*") ||
      segment.startsWith("<"),
  );
  const staticSegments =
    staticIndex === -1 ? segments : segments.slice(0, staticIndex);

  // `/settings` itself.
  if (staticSegments.length <= 1) {
    return existsSync(join(SETTINGS_ROOT, "settings", "page.tsx"));
  }

  const directory = join(SETTINGS_ROOT, ...staticSegments);

  // A purpose-built page, or a directory that continues to one.
  if (existsSync(join(directory, "page.tsx"))) return true;
  if (staticIndex !== -1 && existsSync(directory)) return true;

  // Otherwise `/settings/<x>` only resolves through `[category]`, and only for
  // a real category.
  if (staticSegments.length === 2) {
    return settingsRuntimeCategories.some(
      (category) => category.key === staticSegments[1],
    );
  }

  return false;
}

describe("the canonical settings document", () => {
  const markdown = readFileSync(DOC_PATH, "utf8");

  it("names routes at all, so this check is not passing over an empty list", () => {
    expect(documentedSettingsRoutes(markdown).length).toBeGreaterThan(20);
  });

  it("names only routes that resolve", () => {
    const broken = documentedSettingsRoutes(markdown).filter(
      (route) => !routeResolves(route),
    );

    expect(broken).toEqual([]);
  });

  it("states the number of categories the runtime actually has", () => {
    // The document claimed ten. `integrations` was added with its own
    // explanatory comment and the entire /settings/integrations/attendance tree
    // — thirteen pages — went undocumented.
    const stated = markdown.match(/(\w+)\s+canonical categories/i);
    expect(stated).not.toBeNull();
    expect(stated?.[1]).toBe("eleven");
    expect(settingsRuntimeCategories).toHaveLength(11);
  });

  it("describes every category the runtime defines", () => {
    const undocumented = settingsRuntimeCategories
      .map((category) => category.key)
      .filter((key) => !markdown.includes(`\`${key}\``));

    expect(undocumented).toEqual([]);
  });

  it("names only shared components that exist", () => {
    // The document named `Card`, `Badge`, `Tabs`, `Dialog` and `FormControl` as
    // the shared kit. None of the five existed, so it sent every specialist
    // looking for components that were never built.
    const uiDirectory = join(__dirname, "..", "..", "..", "components", "ui");
    const named = [...markdown.matchAll(/`app\/components\/ui\/([a-z-]+)\.tsx`/g)].map(
      (match) => match[1],
    );

    expect(named.length).toBeGreaterThan(0);
    const missing = named.filter(
      (name) => !existsSync(join(uiDirectory, `${name}.tsx`)),
    );
    expect(missing).toEqual([]);
  });
});
