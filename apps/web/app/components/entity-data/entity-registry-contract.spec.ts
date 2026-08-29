/*
 * The generic entity-data API is a contract between two workspaces, and until
 * BUG-2003 nothing checked that the two ends agreed.
 *
 * `/users` asked `buildEntityDataUrl` for the logical entity `users`. The API's
 * `ENTITY_REGISTRY` has only ever held `employees`, so `GET /data/users` 404'd
 * before a single row was read, the throw was uncaught inside an async Server
 * Component, and the page was replaced by the error boundary — for every
 * tenant, with no data of any shape able to change the outcome. It compiled and
 * type-checked perfectly: `entityLogicalName` is a `string`.
 *
 * This test is the guard the record asked for. It reads the registry from the
 * API source rather than importing it, because `apps/web` does not depend on
 * `services/api` and must not start.
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const ENTITY_REGISTRY_FILE = path.join(
  REPO_ROOT,
  "services",
  "api",
  "src",
  "modules",
  "data",
  "entity-registry.ts",
);

/** Every entity `ENTITY_REGISTRY` declares, by the `logicalName` it carries. */
function registeredEntityNames(): ReadonlySet<string> {
  const source = fs.readFileSync(ENTITY_REGISTRY_FILE, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(
    /logicalName:\s*['"]([A-Za-z0-9_-]+)['"]/g,
  )) {
    names.add(match[1]);
  }
  return names;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "e2e"
      ) {
        return [];
      }
      return sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".spec.ts")
      ? [full]
      : [];
  });
}

/** Every `buildEntityDataUrl({ entityLogicalName: "…" })` call site in the app. */
function entityDataCallSites(): { entity: string; file: string }[] {
  const callSitePattern =
    /buildEntityDataUrl\(\s*\{[\s\S]{0,600}?entityLogicalName:\s*["']([^"']+)["']/g;

  return ["app", "lib"].flatMap((topLevel) =>
    sourceFiles(path.join(WEB_ROOT, topLevel)).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [...source.matchAll(callSitePattern)].map((match) => ({
        entity: match[1],
        file: path.relative(WEB_ROOT, file).split(path.sep).join("/"),
      }));
    }),
  );
}

describe("entity-data call sites name entities the API registry holds", () => {
  const registered = registeredEntityNames();
  const callSites = entityDataCallSites();

  it("reads the API entity registry", () => {
    /*
     * If this ever reads zero entities the parse has broken, and every
     * assertion below would pass for the wrong reason.
     */
    expect(registered.size).toBeGreaterThan(0);
    expect(registered.has("employees")).toBe(true);
  });

  it("finds the call sites to check", () => {
    expect(callSites.length).toBeGreaterThan(0);
  });

  it("every call site names a registered entity", () => {
    const unregistered = callSites.filter(
      (callSite) => !registered.has(callSite.entity),
    );

    expect(unregistered).toEqual([]);
  });
});
