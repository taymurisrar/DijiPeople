/*
 * Claims on the module runtime — EXECPLAN-0044 wave 2.
 *
 * The bespoke claim pages decided which workflow buttons to show in
 * `claim-actions.tsx`, a component this migration deleted. The rules below are
 * that component's rules, written out as the oracle the runtime specs are
 * checked against, so a later edit to a visibility rule that widens or narrows
 * who sees an action fails here rather than in production
 * (record-page-layout-contract.md MUST #7).
 */
import { resolveCommandsForSurface } from "../command-runtime.resolver";
import { getCommandPayloadSchema } from "../command-payload-schema";
import type { ModuleRuntimeContext } from "../module-runtime.types";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  buildClaimCreateBody,
  buildClaimUpdateBody,
  createClaimsDataAdapter,
  readClaimRejectReason,
} from "./claims-data.adapter";
import {
  CLAIM_COMMAND_KEYS,
  CLAIM_STATUSES,
  claimRuntimeSpec,
  myClaimRuntimeSpec,
  toClaimLineItemRows,
  toClaimRuntimeRecord,
  type ClaimStatus,
} from "./claims-runtime-specs";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
  type StandardModuleRuntimeSpec,
} from "./standard-module-runtime";

const CLAIM_ID = "0b7c1d2e-3f40-4a51-8b62-7c83d94e05f1";

const ALL_CLAIM_KEYS = [
  PERMISSION_KEYS.CLAIMS_READ_ALL,
  PERMISSION_KEYS.CLAIMS_READ_OWN,
  PERMISSION_KEYS.CLAIMS_CREATE,
  PERMISSION_KEYS.CLAIMS_UPDATE,
  PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE,
  PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE,
  PERMISSION_KEYS.CLAIMS_REJECT,
  PERMISSION_KEYS.CLAIMS_CANCEL,
];

function runtimeFor(
  spec: StandardModuleRuntimeSpec,
  permissionKeys: readonly string[],
): ModuleRuntimeContext {
  return buildStandardModuleRuntimeContext({
    pageKind: "detail",
    recordId: CLAIM_ID,
    principal: buildStandardRuntimePrincipal({
      userId: "user-1",
      tenantId: "tenant-1",
      roleKeys: ["employee"],
      permissionKeys,
    }),
    spec,
  });
}

function visibleClaimCommands(
  spec: StandardModuleRuntimeSpec,
  permissionKeys: readonly string[],
  status: ClaimStatus,
) {
  const runtime = runtimeFor(spec, permissionKeys);
  return resolveCommandsForSurface(runtime.metadata.commands, "detail", {
    principal: runtime.security.principal,
    record: { id: CLAIM_ID, status },
  })
    .map((command) => command.key)
    .filter((key) => key.startsWith("claim."))
    .sort();
}

/* The deleted claim-actions.tsx and the bespoke detail page, verbatim. */
function bespokeAdminActions(
  permissionKeys: readonly string[],
  status: ClaimStatus,
) {
  const has = (key: string) => permissionKeys.includes(key);
  const keys: string[] = [];
  if (has(PERMISSION_KEYS.CLAIMS_UPDATE) && status === "DRAFT") {
    keys.push(CLAIM_COMMAND_KEYS.edit, CLAIM_COMMAND_KEYS.submit);
  }
  if (has(PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE) && status === "SUBMITTED") {
    keys.push(CLAIM_COMMAND_KEYS.managerApprove);
  }
  if (
    has(PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE) &&
    status === "MANAGER_APPROVED"
  ) {
    keys.push(CLAIM_COMMAND_KEYS.payrollApprove);
  }
  if (
    has(PERMISSION_KEYS.CLAIMS_CANCEL) &&
    !["INCLUDED_IN_PAYROLL", "PAID", "CANCELLED"].includes(status)
  ) {
    keys.push(CLAIM_COMMAND_KEYS.cancel);
  }
  if (
    has(PERMISSION_KEYS.CLAIMS_REJECT) &&
    !["INCLUDED_IN_PAYROLL", "PAID", "REJECTED", "CANCELLED"].includes(status)
  ) {
    keys.push(CLAIM_COMMAND_KEYS.reject);
  }
  return keys.sort();
}

/* The bespoke self-service pages: Edit and Submit, both on claims.create. */
function bespokeSelfActions(
  permissionKeys: readonly string[],
  status: ClaimStatus,
) {
  return permissionKeys.includes(PERMISSION_KEYS.CLAIMS_CREATE) &&
    status === "DRAFT"
    ? [CLAIM_COMMAND_KEYS.edit, CLAIM_COMMAND_KEYS.submit].sort()
    : [];
}

const PERMISSION_SETS: readonly (readonly string[])[] = [
  [],
  [PERMISSION_KEYS.CLAIMS_READ_ALL],
  [PERMISSION_KEYS.CLAIMS_READ_ALL, PERMISSION_KEYS.CLAIMS_UPDATE],
  [PERMISSION_KEYS.CLAIMS_READ_ALL, PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE],
  [PERMISSION_KEYS.CLAIMS_READ_ALL, PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE],
  [PERMISSION_KEYS.CLAIMS_READ_ALL, PERMISSION_KEYS.CLAIMS_REJECT],
  [PERMISSION_KEYS.CLAIMS_READ_ALL, PERMISSION_KEYS.CLAIMS_CANCEL],
  [PERMISSION_KEYS.CLAIMS_READ_OWN, PERMISSION_KEYS.CLAIMS_CREATE],
  ALL_CLAIM_KEYS,
];

describe("claim command visibility", () => {
  it.each(CLAIM_STATUSES.flatMap((status) =>
    PERMISSION_SETS.map((keys) => [status, keys] as const),
  ))(
    "admin spec matches the bespoke action panel for %s with %j",
    (status, keys) => {
      expect(visibleClaimCommands(claimRuntimeSpec, keys, status)).toEqual(
        bespokeAdminActions(keys, status),
      );
    },
  );

  it.each(CLAIM_STATUSES.flatMap((status) =>
    PERMISSION_SETS.map((keys) => [status, keys] as const),
  ))(
    "self-service spec matches the bespoke pages for %s with %j",
    (status, keys) => {
      expect(visibleClaimCommands(myClaimRuntimeSpec, keys, status)).toEqual(
        bespokeSelfActions(keys, status),
      );
    },
  );

  it("never offers a decision or cancel on the self-service surface", () => {
    const declared = (myClaimRuntimeSpec.commands ?? []).map(
      (command) => command.key,
    );
    expect(declared.sort()).toEqual(
      [CLAIM_COMMAND_KEYS.edit, CLAIM_COMMAND_KEYS.submit].sort(),
    );
    // Even a caller holding every claim key, on every status.
    for (const status of CLAIM_STATUSES) {
      const visible = visibleClaimCommands(
        myClaimRuntimeSpec,
        ALL_CLAIM_KEYS,
        status,
      );
      for (const forbidden of [
        CLAIM_COMMAND_KEYS.managerApprove,
        CLAIM_COMMAND_KEYS.payrollApprove,
        CLAIM_COMMAND_KEYS.reject,
        CLAIM_COMMAND_KEYS.cancel,
      ]) {
        expect(visible).not.toContain(forbidden);
      }
    }
  });

  it("gates self-service writes on claims.create, never claims.update", () => {
    expect(myClaimRuntimeSpec.permissions?.update).toBe(
      PERMISSION_KEYS.CLAIMS_CREATE,
    );
    expect(
      visibleClaimCommands(
        myClaimRuntimeSpec,
        [PERMISSION_KEYS.CLAIMS_READ_OWN, PERMISSION_KEYS.CLAIMS_UPDATE],
        "DRAFT",
      ),
    ).toEqual([]);
  });

  it("replaces the standard Edit, which cannot be limited to drafts", () => {
    for (const spec of [claimRuntimeSpec, myClaimRuntimeSpec]) {
      const keys = runtimeFor(spec, ALL_CLAIM_KEYS).metadata.commands.map(
        (command) => command.key,
      );
      expect(keys).not.toContain("system.edit");
      expect(keys).not.toContain("system.delete");
      expect(keys).toContain(CLAIM_COMMAND_KEYS.edit);
    }
  });

  it("asks for a required reason before rejecting", () => {
    const reject = claimRuntimeSpec.commands?.find(
      (command) => command.key === CLAIM_COMMAND_KEYS.reject,
    );
    const schema = getCommandPayloadSchema(reject?.payloadSchemaKey);
    expect(schema?.fields).toEqual([
      expect.objectContaining({ key: "reason", required: true }),
    ]);
  });
});

describe("claim payload whitelisting", () => {
  const formValues = {
    id: CLAIM_ID,
    employeeId: "employee-2",
    employeeName: "Ada Lovelace",
    title: "  Taxi fares  ",
    description: "  Airport run ",
    currencyCode: " qar ",
    status: "DRAFT",
    submittedAmount: "120.00",
    approvedAmount: "0.00",
    submittedAt: null,
    lineItems: [],
    employee: { firstName: "Ada", lastName: "Lovelace" },
  };

  it("sends only CreateClaimRequestDto fields on admin create", () => {
    expect(buildClaimCreateBody(formValues, true)).toEqual({
      employeeId: "employee-2",
      title: "Taxi fares",
      description: "Airport run",
      currencyCode: "QAR",
    });
  });

  it("never sends an employee on self-service create", () => {
    expect(buildClaimCreateBody(formValues, false)).not.toHaveProperty(
      "employeeId",
    );
  });

  it("sends only the changed UpdateClaimRequestDto fields on update", () => {
    const original = {
      ...formValues,
      title: "Taxi fares",
      description: "Airport run",
      currencyCode: "QAR",
    };
    expect(
      buildClaimUpdateBody({ ...original, title: "Taxis" }, original),
    ).toEqual({ title: "Taxis" });
    expect(buildClaimUpdateBody(original, original)).toEqual({});
  });

  it("requires a reject reason of at least three characters", () => {
    expect(readClaimRejectReason({ reason: "  no " })).toBeNull();
    expect(readClaimRejectReason({})).toBeNull();
    expect(readClaimRejectReason({ reason: " Duplicate " })).toBe("Duplicate");
  });
});

describe("claims data adapter", () => {
  const originalFetch = global.fetch;
  let calls: { url: string; method?: string; body?: string }[] = [];

  beforeEach(() => {
    calls = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body === undefined ? undefined : String(init.body),
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: CLAIM_ID,
          title: "Taxi fares",
          status: "SUBMITTED",
          employee: { firstName: "Ada", lastName: "Lovelace" },
          lineItems: [],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function run(
    spec: StandardModuleRuntimeSpec,
    key: string,
    payload?: unknown,
  ) {
    const adapter = createClaimsDataAdapter(spec, { allowEmployee: true });
    const runtime = runtimeFor(spec, ALL_CLAIM_KEYS);
    const command = runtime.metadata.commands.find(
      (candidate) => candidate.key === key,
    );
    const handler = adapter.commandHandlers?.[key];
    if (!handler || !command) throw new Error(`No handler for ${key}.`);
    return handler({ runtime, command, recordId: CLAIM_ID, payload });
  }

  it.each([
    [CLAIM_COMMAND_KEYS.submit, "submit", undefined],
    [CLAIM_COMMAND_KEYS.managerApprove, "manager-approve", "{}"],
    [CLAIM_COMMAND_KEYS.payrollApprove, "payroll-approve", "{}"],
    [CLAIM_COMMAND_KEYS.cancel, "cancel", undefined],
  ])("%s posts to /%s with the bespoke body", async (key, route, body) => {
    const result = await run(claimRuntimeSpec, key);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { url: `/api/claims/${CLAIM_ID}/${route}`, method: "POST", body },
    ]);
  });

  it("rejects with the reason, and refuses a short one without calling the API", async () => {
    const refused = await run(claimRuntimeSpec, CLAIM_COMMAND_KEYS.reject, {
      reason: "no",
    });
    expect(refused.ok).toBe(false);
    expect(calls).toEqual([]);

    await run(claimRuntimeSpec, CLAIM_COMMAND_KEYS.reject, {
      reason: " Duplicate receipt ",
    });
    expect(calls).toEqual([
      {
        url: `/api/claims/${CLAIM_ID}/reject`,
        method: "POST",
        body: JSON.stringify({ reason: "Duplicate receipt" }),
      },
    ]);
  });

  it("submits self-service claims through /me/claims", async () => {
    await run(myClaimRuntimeSpec, CLAIM_COMMAND_KEYS.submit);
    expect(calls[0]?.url).toBe(`/api/me/claims/${CLAIM_ID}/submit`);
  });

  it("carries no decision handler on the self-service adapter", () => {
    const adapter = createClaimsDataAdapter(myClaimRuntimeSpec, {
      allowEmployee: false,
    });
    expect(Object.keys(adapter.commandHandlers ?? {}).sort()).toEqual(
      [CLAIM_COMMAND_KEYS.edit, CLAIM_COMMAND_KEYS.submit].sort(),
    );
  });

  it("sends a whitelisted body on create and a diff on update", async () => {
    const original = {
      id: CLAIM_ID,
      title: "Taxi fares",
      description: "",
      currencyCode: "QAR",
      status: "DRAFT",
    };
    const adapter = createClaimsDataAdapter(claimRuntimeSpec, {
      record: original,
      allowEmployee: true,
    });
    const runtime = runtimeFor(claimRuntimeSpec, ALL_CLAIM_KEYS);

    await adapter.create(runtime, {
      title: "Taxi fares",
      currencyCode: "qar",
      status: "DRAFT",
      submittedAmount: "0",
    });
    await adapter.update(runtime, CLAIM_ID, {
      ...original,
      title: "Taxis",
      employeeId: "someone-else",
      approvedAmount: "999",
    });

    expect(calls.map((call) => [call.url, call.method])).toEqual([
      ["/api/claims", "POST"],
      [`/api/claims/${CLAIM_ID}`, "PATCH"],
    ]);
    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({
      title: "Taxi fares",
      currencyCode: "QAR",
    });
    expect(JSON.parse(calls[1]?.body ?? "")).toEqual({ title: "Taxis" });
  });

  it("forwards custom field values the runtime marked as custom", async () => {
    const adapter = createClaimsDataAdapter(claimRuntimeSpec, {
      allowEmployee: true,
    });
    const base = runtimeFor(claimRuntimeSpec, ALL_CLAIM_KEYS);
    const runtime: ModuleRuntimeContext = {
      ...base,
      metadata: {
        ...base.metadata,
        entity: {
          ...base.metadata.entity,
          fields: [
            ...base.metadata.entity.fields,
            {
              ...base.metadata.entity.fields[0]!,
              id: "claimRequest.cf_project",
              logicalName: "cf_project",
              isCustomField: true,
            },
          ],
        },
      },
    };
    await adapter.create(runtime, {
      title: "Taxi fares",
      currencyCode: "QAR",
      cf_project: "Apollo",
    });
    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({
      title: "Taxi fares",
      currencyCode: "QAR",
      customFields: { cf_project: "Apollo" },
    });
  });

  it("answers the line-item list from the claim it already holds", async () => {
    const record = {
      id: CLAIM_ID,
      lineItems: [
        {
          id: "line-1",
          claimTypeId: "type-1",
          transactionDate: "2026-09-01T00:00:00.000Z",
          amount: "42.50",
          currencyCode: "QAR",
          vendor: "Karwa",
          claimType: { name: "Travel" },
          claimSubType: { name: "Taxi" },
        },
      ],
    };
    const adapter = createClaimsDataAdapter(claimRuntimeSpec, {
      record,
      allowEmployee: true,
    });
    const runtime = runtimeFor(claimRuntimeSpec, ALL_CLAIM_KEYS);
    const tab = runtime.metadata.forms
      .find((form) => form.formType === "main")
      ?.tabs?.find((candidate) => candidate.tabKey === "lineItems");
    if (!tab?.subgrid) throw new Error("No line-items subgrid.");

    const result = await adapter.getRelatedRecords({
      runtime,
      parentRecordId: CLAIM_ID,
      subgrid: tab.subgrid,
    });

    expect(calls).toEqual([]);
    expect(result.records).toEqual([
      expect.objectContaining({
        id: "line-1",
        claimTypeName: "Travel",
        claimSubTypeName: "Taxi",
        transactionDate: "2026-09-01",
        amount: "42.50",
        vendor: "Karwa",
      }),
    ]);
    // Read-only: the subgrid is offered no write path.
    expect(tab.subgrid.api?.createPath).toBeUndefined();
    expect(tab.subgrid.api?.updatePath).toBeUndefined();
    expect(tab.subgrid.api?.deletePath).toBeUndefined();
  });
});

describe("claim record mapping", () => {
  it("flattens the employee name and keeps the raw line items", () => {
    const lineItems = [{ id: "line-1" }];
    expect(
      toClaimRuntimeRecord({
        id: CLAIM_ID,
        employee: { firstName: "Ada", lastName: "Lovelace" },
        lineItems,
      }),
    ).toEqual(
      expect.objectContaining({ employeeName: "Ada Lovelace", lineItems }),
    );
  });

  it("returns no rows for a claim without line items", () => {
    expect(toClaimLineItemRows({ id: CLAIM_ID })).toEqual([]);
    expect(toClaimLineItemRows(null)).toEqual([]);
  });
});
