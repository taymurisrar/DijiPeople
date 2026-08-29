/*
 * Route integrity.
 *
 * BUG-2004 — the approvals module emitted a `system.new` command for a module
 * with no `new` page, so `/approvals/new` fell through to
 * `approvals/[approvalId]` with the literal id "new" and threw.
 * BUG-2014 — `/users/new` and `/users/import` did the same thing under
 * `users/[userId]`, one link from the command bar and one from the empty state.
 *
 * Both records asked for this test by name. It is pure logic over the runtime
 * specs and the directory tree; it needs no jsdom and no running app.
 */
import fs from "node:fs";
import path from "node:path";

import { resolveAppRoute, WEB_APP_DIR } from "./app-route-table";
import * as standardSpecs from "../runtime/modules/standard-module-specs";
import * as payrollSpecs from "../runtime/modules/payroll-foundation-runtime-specs";
import type { StandardModuleRuntimeSpec } from "../runtime/modules/standard-module-runtime";

function allRuntimeSpecs(): readonly StandardModuleRuntimeSpec[] {
  const modules: Record<string, unknown>[] = [
    standardSpecs as unknown as Record<string, unknown>,
    payrollSpecs as unknown as Record<string, unknown>,
  ];

  return modules.flatMap((moduleExports) =>
    Object.entries(moduleExports)
      .filter(([name]) => name.endsWith("RuntimeSpec"))
      .map(([, value]) => value as StandardModuleRuntimeSpec)
      .filter(
        (spec) => typeof spec?.routeBase === "string" && spec.routeBase !== "",
      ),
  );
}

/*
 * `/settings/**` is served by the settings runtime's
 * `[category]/[settingGroup]/[item]` tree, where the dynamic segments name a
 * metadata registry rather than record ids. A settings path that names nothing
 * in that registry is caught by `getSettingsRuntimeItem` returning `notFound()`
 * — a real not-found state, not a fetch for a record with a literal id — so
 * dynamic resolution there is deliberate rather than accidental.
 */
function isSettingsRuntimePath(routePath: string) {
  return routePath === "/settings" || routePath.startsWith("/settings/");
}

describe("standard runtime modules do not offer a create action without a create page", () => {
  const specs = allRuntimeSpecs();

  it("finds the runtime specs to check", () => {
    expect(specs.length).toBeGreaterThan(10);
  });

  it.each(specs.map((spec) => [spec.routeBase, spec] as const))(
    "%s",
    (routeBase, spec) => {
      if (spec.adapterCapabilities?.disableCreate === true) return;
      if (isSettingsRuntimePath(routeBase)) return;

      const resolution = resolveAppRoute(`${routeBase}/new`);

      /*
       * Either the module has a real create page, or it must declare
       * `adapterCapabilities.disableCreate`. Resolving through a sibling
       * `[param]` route is the failure this test exists for: that is what
       * `/approvals/new` did, and it is why it crashed.
       */
      expect({
        routeBase,
        matched: resolution.matched,
        finalSegmentDynamic: resolution.finalSegmentDynamic,
      }).toEqual({
        routeBase,
        matched: true,
        finalSegmentDynamic: false,
      });
    },
  );
});

describe("no literal internal link resolves only through a sibling [param] route", () => {
  /*
   * Three shapes of literal internal link: an `href`-ish property or JSX
   * attribute, a `router.push` / `redirect` call, and a named route constant
   * (`USER_CREATE_ROUTE = "/…"`), which is how the users screens hold theirs.
   * Template literals are deliberately not matched — a path built around a
   * record id is not the mistake this test looks for.
   */
  const linkPattern = new RegExp(
    [
      String.raw`(?:href|actionHref|routeTo|redirectTo)\s*[:=]\s*"(\/[^"$\s{}]*)"`,
      String.raw`(?:router\.(?:push|replace)|redirect)\(\s*"(\/[^"$\s{}]*)"`,
      String.raw`\b[A-Za-z0-9_]*(?:ROUTE|Route|HREF|Href)\s*=\s*"(\/[^"$\s{}]*)"`,
    ].join("|"),
    "g",
  );

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") return [];
        return sourceFiles(full);
      }
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".spec.ts")
        ? [full]
        : [];
    });
  }

  const links = new Map<string, string[]>();

  for (const file of sourceFiles(WEB_APP_DIR)) {
    /* `app/api/**` are route handlers proxying the backend, not page links. */
    const relative = path.relative(WEB_APP_DIR, file).split(path.sep).join("/");
    if (relative.startsWith("api/")) continue;

    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(linkPattern)) {
      const routePath = match[1] ?? match[2] ?? match[3];
      if (!routePath) continue;
      /* Backend paths handed to the proxy, and non-page assets. */
      if (routePath.startsWith("/api/")) continue;
      if (isSettingsRuntimePath(routePath)) continue;
      if (/\.[a-z0-9]{2,4}$/i.test(routePath)) continue;

      links.set(routePath, [...(links.get(routePath) ?? []), relative]);
    }
  }

  it("finds literal links to check", () => {
    expect(links.size).toBeGreaterThan(10);
  });

  it("every literal link reaches a page without a [param] eating its last segment", () => {
    const broken: { route: string; files: string[]; reason: string }[] = [];

    for (const [routePath, files] of links) {
      const resolution = resolveAppRoute(routePath);
      if (!resolution.matched) {
        broken.push({ route: routePath, files, reason: "no page" });
        continue;
      }
      if (resolution.finalSegmentDynamic) {
        broken.push({
          route: routePath,
          files,
          reason: `matched by ${resolution.pageDir}`,
        });
      }
    }

    expect(broken).toEqual([]);
  });
});
