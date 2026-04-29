"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmployeeCompensationHistoryRecord,
  PayComponentRecord,
} from "../types";

type EmployeeCompensationCardProps = {
  activeCompensation: EmployeeCompensationHistoryRecord | null;
  canManage: boolean;
  compensationHistory: EmployeeCompensationHistoryRecord[];
  employeeId: string;
  payComponents: PayComponentRecord[];
};

type HistoryFormState = {
  id: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  payFrequency: EmployeeCompensationHistoryRecord["payFrequency"];
  currencyCode: string;
  baseAmount: string;
  status: EmployeeCompensationHistoryRecord["status"];
  notes: string;
};

type ComponentFormState = {
  historyId: string;
  payComponentId: string;
  amount: string;
  percentage: string;
  isRecurring: boolean;
  displayOrder: string;
};

const emptyHistoryForm: HistoryFormState = {
  id: null,
  effectiveFrom: "",
  effectiveTo: "",
  payFrequency: "MONTHLY",
  currencyCode: "USD",
  baseAmount: "",
  status: "DRAFT",
  notes: "",
};

const payFrequencies: EmployeeCompensationHistoryRecord["payFrequency"][] = [
  "MONTHLY",
  "WEEKLY",
  "BIWEEKLY",
  "DAILY",
  "HOURLY",
];

const statuses: EmployeeCompensationHistoryRecord["status"][] = [
  "DRAFT",
  "ACTIVE",
  "RETIRED",
];

export function EmployeeCompensationCard({
  activeCompensation,
  canManage,
  compensationHistory,
  employeeId,
  payComponents,
}: EmployeeCompensationCardProps) {
  const router = useRouter();
  const [historyForm, setHistoryForm] =
    useState<HistoryFormState>(emptyHistoryForm);
  const [componentForm, setComponentForm] = useState<ComponentFormState>({
    historyId: compensationHistory[0]?.id ?? "",
    payComponentId: payComponents[0]?.id ?? "",
    amount: "",
    percentage: "",
    isRecurring: true,
    displayOrder: "0",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPayComponent = useMemo(
    () =>
      payComponents.find(
        (component) => component.id === componentForm.payComponentId,
      ) ?? null,
    [componentForm.payComponentId, payComponents],
  );

  function editHistory(record: EmployeeCompensationHistoryRecord) {
    setMessage(null);
    setError(null);
    setHistoryForm({
      id: record.id,
      effectiveFrom: record.effectiveFrom.slice(0, 10),
      effectiveTo: record.effectiveTo?.slice(0, 10) ?? "",
      payFrequency: record.payFrequency,
      currencyCode: record.currencyCode,
      baseAmount: record.baseAmount,
      status: record.status,
      notes: record.notes ?? "",
    });
    setComponentForm((current) => ({ ...current, historyId: record.id }));
  }

  function resetHistoryForm() {
    setHistoryForm(emptyHistoryForm);
    setError(null);
    setMessage(null);
  }

  async function submitHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const endpoint = historyForm.id
      ? `/api/employees/${employeeId}/compensation-history/${historyForm.id}`
      : `/api/employees/${employeeId}/compensation-history`;
    const response = await fetch(endpoint, {
      method: historyForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        effectiveFrom: historyForm.effectiveFrom,
        effectiveTo: historyForm.effectiveTo || undefined,
        payFrequency: historyForm.payFrequency,
        currencyCode: historyForm.currencyCode,
        baseAmount: historyForm.baseAmount,
        status: historyForm.status,
        notes: historyForm.notes || undefined,
      }),
    });

    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    setIsSaving(false);

    if (!response.ok) {
      setError(data?.message ?? "Unable to save compensation history.");
      return;
    }

    setMessage("Compensation history saved.");
    resetHistoryForm();
    router.refresh();
  }

  async function submitComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManage ||
      !componentForm.historyId ||
      !componentForm.payComponentId
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch(
      `/api/employees/${employeeId}/compensation-history/${componentForm.historyId}/components`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payComponentId: componentForm.payComponentId,
          amount: componentForm.amount || undefined,
          percentage: componentForm.percentage || undefined,
          isRecurring: componentForm.isRecurring,
          displayOrder: Number(componentForm.displayOrder || 0),
        }),
      },
    );

    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    setIsSaving(false);

    if (!response.ok) {
      setError(data?.message ?? "Unable to add compensation component.");
      return;
    }

    setComponentForm((current) => ({
      ...current,
      amount: "",
      percentage: "",
      displayOrder: "0",
    }));
    setMessage("Compensation component added.");
    router.refresh();
  }

  async function deleteComponent(historyId: string, componentId: string) {
    if (!canManage) return;
    const response = await fetch(
      `/api/employees/${employeeId}/compensation-history/${historyId}/components/${componentId}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to remove compensation component.");
      return;
    }

    setMessage("Compensation component removed.");
    router.refresh();
  }

  return (
    <section className="grid gap-6">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Payroll / Compensation
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Componentized compensation
            </h2>
            <p className="mt-2 text-sm text-muted">
              Active compensation and its recurring components are read from the
              new effective-dated compensation history APIs.
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {canManage ? "Manage" : "Read only"}
          </span>
        </div>

        {activeCompensation ? (
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <SummaryItem label="Status" value={activeCompensation.status} />
            <SummaryItem
              label="Base amount"
              value={`${activeCompensation.currencyCode} ${activeCompensation.baseAmount}`}
            />
            <SummaryItem
              label="Frequency"
              value={activeCompensation.payFrequency}
            />
            <SummaryItem
              label="Effective from"
              value={formatDate(activeCompensation.effectiveFrom)}
            />
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-border bg-white/70 p-5 text-sm text-muted">
            No active compensation record is available for today.
          </p>
        )}
      </article>

      {canManage ? (
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                {historyForm.id ? "Edit history" : "Create history"}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-foreground">
                Compensation record
              </h3>
            </div>
            {historyForm.id ? (
              <button
                className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted"
                onClick={resetHistoryForm}
                type="button"
              >
                New record
              </button>
            ) : null}
          </div>

          <form
            className="mt-5 grid gap-4 md:grid-cols-3"
            onSubmit={submitHistory}
          >
            <TextField
              label="Effective from"
              required
              type="date"
              value={historyForm.effectiveFrom}
              onChange={(effectiveFrom) =>
                setHistoryForm((current) => ({ ...current, effectiveFrom }))
              }
            />
            <TextField
              label="Effective to"
              type="date"
              value={historyForm.effectiveTo}
              onChange={(effectiveTo) =>
                setHistoryForm((current) => ({ ...current, effectiveTo }))
              }
            />
            <SelectField
              label="Pay frequency"
              value={historyForm.payFrequency}
              values={payFrequencies}
              onChange={(payFrequency) =>
                setHistoryForm((current) => ({
                  ...current,
                  payFrequency:
                    payFrequency as EmployeeCompensationHistoryRecord["payFrequency"],
                }))
              }
            />
            <TextField
              label="Currency"
              maxLength={3}
              required
              value={historyForm.currencyCode}
              onChange={(currencyCode) =>
                setHistoryForm((current) => ({ ...current, currencyCode }))
              }
            />
            <TextField
              label="Base amount"
              required
              type="number"
              value={historyForm.baseAmount}
              onChange={(baseAmount) =>
                setHistoryForm((current) => ({ ...current, baseAmount }))
              }
            />
            <SelectField
              label="Status"
              value={historyForm.status}
              values={statuses}
              onChange={(status) =>
                setHistoryForm((current) => ({
                  ...current,
                  status: status as EmployeeCompensationHistoryRecord["status"],
                }))
              }
            />
            <div className="md:col-span-3">
              <TextField
                label="Notes"
                value={historyForm.notes}
                onChange={(notes) =>
                  setHistoryForm((current) => ({ ...current, notes }))
                }
              />
            </div>
            <div className="md:col-span-3">
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving
                  ? "Saving..."
                  : historyForm.id
                    ? "Save record"
                    : "Create record"}
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {canManage && compensationHistory.length > 0 ? (
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Add component
          </p>
          <form
            className="mt-5 grid gap-4 md:grid-cols-3"
            onSubmit={submitComponent}
          >
            <SelectField
              label="History record"
              value={componentForm.historyId}
              values={compensationHistory.map((record) => record.id)}
              getLabel={(id) => {
                const record = compensationHistory.find(
                  (item) => item.id === id,
                );
                return record
                  ? `${record.status} / ${formatDate(record.effectiveFrom)} / ${record.currencyCode} ${record.baseAmount}`
                  : id;
              }}
              onChange={(historyId) =>
                setComponentForm((current) => ({ ...current, historyId }))
              }
            />
            <SelectField
              label="Pay component"
              value={componentForm.payComponentId}
              values={payComponents.map((component) => component.id)}
              getLabel={(id) =>
                payComponents.find((component) => component.id === id)?.name ??
                id
              }
              onChange={(payComponentId) =>
                setComponentForm((current) => ({ ...current, payComponentId }))
              }
            />
            <TextField
              label="Display order"
              type="number"
              value={componentForm.displayOrder}
              onChange={(displayOrder) =>
                setComponentForm((current) => ({ ...current, displayOrder }))
              }
            />
            <TextField
              label="Amount"
              required={selectedPayComponent?.calculationMethod === "FIXED"}
              type="number"
              value={componentForm.amount}
              onChange={(amount) =>
                setComponentForm((current) => ({ ...current, amount }))
              }
            />
            <TextField
              label="Percentage"
              required={
                selectedPayComponent?.calculationMethod === "PERCENTAGE"
              }
              type="number"
              value={componentForm.percentage}
              onChange={(percentage) =>
                setComponentForm((current) => ({ ...current, percentage }))
              }
            />
            <label className="flex items-center gap-3 pt-8 text-sm font-medium text-foreground">
              <input
                checked={componentForm.isRecurring}
                className="h-4 w-4 rounded border-border"
                onChange={(event) =>
                  setComponentForm((current) => ({
                    ...current,
                    isRecurring: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Recurring
            </label>
            <div className="md:col-span-3">
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
                disabled={isSaving || payComponents.length === 0}
                type="submit"
              >
                Add component
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {(message || error) && (
        <p className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {error ?? message}
        </p>
      )}

      <div className="grid gap-4">
        {compensationHistory.length === 0 ? (
          <article className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted">
            No compensation history has been recorded yet.
          </article>
        ) : (
          compensationHistory.map((record) => (
            <article
              className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
              key={record.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">
                    {record.status}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    {record.currencyCode} {record.baseAmount} /{" "}
                    {record.payFrequency}
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {formatDate(record.effectiveFrom)} to{" "}
                    {record.effectiveTo
                      ? formatDate(record.effectiveTo)
                      : "Open ended"}
                  </p>
                </div>
                {canManage ? (
                  <button
                    className="text-sm font-medium text-accent transition hover:text-accent-strong"
                    onClick={() => editHistory(record)}
                    type="button"
                  >
                    Edit
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3">
                {record.components.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border bg-white/70 p-4 text-sm text-muted">
                    No components assigned to this compensation record.
                  </p>
                ) : (
                  record.components.map((component) => (
                    <div
                      className="grid gap-3 rounded-2xl border border-border bg-white p-4 text-sm md:grid-cols-[1fr_0.8fr_0.8fr_auto]"
                      key={component.id}
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {component.payComponent.name}
                        </p>
                        <p className="text-muted">
                          {component.payComponent.code}
                        </p>
                      </div>
                      <p className="text-muted">
                        {component.calculationMethodSnapshot}
                      </p>
                      <p className="text-muted">
                        {component.amount
                          ? `${record.currencyCode} ${component.amount}`
                          : component.percentage
                            ? `${component.percentage}%`
                            : "Manual/System"}
                      </p>
                      {canManage ? (
                        <button
                          className="text-left text-sm font-medium text-danger"
                          onClick={() =>
                            deleteComponent(record.id, component.id)
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function TextField({
  label,
  maxLength,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        maxLength={maxLength}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        step={type === "number" ? "0.01" : undefined}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  getLabel,
  label,
  onChange,
  value,
  values,
}: {
  getLabel?: (value: string) => string;
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: readonly string[];
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {getLabel ? getLabel(item) : item}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
