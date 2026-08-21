import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listPlatformModuleDefinitions } from "./platform-module-registry";

/**
 * The registry's `capabilities` map is a restatement of what
 * `PlatformRuntimeService` implements, and `define()` builds the default
 * command bar from it — so a module the API cannot update must not offer Edit,
 * and one it can must not be left with only a Back button.
 *
 * A hand-maintained copy of another file's control flow goes stale silently,
 * so this spec re-derives the three sets from the service source rather than
 * pinning a second copy of them here. Remove a `case` from the API and this
 * fails, which is the point: without it, deleting the plans update branch
 * would leave a Save button in the product that returns 400.
 *
 * Deliberately textual. The alternative is booting a Nest module with fifteen
 * injected services to observe which keys throw `BadRequestException`, which
 * tests the mocks more than the mapping.
 */
const SERVICE_PATH = join(
  __dirname,
  "../../../../services/api/src/modules/platform-runtime/platform-runtime.service.ts",
);

describe("platform module capabilities", () => {
  const source = readFileSync(SERVICE_PATH, "utf8");

  it("reads the service source it is asserting against", () => {
    // Without this the regexes below could match nothing and every set would
    // agree with an empty expectation.
    expect(source).toContain("export class PlatformRuntimeService");
    expect(methodBody(source, "create")).toContain("switch (key)");
    expect(methodBody(source, "update")).toContain("switch (key)");
    expect(methodBody(source, "remove")).toContain("switch (key)");
  });

  it.each([
    ["create", "create"],
    ["update", "update"],
    ["remove", "delete"],
  ] as const)(
    "declares %s for exactly the modules the runtime API implements",
    (method, capability) => {
      const implemented = switchCases(methodBody(source, method));
      expect(implemented.length).toBeGreaterThan(0);
      const declared = listPlatformModuleDefinitions()
        .filter((definition) => definition.capabilities[capability])
        .map((definition) => definition.key)
        .sort();
      expect(declared).toEqual([...implemented].sort());
    },
  );

  it("never offers a record command the module has no capability for", () => {
    for (const definition of listPlatformModuleDefinitions()) {
      const keys = new Set(
        definition.actions
          .filter((action) => action.scope === "record")
          .map((action) => String(action.key)),
      );
      if (!definition.capabilities.update) {
        expect([definition.key, keys.has("edit")]).toEqual([
          definition.key,
          false,
        ]);
      }
      if (!definition.capabilities.delete) {
        expect([definition.key, keys.has("delete")]).toEqual([
          definition.key,
          false,
        ]);
      }
    }
  });

  it("gives every module's record page Back and Refresh", () => {
    for (const definition of listPlatformModuleDefinitions()) {
      if (definition.key === "dashboard") continue;
      const keys = definition.actions
        .filter((action) => action.scope === "record")
        .map((action) => String(action.key));
      expect([definition.key, keys.includes("back")]).toEqual([
        definition.key,
        true,
      ]);
      expect([definition.key, keys.includes("record-refresh")]).toEqual([
        definition.key,
        true,
      ]);
    }
  });

  it("puts the standard commands in the same order on every module", () => {
    const canonical = [
      "back",
      "record-new",
      "edit",
      "save",
      "save-close",
      "record-refresh",
      "delete",
    ];
    for (const definition of listPlatformModuleDefinitions()) {
      const present = definition.actions
        .filter((action) => action.scope === "record")
        .map((action) => String(action.key))
        .filter((key) => canonical.includes(key));
      expect([definition.key, present]).toEqual([
        definition.key,
        canonical.filter((key) => present.includes(key)),
      ]);
    }
  });
});

/** The body of `async <name>(`, bounded by the next class member. */
function methodBody(source: string, name: string) {
  const start = source.indexOf(`  async ${name}(`);
  if (start === -1) throw new Error(`PlatformRuntimeService.${name} not found`);
  const rest = source.slice(start + 4);
  const next = rest.search(/\n {2}(?:async |private |get |[a-zA-Z]+\()/);
  return next === -1 ? rest : rest.slice(0, next);
}

function switchCases(body: string) {
  return [...body.matchAll(/case '([a-z-]+)':/g)].map((match) => match[1]!);
}
