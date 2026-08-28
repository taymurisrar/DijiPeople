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
    /*
     * Deletion is `deleteRecords`, not `remove`.
     *
     * `remove` and `bulkDelete` were two switch statements over the same
     * modules and they drifted — `leads` was in one and not the other, which
     * an operator met as a 400. They share one method now, so this spec reads
     * the one that decides, and one record and a selection cannot disagree.
     */
    expect(methodBody(source, "deleteRecords")).toContain("switch (key)");
  });

  it.each([
    ["create", "create"],
    ["update", "update"],
    ["deleteRecords", "delete"],
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
        /*
         * Delete may still *appear* without the capability — but only disabled
         * and only with a reason.
         *
         * The rule this replaces was "no capability, no command", which is the
         * safe default and, in practice, the worse one: an operator cannot tell
         * a missing feature from a deliberate refusal, so "there is no Delete
         * button on any module" was reported as a defect when most of those
         * fifteen modules hold invoices, payments, commissions, executed
         * agreements or a cascade onto a customer's whole workspace.
         *
         * What must never happen is an *enabled* command the API would refuse.
         * That is what this now asserts.
         */
        const deleteActions = definition.actions.filter(
          (action) => action.key === "delete" || action.key === "bulk-delete",
        );
        for (const action of deleteActions) {
          expect([
            definition.key,
            action.key,
            Boolean(action.disabledReason),
          ]).toEqual([definition.key, action.key, true]);
        }
      }
    }
  });

  it("explains every refusal, so no module is silently missing Delete", () => {
    /*
     * Every module is in exactly one of two states: it can delete, or it says
     * why it cannot. A module in neither renders no Delete and no explanation,
     * which is the state that was reported.
     */
    for (const definition of listPlatformModuleDefinitions()) {
      if (definition.key === "dashboard") continue;
      if (definition.capabilities.delete) continue;
      const refusal = definition.actions.find(
        (action) => action.key === "bulk-delete",
      )?.disabledReason;
      expect([definition.key, typeof refusal]).toEqual([
        definition.key,
        "string",
      ]);
      // A reason, not a shrug. "Not available" sends somebody to support.
      expect([definition.key, (refusal ?? "").length > 60]).toEqual([
        definition.key,
        true,
      ]);
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

/** The body of `async <name>(` — public or private — bounded by the next member. */
function methodBody(source: string, name: string) {
  const start = [`  async ${name}(`, `  private async ${name}(`]
    .map((signature) => source.indexOf(signature))
    .find((index) => index !== -1);
  if (start === undefined)
    throw new Error(`PlatformRuntimeService.${name} not found`);
  const rest = source.slice(start + 4);
  const next = rest.search(/\n {2}(?:async |private |get |[a-zA-Z]+\()/);
  return next === -1 ? rest : rest.slice(0, next);
}

function switchCases(body: string) {
  return [...body.matchAll(/case '([a-z-]+)':/g)].map((match) => match[1]!);
}
