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
  TextAreaField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { CustomFieldsSection } from "@/app/components/runtime/custom-fields-section";
import {
  customFieldErrors,
  customFieldValues,
} from "@/lib/runtime/custom-fields";
import { toLookupOptions } from "@/lib/runtime/custom-lookup-options";
import {
  buildCreateClaimPayload,
  buildLineItemPayload,
  buildUpdateClaimPayload,
  EMPTY_LINE_ITEM_DRAFT,
  hasHeaderChanges,
  isClaimEditable,
  lineItemToDraft,
  type LineItemDraft,
  validateLineItemDraft,
} from "@/lib/runtime/modules/claim-editor";
import { ClaimActions } from "../[claimId]/_components/claim-actions";
import {
  ClaimRecord,
  ClaimSubTypeRecord,
  ClaimTypeRecord,
} from "../claim-types";

type ClaimFormProps = {
  /** "/api/claims" for the admin surface, "/api/me/claims" for self-service. */
  basePath: "/api/claims" | "/api/me/claims";
  /** Where a saved claim is viewed — "/claims" or "/me/claims". */
  detailBasePath: "/claims" | "/me/claims";
  initialClaim?: ClaimRecord;
  /** Admin creation may raise the claim on behalf of another employee. */
  allowEmployeePicker: boolean;
  canEditHeader: boolean;
  canSubmit: boolean;
  canManagerApprove: boolean;
  canPayrollApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
};

type ApiErrorBody = { message?: string; details?: unknown };

export function ClaimForm({
  basePath,
  detailBasePath,
  initialClaim,
  allowEmployeePicker,
  canEditHeader,
  canSubmit,
  canManagerApprove,
  canPayrollApprove,
  canReject,
  canCancel,
}: ClaimFormProps) {
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimRecord | null>(initialClaim ?? null);
  const editable = canEditHeader && isClaimEditable(claim?.status ?? null);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState<LookupOption[]>([]);
  const [title, setTitle] = useState(claim?.title ?? "");
  const [description, setDescription] = useState(claim?.description ?? "");
  const [currencyCode, setCurrencyCode] = useState(claim?.currencyCode ?? "");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    () => customFieldValues(claim),
  );
  const [customFieldErrorsByKey, setCustomFieldErrorsByKey] = useState<
    Record<string, string[]>
  >({});
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);

  const [claimTypes, setClaimTypes] = useState<ClaimTypeRecord[]>([]);
  const [claimTypesError, setClaimTypesError] = useState(false);

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

  const [lineItemDraft, setLineItemDraft] = useState<LineItemDraft>(
    EMPTY_LINE_ITEM_DRAFT,
  );
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(
    null,
  );
  const [lineItemErrors, setLineItemErrors] = useState<string[]>([]);
  const [lineItemBusy, setLineItemBusy] = useState(false);

  const selectedClaimType = activeClaimTypes.find(
    (type) => type.id === lineItemDraft.claimTypeId,
  );
  const subTypeOptions: ClaimSubTypeRecord[] = (
    selectedClaimType?.subTypes ?? []
  ).filter((subType) => subType.isActive);
  const selectedSubType = subTypeOptions.find(
    (subType) => subType.id === lineItemDraft.claimSubTypeId,
  );
  const requireReceipt = selectedSubType?.requiresReceipt ?? false;

  function resetLineItemDraft() {
    setEditingLineItemId(null);
    setLineItemDraft(EMPTY_LINE_ITEM_DRAFT);
    setLineItemErrors([]);
  }

  function startEditLineItem(lineId: string) {
    const line = claim?.lineItems.find((item) => item.id === lineId);
    if (!line) return;
    setEditingLineItemId(lineId);
    setLineItemDraft(lineItemToDraft(line));
    setLineItemErrors([]);
  }

  async function handleSaveHeader() {
    setHeaderError(null);
    setCustomFieldErrorsByKey({});

    if (!claim) {
      if (!title.trim() || !currencyCode.trim()) {
        setHeaderError("Title and currency are required.");
        return;
      }
      setHeaderBusy(true);
      const payload = {
        ...buildCreateClaimPayload({
          employeeId,
          title,
          description,
          currencyCode,
        }),
        customFields,
      };
      const response = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | (ClaimRecord & ApiErrorBody)
        | null;
      setHeaderBusy(false);
      if (!response.ok) {
        setHeaderError(data?.message ?? "Unable to create the claim.");
        setCustomFieldErrorsByKey(customFieldErrors(data?.details) ?? {});
        return;
      }
      if (data) {
        setClaim(data);
        router.replace(`${detailBasePath}/${data.id}/edit`);
      }
      return;
    }

    const headerPayload = buildUpdateClaimPayload(
      { employeeId, title, description, currencyCode },
      claim,
    );
    if (!hasHeaderChanges(headerPayload) && !Object.keys(customFields).length) {
      return;
    }
    setHeaderBusy(true);
    const response = await fetch(`${basePath}/${claim.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...headerPayload, customFields }),
    });
    const data = (await response.json().catch(() => null)) as
      | (ClaimRecord & ApiErrorBody)
      | null;
    setHeaderBusy(false);
    if (!response.ok) {
      setHeaderError(data?.message ?? "Unable to save the claim.");
      setCustomFieldErrorsByKey(customFieldErrors(data?.details) ?? {});
      return;
    }
    if (data) setClaim(data);
  }

  async function handleSubmitLineItem() {
    if (!claim) return;
    const errors = validateLineItemDraft(lineItemDraft, { requireReceipt });
    if (errors.length) {
      setLineItemErrors(errors);
      return;
    }
    setLineItemBusy(true);
    const payload = buildLineItemPayload(lineItemDraft, claim.currencyCode);
    const url = editingLineItemId
      ? `${basePath}/${claim.id}/line-items/${editingLineItemId}`
      : `${basePath}/${claim.id}/line-items`;
    const response = await fetch(url, {
      method: editingLineItemId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as
      | (ClaimRecord & ApiErrorBody)
      | null;
    setLineItemBusy(false);
    if (!response.ok) {
      setLineItemErrors([data?.message ?? "Unable to save the claim line."]);
      return;
    }
    if (data) setClaim(data);
    resetLineItemDraft();
  }

  async function handleRemoveLineItem(lineId: string) {
    if (!claim) return;
    setLineItemBusy(true);
    const response = await fetch(
      `${basePath}/${claim.id}/line-items/${lineId}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => null)) as
      | (ClaimRecord & ApiErrorBody)
      | null;
    setLineItemBusy(false);
    if (!response.ok) {
      setLineItemErrors([data?.message ?? "Unable to remove the claim line."]);
      return;
    }
    if (data) setClaim(data);
    if (editingLineItemId === lineId) resetLineItemDraft();
  }

  async function searchEmployees(query: string) {
    const response = await fetch(
      `/api/employees?pageSize=25${query ? `&search=${encodeURIComponent(query)}` : ""}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) return;
    setEmployeeQuery(toLookupOptions(await response.json()));
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        title={claim ? "Claim details" : "New claim"}
        description={
          editable
            ? undefined
            : claim
              ? `This claim is ${claim.status.replace(/_/g, " ").toLowerCase()} and can no longer be edited.`
              : undefined
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {allowEmployeePicker && !claim ? (
            <LookupField
              label="Employee"
              options={employeeQuery}
              value={employeeId}
              onChange={setEmployeeId}
              onSearch={searchEmployees}
              placeholder="Search for an employee (defaults to you)"
            />
          ) : null}
          <TextField
            label="Title"
            value={title}
            onChange={setTitle}
            disabled={!editable}
            required
            maxLength={180}
          />
          <TextField
            label="Currency code"
            value={currencyCode}
            onChange={(value) => setCurrencyCode(value.toUpperCase())}
            disabled={!editable}
            required
            maxLength={3}
            placeholder="USD"
          />
          <TextAreaField
            className="md:col-span-2"
            label="Description"
            value={description}
            onChange={setDescription}
            disabled={!editable}
          />
        </div>

        {editable ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              loading={headerBusy}
              onClick={handleSaveHeader}
            >
              {claim ? "Save changes" : "Create claim"}
            </Button>
            {headerError ? (
              <p className="text-sm text-danger">{headerError}</p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <CustomFieldsSection
        tableKey="claimRequests"
        value={customFields}
        onChange={setCustomFields}
        errors={customFieldErrorsByKey}
        disabled={!editable}
      />

      {claim ? (
        <SectionCard
          title="Line items"
          description={
            editable
              ? undefined
              : "Line items cannot be changed once the claim leaves draft."
          }
        >
          <div className="grid gap-3">
            {claim.lineItems.length ? (
              claim.lineItems.map((line) => (
                <div
                  className="rounded-2xl border border-border bg-white p-4"
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
                      {editable ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => startEditLineItem(line.id)}
                            disabled={lineItemBusy}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveLineItem(line.id)}
                            disabled={lineItemBusy}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null}
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

            {editable && claimTypesError ? (
              <EmptyState
                title="Claim types are unavailable"
                description="Ask an administrator to grant access to claim types before adding a new line."
              />
            ) : null}

            {editable && !claimTypesError ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Claim type"
                    required
                    value={lineItemDraft.claimTypeId}
                    options={activeClaimTypes.map((type) => ({
                      value: type.id,
                      label: type.name,
                    }))}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        claimTypeId: value,
                        claimSubTypeId: "",
                      }))
                    }
                  />
                  <SelectField
                    label="Claim subtype"
                    value={lineItemDraft.claimSubTypeId}
                    disabled={!subTypeOptions.length}
                    options={subTypeOptions.map((subType) => ({
                      value: subType.id,
                      label: subType.name,
                    }))}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        claimSubTypeId: value,
                      }))
                    }
                  />
                  <DateField
                    label="Transaction date"
                    required
                    value={lineItemDraft.transactionDate}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        transactionDate: value,
                      }))
                    }
                  />
                  <NumberField
                    label="Amount"
                    required
                    min={0.01}
                    step={0.01}
                    value={
                      lineItemDraft.amount === ""
                        ? null
                        : Number(lineItemDraft.amount)
                    }
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        amount: value === null ? "" : String(value),
                      }))
                    }
                  />
                  <TextField
                    label="Vendor"
                    value={lineItemDraft.vendor}
                    maxLength={160}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        vendor: value,
                      }))
                    }
                  />
                  <TextField
                    label="Description"
                    value={lineItemDraft.description}
                    maxLength={1000}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        description: value,
                      }))
                    }
                  />
                  <ReceiptDocumentField
                    value={lineItemDraft.receiptDocumentId}
                    required={requireReceipt}
                    onChange={(value) =>
                      setLineItemDraft((current) => ({
                        ...current,
                        receiptDocumentId: value,
                      }))
                    }
                  />
                </div>

                {lineItemErrors.length ? (
                  <ul className="mt-3 list-inside list-disc text-sm text-danger">
                    {lineItemErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    loading={lineItemBusy}
                    onClick={handleSubmitLineItem}
                  >
                    {editingLineItemId ? "Save line" : "Add line"}
                  </Button>
                  {editingLineItemId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetLineItemDraft}
                      disabled={lineItemBusy}
                    >
                      Cancel edit
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {claim ? (
        <SectionCard title="Actions">
          <ClaimActions
            basePath={basePath}
            claimId={claim.id}
            status={claim.status}
            canSubmit={canSubmit}
            canManagerApprove={canManagerApprove}
            canPayrollApprove={canPayrollApprove}
            canReject={canReject}
            canCancel={canCancel}
            onSuccess={setClaim}
          />
        </SectionCard>
      ) : null}
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
