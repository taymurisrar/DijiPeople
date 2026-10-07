"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  DateField,
  LookupField,
  NumberField,
  SelectField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { toLookupOptions } from "@/lib/runtime/custom-lookup-options";
import {
  buildLineItemPayload,
  EMPTY_LINE_ITEM_DRAFT,
  lineItemToDraft,
  type LineItemDraft,
  validateLineItemDraft,
} from "@/lib/runtime/modules/claim-editor";
import type {
  ClaimLineItemRecord,
  ClaimSubTypeRecord,
  ClaimTypeRecord,
} from "../claim-types";

/*
 * The draft claim's line-item editor — the one part of the claim record that
 * stays bespoke after EXECPLAN-0044 moved claims onto the runtime.
 *
 * Why it is not a runtime related-list quick-create: the subgrid's quick-create
 * fields are a flat, static list. A claim line needs three things that list
 * cannot express — a subtype select whose options depend on the chosen type,
 * a receipt that becomes required only when the chosen *subtype* says
 * `requiresReceipt` (validateLineItemDraft mirrors claims.service.ts
 * `buildLineItemData`), and a currency that is never asked for because it must
 * equal the claim's own. Rather than keep the whole claim page bespoke for
 * that, this editor is rendered inside the record page's "Line Items" tab
 * through `tabContent` (record-page-layout-contract.md MUST #5: a surface the
 * metadata cannot express still renders inside the form).
 *
 * Lines are not held in local state. Every line route responds with the whole
 * updated claim; the editor asks the server page to re-render instead, so the
 * header totals and this list come from the same fetch and cannot disagree.
 */
export function ClaimLineItemsEditor({
  basePath,
  claimId,
  currencyCode,
  lineItems,
}: {
  /** "/api/claims" (admin) or "/api/me/claims" (self-service). */
  readonly basePath: string;
  readonly claimId: string;
  readonly currencyCode: string;
  readonly lineItems: readonly ClaimLineItemRecord[];
}) {
  const router = useRouter();
  const [claimTypes, setClaimTypes] = useState<ClaimTypeRecord[]>([]);
  const [claimTypesError, setClaimTypesError] = useState(false);
  const [draft, setDraft] = useState<LineItemDraft>(EMPTY_LINE_ITEM_DRAFT);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/claims/types", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data: ClaimTypeRecord[]) => {
        if (active) setClaimTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setClaimTypesError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeClaimTypes = useMemo(
    () => claimTypes.filter((type) => type.isActive),
    [claimTypes],
  );
  const selectedClaimType = activeClaimTypes.find(
    (type) => type.id === draft.claimTypeId,
  );
  const subTypeOptions: ClaimSubTypeRecord[] = (
    selectedClaimType?.subTypes ?? []
  ).filter((subType) => subType.isActive);
  const selectedSubType = subTypeOptions.find(
    (subType) => subType.id === draft.claimSubTypeId,
  );
  const requireReceipt = selectedSubType?.requiresReceipt ?? false;

  function resetDraft() {
    setEditingLineItemId(null);
    setDraft(EMPTY_LINE_ITEM_DRAFT);
    setErrors([]);
  }

  function startEdit(lineId: string) {
    const line = lineItems.find((item) => item.id === lineId);
    if (!line) return;
    setEditingLineItemId(lineId);
    setDraft(lineItemToDraft(line));
    setErrors([]);
  }

  async function send(url: string, init: RequestInit, failure: string) {
    setBusy(true);
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      message?: string;
    } | null;
    setBusy(false);
    if (!response?.ok) {
      setErrors([data?.message ?? failure]);
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleSubmit() {
    const validation = validateLineItemDraft(draft, { requireReceipt });
    if (validation.length) {
      setErrors(validation);
      return;
    }
    const path = `${basePath}/${encodeURIComponent(claimId)}/line-items`;
    const saved = await send(
      editingLineItemId
        ? `${path}/${encodeURIComponent(editingLineItemId)}`
        : path,
      {
        method: editingLineItemId ? "PATCH" : "POST",
        body: JSON.stringify(buildLineItemPayload(draft, currencyCode)),
      },
      "Unable to save the claim line.",
    );
    if (saved) resetDraft();
  }

  async function handleRemove(lineId: string) {
    const removed = await send(
      `${basePath}/${encodeURIComponent(claimId)}/line-items/${encodeURIComponent(lineId)}`,
      { method: "DELETE" },
      "Unable to remove the claim line.",
    );
    if (removed && editingLineItemId === lineId) resetDraft();
  }

  return (
    <div className="grid gap-3">
      {lineItems.length ? (
        lineItems.map((line) => (
          <div
            className="rounded-2xl border border-border bg-surface p-4"
            key={line.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">
                  {line.claimSubType?.name ?? line.claimType?.name}
                </p>
                <p className="text-sm text-muted">
                  {line.vendor ?? "No vendor"} /{" "}
                  {line.transactionDate.slice(0, 10)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-semibold">
                  {line.currencyCode} {line.amount}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => startEdit(line.id)}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemove(line.id)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))
      ) : (
        <EmptyState
          title="No claim lines yet"
          description="Add a claim line below to record an expense against this claim."
        />
      )}

      {claimTypesError ? (
        <EmptyState
          title="Claim types are unavailable"
          description="Ask an administrator to grant access to claim types before adding a new line."
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Claim type"
              required
              value={draft.claimTypeId}
              options={activeClaimTypes.map((type) => ({
                value: type.id,
                label: type.name,
              }))}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  claimTypeId: value,
                  claimSubTypeId: "",
                }))
              }
            />
            <SelectField
              label="Claim subtype"
              value={draft.claimSubTypeId}
              disabled={!subTypeOptions.length}
              options={subTypeOptions.map((subType) => ({
                value: subType.id,
                label: subType.name,
              }))}
              onChange={(value) =>
                setDraft((current) => ({ ...current, claimSubTypeId: value }))
              }
            />
            <DateField
              label="Transaction date"
              required
              value={draft.transactionDate}
              onChange={(value) =>
                setDraft((current) => ({ ...current, transactionDate: value }))
              }
            />
            <NumberField
              label="Amount"
              required
              min={0.01}
              step={0.01}
              value={draft.amount === "" ? null : Number(draft.amount)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  amount: value === null ? "" : String(value),
                }))
              }
            />
            <TextField
              label="Vendor"
              value={draft.vendor}
              maxLength={160}
              onChange={(value) =>
                setDraft((current) => ({ ...current, vendor: value }))
              }
            />
            <TextField
              label="Description"
              value={draft.description}
              maxLength={1000}
              onChange={(value) =>
                setDraft((current) => ({ ...current, description: value }))
              }
            />
            <ReceiptDocumentField
              value={draft.receiptDocumentId}
              required={requireReceipt}
              onChange={(value) =>
                setDraft((current) => ({ ...current, receiptDocumentId: value }))
              }
            />
          </div>

          {errors.length ? (
            <ul className="mt-3 list-inside list-disc text-sm text-danger">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" loading={busy} onClick={handleSubmit}>
              {editingLineItemId ? "Save line" : "Add line"}
            </Button>
            {editingLineItemId ? (
              <Button
                type="button"
                variant="secondary"
                onClick={resetDraft}
                disabled={busy}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptDocumentField({
  value,
  required,
  onChange,
}: {
  value: string;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<LookupOption[]>([]);

  async function search(query: string) {
    const response = await fetch(
      `/api/documents?pageSize=20${query ? `&title=${encodeURIComponent(query)}` : ""}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) return;
    setOptions(toLookupOptions(await response.json()));
  }

  return (
    <LookupField
      label="Receipt document"
      required={required}
      value={value}
      options={options}
      onChange={onChange}
      onSearch={search}
      placeholder="Search uploaded documents"
    />
  );
}
