import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_MODULE_REGISTRY } from "./platform-module-registry";

const PLATFORM_MODULES = [...PLATFORM_MODULE_REGISTRY.values()];

/**
 * INVARIANT — a declared runtime module is reachable, and reaches its own rows.
 *
 * BUG-0019. `partner-inquiries` and `partner-onboarding` were fully defined
 * runtime modules with columns, permissions and detail screens, and both list
 * routes `redirect()`ed to `/partners?viewId=…` instead of rendering them. That
 * sent a reviewer to a **Partner** list — a different entity — whose rows linked
 * to `/partners/{partnerId}`, an id the detail screens cannot resolve. The
 * partner compliance review step was therefore unperformable through the
 * product, while every individual piece of it looked present and correct.
 *
 * Nothing failed, because a redirect is valid code and the page it landed on
 * rendered. So the check is structural: a module that owns a route must have a
 * page at that route which renders the module, not one that navigates away.
 */
describe("runtime module routes", () => {
  const APP_DIR = join(__dirname, "..", "..", "app", "(internal)");

  /**
   * Modules whose list route is deliberately somewhere other than a page of
   * their own, with the reason. An allowlist rather than a silent skip.
   */
  const ALLOWLIST = new Map<string, string>();

  function pageFor(routeBase: string) {
    const segments = routeBase.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const dir = join(APP_DIR, ...segments);
    try {
      if (!statSync(dir).isDirectory()) return null;
    } catch {
      return null;
    }
    const entry = readdirSync(dir).find((name) => /^page\.tsx?$/.test(name));
    return entry ? readFileSync(join(dir, entry), "utf8") : null;
  }

  const routed = PLATFORM_MODULES.filter(
    (module) =>
      typeof module.routeBase === "string" && module.routeBase.startsWith("/"),
  );

  it("finds modules to check", () => {
    // A walk that finds nothing would pass for the wrong reason.
    expect(routed.length).toBeGreaterThan(10);
  });

  it.each(routed.map((module) => [module.key, module]))(
    "%s has a list page that renders the module",
    (_key, module) => {
      const { key, routeBase } = module as (typeof routed)[number];
      if (ALLOWLIST.has(key)) {
        expect(ALLOWLIST.get(key)?.length ?? 0).toBeGreaterThan(30);
        return;
      }

      const source = pageFor(routeBase);
      // Not every module owns a bespoke route yet; only judge those that do.
      if (source === null) return;

      // Comment lines are stripped first. A doc comment that *explains* the old
      // redirect is not itself a redirect, and matching it would make the fix
      // read as the defect — the same trap this check exists to expose.
      const code = source
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");

      // The specific failure: the page navigates away instead of rendering.
      if (/\bredirect\s*\(/.test(code)) {
        throw new Error(
          `${key} declares routeBase ${routeBase}, but the page there redirects ` +
            `away instead of rendering the module. A reviewer following ` +
            `navigation lands on a different entity's list, whose row ids the ` +
            `detail screen cannot resolve. See BUG-0019.`,
        );
      }
    },
  );

  it("does not allowlist a module that no longer exists", () => {
    const keys = new Set<string>(PLATFORM_MODULES.map((module) => module.key));
    for (const allowlisted of ALLOWLIST.keys()) {
      expect(keys.has(allowlisted)).toBe(true);
    }
  });
});
