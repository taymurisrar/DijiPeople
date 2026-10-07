"use client";

import type { CommandHandler } from "../command-runtime.types";
import { customFieldsPayload, withCustomFieldValues } from "../custom-fields";
import type { ModuleDataAdapter } from "../module-data-adapter.types";
import type { ModuleRuntimeContext } from "../module-runtime.types";
import {
  buildCreateClaimPayload,
  buildUpdateClaimPayload,
  type ClaimHeaderDraft,
  type ClaimHeaderOriginal,
  type CreateClaimPayload,
  type UpdateClaimPayload,
} from "./claim-editor";
import {
  CLAIM_COMMAND_KEYS,
  CLAIM_LINE_ITEMS_TAB_KEY,
  CLAIM_REJECT_REASON_MIN_LENGTH,
  toClaimLineItemRows,
  toClaimRuntimeRecord,
} from "./claims-runtime-specs";
import { createStandardModuleDataAdapter } from "./standard-module-data.adapter";
import type { StandardModuleRuntimeSpec } from "./standard-module-runtime";

/*
 * The claims module's own data adapter — EXECPLAN-0044 wave 2.
 *
 * It wraps the standard adapter rather than adding a tenth `moduleKey` branch
 * to `standard-module-data.adapter.ts` (the accretion ITEM-0036 exists to
 * stop), and overrides only what the standard one cannot do for a claim:
 *
 *  - create/update: the standard sanitiser sends every writable spec field
 *    present in the draft. The claim DTOs are narrower than the record the
 *    form holds (no employeeId on update, no amounts or status ever), and the
 *    global ValidationPipe runs with `forbidNonWhitelisted`, so one stray key
 *    is a 400 for the whole save. The body is therefore rebuilt from
 *    `claim-editor.ts`'s payload builders — the same ones the bespoke form used
 *    — and nothing else.
 *  - commands: submit / manager-approve / payroll-approve / reject / cancel,
 *    posted with exactly the bodies the bespoke action panel posted.
 *  - the line-item related list, answered from the claim's embedded
 *    `lineItems` (the API has no GET line-items route).
 */

type RuntimeRecord = Readonly<Record<string, unknown>>;

export type ClaimsDataAdapterOptions = {
  /*
   * The claim as the page loaded it. Update diffs against it so only changed
   * header fields are sent, as the bespoke editor did; the related list reads
   * its lines from it instead of re-fetching the claim.
   */
  readonly record?: RuntimeRecord | null;
  /* Admin creation may raise a claim for another employee; self-service may not. */
  readonly allowEmployee: boolean;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is RuntimeRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/*
 * A lookup may hand back its selected option rather than the bare id; either
 * way the API wants the id.
 */
function lookupId(value: unknown) {
  if (isRecord(value)) return stringValue(value.id) || stringValue(value.value);
  return stringValue(value);
}

function toHeaderDraft(
  values: RuntimeRecord,
  allowEmployee: boolean,
): ClaimHeaderDraft {
  return {
    employeeId: allowEmployee ? lookupId(values.employeeId) : "",
    title: stringValue(values.title),
    description: stringValue(values.description),
    currencyCode: stringValue(values.currencyCode),
  };
}

/** The create body: `CreateClaimRequestDto`'s fields, and nothing else. */
export function buildClaimCreateBody(
  values: RuntimeRecord,
  allowEmployee: boolean,
): CreateClaimPayload {
  return buildCreateClaimPayload(toHeaderDraft(values, allowEmployee));
}

/**
 * The update body: only the `UpdateClaimRequestDto` fields that differ from
 * the claim as loaded. Without an original every non-blank header field is
 * sent, which the API accepts — an unchanged currency is not a currency
 * change.
 */
export function buildClaimUpdateBody(
  values: RuntimeRecord,
  original: RuntimeRecord | null | undefined,
): UpdateClaimPayload {
  const baseline: ClaimHeaderOriginal = original
    ? {
        title: stringValue(original.title),
        description: stringValue(original.description) || null,
        currencyCode: stringValue(original.currencyCode),
      }
    : { title: "", description: null, currencyCode: "" };
  return buildUpdateClaimPayload(toHeaderDraft(values, false), baseline);
}

/** The reject reason the dialog collected, or null when it is too short. */
export function readClaimRejectReason(payload: unknown): string | null {
  const reason = isRecord(payload) ? stringValue(payload.reason).trim() : "";
  return reason.length >= CLAIM_REJECT_REASON_MIN_LENGTH ? reason : null;
}

function withCustomFields(
  body: object,
  values: RuntimeRecord,
  runtime: ModuleRuntimeContext,
) {
  const customFields = customFieldsPayload(
    values,
    runtime?.metadata?.entity?.fields ?? [],
  );
  return customFields ? { ...body, customFields } : body;
}

export function createClaimsDataAdapter(
  spec: StandardModuleRuntimeSpec,
  options: ClaimsDataAdapterOptions,
): ModuleDataAdapter<RuntimeRecord, RuntimeRecord> {
  const standard = createStandardModuleDataAdapter(spec);
  const basePath = spec.apiPath ?? `/api${spec.routeBase}`;
  const declared = new Set((spec.commands ?? []).map((command) => command.key));

  function claimPath(recordId: string, action?: string) {
    const path = `${basePath}/${encodeURIComponent(recordId)}`;
    return action ? `${path}/${action}` : path;
  }

  function toRecord(data: unknown): RuntimeRecord {
    return isRecord(data) ? withCustomFieldValues(toClaimRuntimeRecord(data)) : {};
  }

  /*
   * One handler per workflow action. `body` is exactly what the bespoke panel
   * posted: nothing for submit and cancel, `{}` for the two approvals (their
   * `ClaimActionDto` is all-optional), `{ reason }` for reject.
   */
  function action(
    route: string,
    message: string,
    body?: (payload: unknown) => object | string,
  ): CommandHandler {
    return async (context) => {
      if (!context.recordId) {
        return { ok: false, message: "No claim is selected." };
      }
      const built = body ? body(context.payload) : undefined;
      if (typeof built === "string") return { ok: false, message: built };
      const result = await requestJson(claimPath(context.recordId, route), {
        method: "POST",
        ...(built ? { body: JSON.stringify(built) } : {}),
      });
      return {
        ok: true,
        data: toRecord(result),
        message,
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    };
  }

  const allHandlers: Readonly<Record<string, CommandHandler>> = {
    [CLAIM_COMMAND_KEYS.edit]: (context) =>
      context.recordId
        ? {
            ok: true,
            redirectTo: `${spec.routeBase}/${encodeURIComponent(context.recordId)}/edit`,
          }
        : { ok: false, message: "No claim is selected." },
    [CLAIM_COMMAND_KEYS.submit]: action("submit", "Claim submitted."),
    [CLAIM_COMMAND_KEYS.managerApprove]: action(
      "manager-approve",
      "Claim approved by manager.",
      () => ({}),
    ),
    [CLAIM_COMMAND_KEYS.payrollApprove]: action(
      "payroll-approve",
      "Claim approved for payroll.",
      () => ({}),
    ),
    [CLAIM_COMMAND_KEYS.reject]: action(
      "reject",
      "Claim rejected.",
      (payload) => {
        const reason = readClaimRejectReason(payload);
        return reason
          ? { reason }
          : `Enter a reason of at least ${CLAIM_REJECT_REASON_MIN_LENGTH} characters.`;
      },
    ),
    [CLAIM_COMMAND_KEYS.cancel]: action("cancel", "Claim cancelled."),
  };

  /*
   * Only the handlers this spec declares. The self-service spec declares Edit
   * and Submit alone, so its adapter cannot post to an admin-only decision
   * route even if something asked it to.
   */
  const commandHandlers = Object.fromEntries(
    Object.entries(allHandlers).filter(([key]) => declared.has(key)),
  );

  return {
    ...standard,
    commandHandlers,

    async getById(runtime, recordId) {
      const record = await standard.getById(runtime, recordId);
      return record ? toRecord(record) : null;
    },

    async create(runtime, values) {
      const body = withCustomFields(
        buildClaimCreateBody(values, options.allowEmployee),
        values,
        runtime,
      );
      return toRecord(
        await requestJson(basePath, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },

    async update(runtime, recordId, values) {
      const original =
        options.record && stringValue(options.record.id) === recordId
          ? options.record
          : null;
      const body = withCustomFields(
        buildClaimUpdateBody(values as RuntimeRecord, original),
        values as RuntimeRecord,
        runtime,
      );
      return toRecord(
        await requestJson(claimPath(recordId), {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
    },

    async getRelatedRecords(input) {
      if (input.subgrid.relationshipName !== lineItemsRelationship(spec)) {
        return standard.getRelatedRecords(input);
      }
      const claim =
        options.record &&
        stringValue(options.record.id) === input.parentRecordId
          ? options.record
          : await requestJson(claimPath(input.parentRecordId));
      const records = toClaimLineItemRows(isRecord(claim) ? claim : null);
      return { records, totalRecords: records.length };
    },
  };
}

function lineItemsRelationship(spec: StandardModuleRuntimeSpec) {
  return (
    spec.relatedTabs?.find((tab) => tab.tabKey === CLAIM_LINE_ITEMS_TAB_KEY)
      ?.relationshipName ?? ""
  );
}

/*
 * The same contract as the standard adapter's private `requestJson`: inline
 * error handling, and a thrown error that carries the API's error body on
 * `data`, which the command runtime reads to tell a business refusal (a toast)
 * from a defect (the technical dialog). The user-facing message is the API's
 * own; method and path stay on `data` for the error log only (BUG-1963).
 */
async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-dijipeople-error-handling": "inline",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
      statusCode?: unknown;
    } | null;
    const method = init?.method ?? "GET";
    const message =
      typeof data?.message === "string"
        ? data.message
        : `Request failed with ${response.status}.`;
    const error = new Error(message) as Error & { data?: unknown };
    error.data = {
      ...(data && typeof data === "object" ? data : {}),
      message,
      path,
      method,
      status: response.status,
      statusCode:
        typeof data?.statusCode === "number" ? data.statusCode : response.status,
    };
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}
