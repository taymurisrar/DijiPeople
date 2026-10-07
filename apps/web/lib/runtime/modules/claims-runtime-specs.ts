import { PERMISSION_KEYS } from "@/lib/security-keys";
import type {
  CommandDefinition,
  CommandVisibilityRule,
} from "../command-runtime.types";
import type { OptionSetValueMetadata } from "../metadata-runtime.types";
import { CLAIM_EDITABLE_STATUS } from "./claim-editor";
import type {
  StandardModuleRuntimeSpec,
  StandardModuleViewSpec,
} from "./standard-module-runtime";

/*
 * Claims as runtime modules — EXECPLAN-0044 wave 2.
 *
 * Two specs over one API resource, because the API exposes two surfaces with
 * different permission keys rather than one surface with scoped rows:
 *
 *   /claims     claims.read-all to read, claims.update to edit and submit,
 *               plus the four decision keys (manager-approve, payroll-approve,
 *               reject, cancel).
 *   /me/claims  claims.read-own to read, and claims.create for EVERY write —
 *               create, edit, line items and submit. There is no self-service
 *               cancel and no self-service decision route at all.
 *
 * Every command's permission and status gate below was copied from the bespoke
 * `claim-actions.tsx` it replaces, not re-derived from the API, because
 * `record-page-layout-contract.md` MUST #7 forbids a migration from widening or
 * narrowing who sees which action. The API (`claims.service.ts`) is still the
 * authority; these rules only decide which buttons are offered.
 *
 * This file is imported by server pages as well as client components, so it
 * must stay free of anything client-only. The adapter that executes these
 * commands lives in `claims-data.adapter.ts`.
 */

export const CLAIM_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "PAYROLL_APPROVED",
  "REJECTED",
  "INCLUDED_IN_PAYROLL",
  "PAID",
  "CANCELLED",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const CLAIM_STATUS_OPTIONS: readonly OptionSetValueMetadata[] =
  CLAIM_STATUSES.map((value) => ({
    value,
    label: value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  }));

/*
 * Statuses past which a claim can no longer be cancelled or rejected. These
 * are the exact lists the bespoke action panel tested with `includes`; the
 * service refuses the same transitions, so the button and the API agree.
 */
export const CLAIM_CANCEL_BLOCKED_STATUSES: readonly ClaimStatus[] = [
  "INCLUDED_IN_PAYROLL",
  "PAID",
  "CANCELLED",
];
export const CLAIM_REJECT_BLOCKED_STATUSES: readonly ClaimStatus[] = [
  "INCLUDED_IN_PAYROLL",
  "PAID",
  "REJECTED",
  "CANCELLED",
];

/*
 * The bespoke panel disabled Reject until the reason had three characters.
 * The API only requires a string, so this is a UI rule, kept as one.
 */
export const CLAIM_REJECT_REASON_MIN_LENGTH = 3;

export const CLAIM_COMMAND_KEYS = {
  edit: "claim.edit",
  submit: "claim.submit",
  managerApprove: "claim.managerApprove",
  payrollApprove: "claim.payrollApprove",
  reject: "claim.reject",
  cancel: "claim.cancel",
} as const;

export type ClaimCommandKey =
  (typeof CLAIM_COMMAND_KEYS)[keyof typeof CLAIM_COMMAND_KEYS];

export const CLAIM_LINE_ITEMS_TAB_KEY = "lineItems";

function statusIs(status: ClaimStatus): CommandVisibilityRule {
  return {
    operator: "field-equals",
    fieldLogicalName: "status",
    expectedValue: status,
  };
}

function statusNotIn(statuses: readonly ClaimStatus[]): CommandVisibilityRule {
  return {
    operator: "field-in",
    fieldLogicalName: "status",
    expectedValues: statuses,
    invert: true,
  };
}

function claimCommand(
  key: ClaimCommandKey,
  label: string,
  permissionKey: string,
  visibilityRules: readonly CommandVisibilityRule[],
  order: number,
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    key,
    label,
    description: `${label} this claim.`,
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: key,
    permission: { permissionKey, operation: "execute", scope: "tenant" },
    visibilityRules,
    order,
    ...overrides,
  };
}

/*
 * Edit is a module command rather than the standard `system.edit` because the
 * bespoke pages only offered Edit on a DRAFT claim, and a standard command
 * cannot carry a record-level visibility rule. The spec therefore turns the
 * standard one off (`disableEdit`) and declares this one in its place — at the
 * same order, so it sits where Edit always sits.
 */
function claimEditCommand(permissionKey: string): CommandDefinition {
  return claimCommand(
    CLAIM_COMMAND_KEYS.edit,
    "Edit",
    permissionKey,
    [statusIs(CLAIM_EDITABLE_STATUS)],
    30,
    { description: "Edit this draft claim." },
  );
}

const LINE_ITEM_COLUMNS = [
  "claimTypeName",
  "claimSubTypeName",
  "transactionDate",
  "vendor",
  "description",
  "amount",
  "approvedAmount",
  "currencyCode",
] as const;

const LINE_ITEM_COLUMN_LABELS: Readonly<Record<string, string>> = {
  claimTypeName: "Claim Type",
  claimSubTypeName: "Claim Subtype",
  transactionDate: "Transaction Date",
  vendor: "Vendor",
  description: "Description",
  amount: "Amount",
  approvedAmount: "Approved Amount",
  currencyCode: "Currency",
};

/*
 * Line items are a read-only related list here. The API embeds them in the
 * claim (there is no GET line-items route), so the adapter answers this list
 * from the claim it already holds rather than from `listPath`, and no
 * create/update/delete path is declared — the subgrid therefore offers no
 * write affordance. Editing a draft's lines goes through the claim line-item
 * editor on the edit page instead; see `claim-record-page.tsx` for why that one
 * surface stays bespoke.
 */
function lineItemsRelatedTab(apiPath: string) {
  return {
    tabKey: CLAIM_LINE_ITEMS_TAB_KEY,
    label: "Line Items",
    order: 20,
    relationshipName: "claimRequest_lineItems",
    relatedEntityLogicalName: "claimLineItem",
    targetFieldLogicalName: "claimRequestId",
    columns: LINE_ITEM_COLUMNS,
    columnLabels: LINE_ITEM_COLUMN_LABELS,
    listPath: `${apiPath}/{parentId}`,
  };
}

const CLAIM_LIST_COLUMNS = [
  "title",
  "employeeName",
  "submittedAmount",
  "approvedAmount",
  "currencyCode",
  "submittedAt",
  "status",
] as const;

const MY_CLAIM_LIST_COLUMNS = [
  "title",
  "submittedAmount",
  "approvedAmount",
  "currencyCode",
  "submittedAt",
  "status",
] as const;

/*
 * Status views, as on leave: the list endpoints return every claim the caller
 * may read, and a view narrows them client-side on `status`, so no view needs
 * an endpoint of its own. View ids are fixed so a saved `?viewId=` link keeps
 * resolving.
 */
function statusView(
  logicalName: string,
  viewId: string,
  displayName: string,
  columns: readonly string[],
  status: ClaimStatus,
): StandardModuleViewSpec {
  return {
    logicalName,
    viewId,
    displayName,
    columns,
    filters: [{ fieldLogicalName: "status", operator: "eq", value: status }],
    defaultSort: [{ fieldLogicalName: "submittedAt", direction: "asc" }],
  };
}

const CLAIM_FIELDS: StandardModuleRuntimeSpec["fields"] = [
  {
    logicalName: "title",
    displayName: "Title",
    isPrimaryName: true,
    requirementLevel: "required",
  },
  {
    logicalName: "employeeId",
    displayName: "Employee",
    dataType: "lookup",
    lookupTargetEntityLogicalName: "employee",
  },
  { logicalName: "employeeName", displayName: "Employee", isReadOnly: true },
  {
    logicalName: "currencyCode",
    displayName: "Currency Code",
    requirementLevel: "required",
  },
  {
    logicalName: "description",
    displayName: "Description",
    dataType: "multiline-string",
  },
  {
    logicalName: "submittedAmount",
    displayName: "Submitted Amount",
    dataType: "currency",
    isReadOnly: true,
  },
  {
    logicalName: "approvedAmount",
    displayName: "Approved Amount",
    dataType: "currency",
    isReadOnly: true,
  },
  {
    logicalName: "submittedAt",
    displayName: "Submitted At",
    dataType: "datetime",
    isReadOnly: true,
  },
  {
    logicalName: "status",
    displayName: "Status",
    dataType: "optionset",
    options: CLAIM_STATUS_OPTIONS,
    isStatus: true,
    // The workflow commands own status; no DTO accepts it.
    isReadOnly: true,
  },
];

export const claimRuntimeSpec: StandardModuleRuntimeSpec = {
  moduleKey: "claims",
  metadataTableKey: "claimRequests",
  apiPath: "/api/claims",
  entityLogicalName: "claimRequest",
  collectionName: "claimRequests",
  label: "Claims & Reimbursements",
  singularLabel: "Claim",
  createCommandLabel: "New claim",
  routeBase: "/claims",
  primaryNameField: "title",
  statusField: "status",
  permissions: {
    read: PERMISSION_KEYS.CLAIMS_READ_ALL,
    create: PERMISSION_KEYS.CLAIMS_CREATE,
    update: PERMISSION_KEYS.CLAIMS_UPDATE,
  },
  /*
   * `disableEdit`: replaced by `claim.edit` (DRAFT only). `disableDelete`: the
   * API has no claim delete — a claim is cancelled, never removed — so the
   * standard Delete could only ever be a dead button.
   */
  adapterCapabilities: { disableEdit: true, disableDelete: true },
  lookupApiPaths: { employeeId: "/api/employees" },
  fields: CLAIM_FIELDS,
  formFields: [
    "title",
    "employeeName",
    "currencyCode",
    "description",
    "submittedAmount",
    "approvedAmount",
    "submittedAt",
  ],
  /*
   * Only admin creation may raise a claim for someone else, and only at
   * creation — `UpdateClaimRequestDto` has no employeeId — so the picker is on
   * the create form alone. Left blank, the API raises it for the caller.
   */
  quickCreateFormFields: ["employeeId", "title", "currencyCode", "description"],
  views: [
    {
      logicalName: "claims.all",
      viewId: "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7101",
      displayName: "All Claims",
      columns: CLAIM_LIST_COLUMNS,
      isDefault: true,
      defaultSort: [{ fieldLogicalName: "submittedAt", direction: "desc" }],
    },
    statusView(
      "claims.submitted",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7102",
      "Awaiting Manager Approval",
      CLAIM_LIST_COLUMNS,
      "SUBMITTED",
    ),
    statusView(
      "claims.managerApproved",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7103",
      "Awaiting Payroll Approval",
      CLAIM_LIST_COLUMNS,
      "MANAGER_APPROVED",
    ),
    statusView(
      "claims.payrollApproved",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7104",
      "Payroll Approved",
      CLAIM_LIST_COLUMNS,
      "PAYROLL_APPROVED",
    ),
    statusView(
      "claims.drafts",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7105",
      "Drafts",
      CLAIM_LIST_COLUMNS,
      "DRAFT",
    ),
    statusView(
      "claims.rejected",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7106",
      "Rejected",
      CLAIM_LIST_COLUMNS,
      "REJECTED",
    ),
  ],
  relatedTabs: [lineItemsRelatedTab("/api/claims")],
  commands: [
    claimEditCommand(PERMISSION_KEYS.CLAIMS_UPDATE),
    claimCommand(
      CLAIM_COMMAND_KEYS.submit,
      "Submit",
      PERMISSION_KEYS.CLAIMS_UPDATE,
      [statusIs("DRAFT")],
      500,
    ),
    claimCommand(
      CLAIM_COMMAND_KEYS.managerApprove,
      "Manager Approve",
      PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE,
      [statusIs("SUBMITTED")],
      510,
    ),
    claimCommand(
      CLAIM_COMMAND_KEYS.payrollApprove,
      "Payroll Approve",
      PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE,
      [statusIs("MANAGER_APPROVED")],
      520,
    ),
    claimCommand(
      CLAIM_COMMAND_KEYS.reject,
      "Reject",
      PERMISSION_KEYS.CLAIMS_REJECT,
      [statusNotIn(CLAIM_REJECT_BLOCKED_STATUSES)],
      530,
      { payloadSchemaKey: CLAIM_COMMAND_KEYS.reject },
    ),
    claimCommand(
      CLAIM_COMMAND_KEYS.cancel,
      "Cancel",
      PERMISSION_KEYS.CLAIMS_CANCEL,
      [statusNotIn(CLAIM_CANCEL_BLOCKED_STATUSES)],
      540,
    ),
  ],
};

/*
 * Self-service. Read is claims.read-own; every write route under /me/claims is
 * guarded by claims.create (see claims.controller.ts), which is why `update`
 * and Submit name claims.create rather than claims.update. Only Edit and
 * Submit exist — the self-service API has no cancel and no decision routes, so
 * offering them here would be offering a 404.
 */
export const myClaimRuntimeSpec: StandardModuleRuntimeSpec = {
  moduleKey: "me-claims",
  metadataTableKey: "claimRequests",
  apiPath: "/api/me/claims",
  entityLogicalName: "claimRequest",
  collectionName: "claimRequests",
  label: "My Claims",
  singularLabel: "Claim",
  createCommandLabel: "New claim",
  routeBase: "/me/claims",
  primaryNameField: "title",
  statusField: "status",
  permissions: {
    read: PERMISSION_KEYS.CLAIMS_READ_OWN,
    create: PERMISSION_KEYS.CLAIMS_CREATE,
    update: PERMISSION_KEYS.CLAIMS_CREATE,
  },
  adapterCapabilities: { disableEdit: true, disableDelete: true },
  fields: CLAIM_FIELDS.filter(
    (field) =>
      field.logicalName !== "employeeId" && field.logicalName !== "employeeName",
  ),
  formFields: [
    "title",
    "currencyCode",
    "description",
    "submittedAmount",
    "approvedAmount",
    "submittedAt",
  ],
  quickCreateFormFields: ["title", "currencyCode", "description"],
  views: [
    {
      logicalName: "myClaims.all",
      viewId: "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7201",
      displayName: "My Claims",
      columns: MY_CLAIM_LIST_COLUMNS,
      isDefault: true,
      defaultSort: [{ fieldLogicalName: "submittedAt", direction: "desc" }],
    },
    statusView(
      "myClaims.drafts",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7202",
      "Drafts",
      MY_CLAIM_LIST_COLUMNS,
      "DRAFT",
    ),
    statusView(
      "myClaims.submitted",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7203",
      "Submitted",
      MY_CLAIM_LIST_COLUMNS,
      "SUBMITTED",
    ),
    statusView(
      "myClaims.rejected",
      "6f0e3c52-4b7a-4d1e-9c2a-0c1a1e5b7204",
      "Rejected",
      MY_CLAIM_LIST_COLUMNS,
      "REJECTED",
    ),
  ],
  relatedTabs: [lineItemsRelatedTab("/api/me/claims")],
  commands: [
    claimEditCommand(PERMISSION_KEYS.CLAIMS_CREATE),
    claimCommand(
      CLAIM_COMMAND_KEYS.submit,
      "Submit",
      PERMISSION_KEYS.CLAIMS_CREATE,
      [statusIs("DRAFT")],
      500,
    ),
  ],
};

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function personName(value: unknown) {
  if (!isRecord(value)) return "";
  return [value.firstName, value.lastName]
    .map(stringValue)
    .filter(Boolean)
    .join(" ");
}

/*
 * The claim API nests the employee and each line's type and subtype; the list
 * columns, the record header and the line-item subgrid all read flat names.
 * `lineItems` itself is kept as the API sent it, because the line-item editor
 * needs the ids (claimTypeId, receiptDocumentId, …) the flat rows drop.
 */
export function toClaimRuntimeRecord(
  claim: UnknownRecord,
): Record<string, unknown> {
  return {
    ...claim,
    employeeName: personName(claim.employee),
  };
}

export function toClaimLineItemRows(
  claim: UnknownRecord | null | undefined,
): Record<string, unknown>[] {
  const lineItems = Array.isArray(claim?.lineItems) ? claim.lineItems : [];
  return lineItems.filter(isRecord).map((line) => {
    const claimType = isRecord(line.claimType) ? line.claimType : null;
    const claimSubType = isRecord(line.claimSubType) ? line.claimSubType : null;
    return {
      id: stringValue(line.id),
      claimRequestId: stringValue(claim?.id),
      claimTypeName: stringValue(claimType?.name),
      claimSubTypeName: stringValue(claimSubType?.name),
      transactionDate: stringValue(line.transactionDate).slice(0, 10),
      vendor: stringValue(line.vendor),
      description: stringValue(line.description),
      amount: stringValue(line.amount),
      approvedAmount: stringValue(line.approvedAmount),
      currencyCode: stringValue(line.currencyCode),
    };
  });
}
