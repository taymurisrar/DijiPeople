/*
 * Pure logic for the claim request editor (TASK-0036) — payload building,
 * line-item normalisation and editability, kept out of the client component
 * so it can run under this app's node-only jest (see jest.config.js's own
 * comment: no jsdom, so anything worth asserting on has to be plain
 * functions).
 *
 * Mirrors `services/api/src/modules/claims/dto/claim-request.dto.ts` and
 * `claims.service.ts`'s `assertDraftEditable` / `buildLineItemData` — a claim
 * is only editable while it is DRAFT, and a claim line always carries the
 * claim's own currency (the API rejects a mismatch), so the currency is never
 * asked for on the line-item form itself.
 */

export const CLAIM_EDITABLE_STATUS = "DRAFT";

export function isClaimEditable(status: string | null | undefined): boolean {
  return status === CLAIM_EDITABLE_STATUS;
}

/**
 * Whether the claim form takes input: always for a claim not yet created (it
 * has no status), otherwise only while it is a draft. Using isClaimEditable
 * alone disabled the whole new-claim form, Create button included.
 */
export function isClaimFormEditable(
  claim: { readonly status: string } | null | undefined,
): boolean {
  return !claim || isClaimEditable(claim.status);
}

export type ClaimHeaderDraft = {
  readonly employeeId: string;
  readonly title: string;
  readonly description: string;
  readonly currencyCode: string;
};

export type CreateClaimPayload = {
  readonly title: string;
  readonly currencyCode: string;
  readonly employeeId?: string;
  readonly description?: string;
};

export function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

/** `CreateClaimRequestDto` never accepts an empty optional string — omit it. */
export function buildCreateClaimPayload(
  draft: ClaimHeaderDraft,
): CreateClaimPayload {
  const payload: CreateClaimPayload = {
    title: draft.title.trim(),
    currencyCode: normalizeCurrencyCode(draft.currencyCode),
  };
  const employeeId = draft.employeeId.trim();
  const description = draft.description.trim();
  return {
    ...payload,
    ...(employeeId ? { employeeId } : {}),
    ...(description ? { description } : {}),
  };
}

export type UpdateClaimPayload = {
  readonly title?: string;
  readonly description?: string;
  readonly currencyCode?: string;
};

export type ClaimHeaderOriginal = {
  readonly title: string;
  readonly description?: string | null;
  readonly currencyCode: string;
};

/**
 * Only the fields the draft actually changed — `UpdateClaimRequestDto` fields
 * are all optional, and `forbidNonWhitelisted` means every key sent must be
 * one it declares, never a computed total or a status.
 */
export function buildUpdateClaimPayload(
  draft: ClaimHeaderDraft,
  original: ClaimHeaderOriginal,
): UpdateClaimPayload {
  const payload: Record<string, string> = {};
  const title = draft.title.trim();
  if (title !== original.title) payload.title = title;

  const description = draft.description.trim();
  if (description !== (original.description ?? "")) {
    payload.description = description;
  }

  const currencyCode = normalizeCurrencyCode(draft.currencyCode);
  if (currencyCode !== normalizeCurrencyCode(original.currencyCode)) {
    payload.currencyCode = currencyCode;
  }

  return payload;
}

export function hasHeaderChanges(payload: UpdateClaimPayload): boolean {
  return Object.keys(payload).length > 0;
}

export type LineItemDraft = {
  readonly claimTypeId: string;
  readonly claimSubTypeId: string;
  readonly transactionDate: string;
  readonly vendor: string;
  readonly description: string;
  readonly amount: string;
  readonly receiptDocumentId: string;
};

export const EMPTY_LINE_ITEM_DRAFT: LineItemDraft = {
  claimTypeId: "",
  claimSubTypeId: "",
  transactionDate: "",
  vendor: "",
  description: "",
  amount: "",
  receiptDocumentId: "",
};

/** `null` when the input is blank or not a finite number — never `NaN`. */
export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Mirrors the server checks a line-item save will make
 * (`buildLineItemData` in `claims.service.ts`) so the user sees the same
 * rejection before a round trip rather than after one. `requireReceipt`
 * comes from the selected claim subtype only — the API never enforces the
 * claim *type's* own `receiptRequired` flag on a line item, only the
 * subtype's `requiresReceipt` (see claims.service.ts `buildLineItemData`),
 * so this mirrors that rather than the stricter rule the type-level flag
 * implies.
 */
export function validateLineItemDraft(
  draft: LineItemDraft,
  options: { readonly requireReceipt: boolean },
): string[] {
  const errors: string[] = [];
  if (!draft.claimTypeId) errors.push("Claim type is required.");
  if (!draft.transactionDate) errors.push("Transaction date is required.");
  const amount = parseAmountInput(draft.amount);
  if (amount === null || amount <= 0) {
    errors.push("Amount must be greater than zero.");
  }
  if (options.requireReceipt && !draft.receiptDocumentId) {
    errors.push("A receipt document is required for this claim subtype.");
  }
  return errors;
}

export type LineItemPayload = {
  readonly claimTypeId: string;
  readonly transactionDate: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly claimSubTypeId?: string;
  readonly vendor?: string;
  readonly description?: string;
  readonly receiptDocumentId?: string;
};

/**
 * `claimCurrencyCode` is always the claim request's own currency — every
 * line must match it (`buildLineItemData` throws `BadRequestException`
 * otherwise), so the form never lets the user pick a different one.
 */
export function buildLineItemPayload(
  draft: LineItemDraft,
  claimCurrencyCode: string,
): LineItemPayload {
  const payload: LineItemPayload = {
    claimTypeId: draft.claimTypeId,
    transactionDate: draft.transactionDate,
    amount: parseAmountInput(draft.amount) ?? 0,
    currencyCode: normalizeCurrencyCode(claimCurrencyCode),
  };
  const vendor = draft.vendor.trim();
  const description = draft.description.trim();
  return {
    ...payload,
    ...(draft.claimSubTypeId ? { claimSubTypeId: draft.claimSubTypeId } : {}),
    ...(vendor ? { vendor } : {}),
    ...(description ? { description } : {}),
    ...(draft.receiptDocumentId
      ? { receiptDocumentId: draft.receiptDocumentId }
      : {}),
  };
}

export type ClaimLineItemForDraft = {
  readonly id: string;
  readonly claimTypeId: string;
  readonly claimSubTypeId?: string | null;
  readonly transactionDate: string;
  readonly vendor?: string | null;
  readonly description?: string | null;
  readonly amount: string;
  readonly receiptDocumentId?: string | null;
};

/** An existing line item, as the values an edit-in-place form starts from. */
export function lineItemToDraft(line: ClaimLineItemForDraft): LineItemDraft {
  return {
    claimTypeId: line.claimTypeId,
    claimSubTypeId: line.claimSubTypeId ?? "",
    transactionDate: line.transactionDate.slice(0, 10),
    vendor: line.vendor ?? "",
    description: line.description ?? "",
    amount: line.amount,
    receiptDocumentId: line.receiptDocumentId ?? "",
  };
}
