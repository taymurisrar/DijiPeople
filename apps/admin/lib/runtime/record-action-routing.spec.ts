import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHttpModuleRuntimeAdapter } from "./http-module-runtime-adapter";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import type { PlatformModuleKey } from "./platform-runtime.types";
import { executeRuntimeRecordAction } from "./runtime-record-action-handler";

/**
 * Every record command the registry declares reaches the API on the route that
 * can dispatch it.
 *
 * The record handler used to send every command it had no bespoke branch for
 * to `POST /platform-runtime/<module>/actions/<key>` with the id in the body.
 * The API dispatches record actions only from `/<module>/<id>/actions/<key>`,
 * so start-review, approve, reject, request-information, send-onboarding-link,
 * activate, suspend and reactivate on a partner, convert on a lead, and
 * amend/renew/new-version/void/terminate on an agreement all answered
 * 400 "Action <key> is not available" (EXECPLAN-0055 WP-01).
 *
 * The commands are read from the registry rather than listed here, so a command
 * added later is covered without anyone remembering this file. Each one is
 * driven through the real handler and the real HTTP adapter with `fetch`
 * captured, and the assertion is on the URL that would have gone out.
 */

const MODULES = ["partners", "leads", "contracts", "plans"] as const;
const RECORD_ID = "rec-1";

/*
 * The per-module list of commands that reach the API's record route, shared
 * with the API spec that proves each one is dispatched there. A JSON file
 * rather than an import because neither workspace can import the other's
 * source; this spec derives the list and must agree with the file exactly.
 */
const CONTRACT = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../services/api/src/modules/platform-runtime/record-actions.contract.json",
    ),
    "utf8",
  ),
) as Record<(typeof MODULES)[number], string[]>;

type Captured = { url: string; method: string };

function installFetch(captured: Captured[]) {
  const fakeResponse = {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ success: true, id: "", item: { id: RECORD_ID } }),
    blob: async () => new Blob(["pdf"]),
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET",
    });
    return fakeResponse;
  }) as typeof fetch;
}

/*
 * `generate-document` downloads through an anchor; the node test environment
 * has no DOM, and the download is not what is under test.
 */
function installDomStubs() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ click() {} }) };
  URL.createObjectURL = () => "blob:stub";
  URL.revokeObjectURL = () => undefined;
}

async function drive(moduleKey: PlatformModuleKey, actionKey: string) {
  const definition = getPlatformModuleDefinition(moduleKey);
  const action = definition.actions.find(
    (item) => item.key === actionKey && item.scope === "record",
  )!;
  const captured: Captured[] = [];
  installFetch(captured);
  await executeRuntimeRecordAction({
    action,
    moduleKey,
    record: { id: RECORD_ID },
    values: {
      approvalRequests: [{ id: "approval-1", status: "PENDING" }],
    },
    routeBase: definition.routeBase,
    adapter: createHttpModuleRuntimeAdapter(moduleKey),
    router: { push: () => undefined },
    save: async () => ({ success: true }),
    reloadRecord: async () => undefined,
    resetForm: () => undefined,
    enterEditMode: () => undefined,
    leaveEditMode: () => undefined,
    openSignatureDialog: () => undefined,
    requestReason: async () => "A recorded reason.",
  });
  return captured;
}

const realFetch = globalThis.fetch;
beforeAll(installDomStubs);
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe.each(MODULES)("%s record commands", (moduleKey) => {
  const recordActions = getPlatformModuleDefinition(moduleKey)
    .actions.filter((action) => action.scope === "record")
    .map((action) => action.key);

  it("declares record commands at all", () => {
    expect(recordActions.length).toBeGreaterThan(0);
  });

  it.each(recordActions)(
    "%s never posts to the id-less module action route",
    async (actionKey) => {
      const captured = await drive(moduleKey, actionKey);
      const idless = `/api/platform-runtime/${moduleKey}/actions/`;
      expect(captured.filter((call) => call.url.startsWith(idless))).toEqual(
        [],
      );
    },
  );

  it("sends exactly the contracted commands to /:id/actions/:action", async () => {
    const dispatched: string[] = [];
    for (const actionKey of recordActions) {
      const captured = await drive(moduleKey, actionKey);
      const recordRoute = `/api/platform-runtime/${moduleKey}/${RECORD_ID}/actions/${encodeURIComponent(actionKey)}`;
      if (
        captured.some(
          (call) => call.url === recordRoute && call.method === "POST",
        )
      )
        dispatched.push(actionKey);
    }
    expect(dispatched.sort()).toEqual([...CONTRACT[moduleKey]].sort());
  });
});
