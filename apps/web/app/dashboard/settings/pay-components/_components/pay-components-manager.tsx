"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

type PayComponentType =
  | "EARNING"
  | "ALLOWANCE"
  | "REIMBURSEMENT"
  | "DEDUCTION"
  | "TAX"
  | "EMPLOYER_CONTRIBUTION"
  | "ADJUSTMENT";

type CalculationMethod =
  | "FIXED"
  | "PERCENTAGE"
  | "FORMULA"
  | "MANUAL"
  | "SYSTEM_CALCULATED";

export type PayComponentRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  componentType: PayComponentType;
  calculationMethod: CalculationMethod;
  isTaxable: boolean;
  affectsGrossPay: boolean;
  affectsNetPay: boolean;
  isRecurring: boolean;
  requiresApproval: boolean;
  displayOnPayslip: boolean;
  displayOrder: number;
  isActive: boolean;
};

const componentTypes: PayComponentType[] = [
  "EARNING",
  "ALLOWANCE",
  "REIMBURSEMENT",
  "DEDUCTION",
  "TAX",
  "EMPLOYER_CONTRIBUTION",
  "ADJUSTMENT",
];

const calculationMethods: CalculationMethod[] = [
  "FIXED",
  "PERCENTAGE",
  "FORMULA",
  "MANUAL",
  "SYSTEM_CALCULATED",
];

const emptyForm = {
  code: "",
  name: "",
  description: "",
  componentType: "EARNING" as PayComponentType,
  calculationMethod: "FIXED" as CalculationMethod,
  isTaxable: false,
  affectsGrossPay: true,
  affectsNetPay: true,
  isRecurring: false,
  requiresApproval: false,
  displayOnPayslip: true,
  displayOrder: "0",
  isActive: true,
};

export function PayComponentsManager({
  canManage = true,
  components,
}: {
  canManage?: boolean;
  components: PayComponentRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PayComponentRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const columns = useMemo<DataTableColumn<PayComponentRecord>[]>(
    () => [
      {
        key: "code",
        header: "Code",
        sortable: true,
        searchable: true,
        render: (component) => (
          <span className="font-semibold text-foreground">
            {component.code}
          </span>
        ),
      },
      {
        key: "name",
        header: "Name",
        sortable: true,
        searchable: true,
        render: (component) => component.name,
      },
      {
        key: "componentType",
        header: "Type",
        sortable: true,
        render: (component) => component.componentType,
      },
      {
        key: "calculationMethod",
        header: "Method",
        sortable: true,
        render: (component) => component.calculationMethod,
      },
      {
        key: "flags",
        header: "Flags",
        render: (component) =>
          [
            component.isRecurring ? "Recurring" : null,
            component.isTaxable ? "Taxable" : null,
            component.displayOnPayslip ? "Payslip" : null,
          ]
            .filter(Boolean)
            .join(", ") || "None",
      },
      {
        key: "status",
        header: "Status",
        render: (component) => (component.isActive ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (component) =>
          canManage ? (
            <button
              className="text-sm font-medium text-accent transition hover:text-accent-strong"
              onClick={() => startEdit(component)}
              type="button"
            >
              Edit
            </button>
          ) : (
            <span className="text-sm text-muted">Read only</span>
          ),
      },
    ],
    [canManage],
  );

  function startEdit(component: PayComponentRecord) {
    setEditing(component);
    setError(null);
    setForm({
      code: component.code,
      name: component.name,
      description: component.description ?? "",
      componentType: component.componentType,
      calculationMethod: component.calculationMethod,
      isTaxable: component.isTaxable,
      affectsGrossPay: component.affectsGrossPay,
      affectsNetPay: component.affectsNetPay,
      isRecurring: component.isRecurring,
      requiresApproval: component.requiresApproval,
      displayOnPayslip: component.displayOnPayslip,
      displayOrder: String(component.displayOrder),
      isActive: component.isActive,
    });
  }

  function resetForm() {
    setEditing(null);
    setError(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const displayOrder = Number(form.displayOrder);
    if (
      !form.code.trim() ||
      !form.name.trim() ||
      !Number.isInteger(displayOrder)
    ) {
      setError("Code, name, and display order are required.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(
      editing ? `/api/pay-components/${editing.id}` : "/api/pay-components",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          displayOrder,
          description: form.description || undefined,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save pay component.");
      return;
    }

    resetForm();
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {canManage ? (
        <form
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                {editing ? "Edit Component" : "Create Component"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                Payroll line item catalog
              </h3>
            </div>
            {editing ? (
              <button
                className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted"
                onClick={resetForm}
                type="button"
              >
                New component
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Field
              label="Code"
              required
              value={form.code}
              onChange={(code) => setForm((current) => ({ ...current, code }))}
            />
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(name) => setForm((current) => ({ ...current, name }))}
            />
            <SelectField
              label="Type"
              value={form.componentType}
              values={componentTypes}
              onChange={(componentType) =>
                setForm((current) => ({
                  ...current,
                  componentType: componentType as PayComponentType,
                }))
              }
            />
            <SelectField
              label="Method"
              value={form.calculationMethod}
              values={calculationMethods}
              onChange={(calculationMethod) =>
                setForm((current) => ({
                  ...current,
                  calculationMethod: calculationMethod as CalculationMethod,
                }))
              }
            />
            <Field
              label="Display order"
              type="number"
              value={form.displayOrder}
              onChange={(displayOrder) =>
                setForm((current) => ({ ...current, displayOrder }))
              }
            />
            <div className="grid gap-3 md:col-span-3 md:grid-cols-3">
              <CheckField
                label="Taxable"
                checked={form.isTaxable}
                onChange={(isTaxable) =>
                  setForm((current) => ({ ...current, isTaxable }))
                }
              />
              <CheckField
                label="Affects gross pay"
                checked={form.affectsGrossPay}
                onChange={(affectsGrossPay) =>
                  setForm((current) => ({ ...current, affectsGrossPay }))
                }
              />
              <CheckField
                label="Affects net pay"
                checked={form.affectsNetPay}
                onChange={(affectsNetPay) =>
                  setForm((current) => ({ ...current, affectsNetPay }))
                }
              />
              <CheckField
                label="Recurring"
                checked={form.isRecurring}
                onChange={(isRecurring) =>
                  setForm((current) => ({ ...current, isRecurring }))
                }
              />
              <CheckField
                label="Requires approval"
                checked={form.requiresApproval}
                onChange={(requiresApproval) =>
                  setForm((current) => ({ ...current, requiresApproval }))
                }
              />
              <CheckField
                label="Display on payslip"
                checked={form.displayOnPayslip}
                onChange={(displayOnPayslip) =>
                  setForm((current) => ({ ...current, displayOnPayslip }))
                }
              />
              <CheckField
                label="Active"
                checked={form.isActive}
                onChange={(isActive) =>
                  setForm((current) => ({ ...current, isActive }))
                }
              />
            </div>
            <div className="md:col-span-4">
              <Field
                label="Description"
                value={form.description}
                onChange={(description) =>
                  setForm((current) => ({ ...current, description }))
                }
              />
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div>
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Saving..."
                : editing
                  ? "Save component"
                  : "Create component"}
            </button>
          </div>
        </form>
      ) : null}

      <DataTable
        columns={columns}
        emptyState={
          <div className="p-10 text-center text-muted">
            No pay components have been configured yet.
          </div>
        }
        getRowKey={(component) => component.id}
        rows={components}
        searchPlaceholder="Search pay components"
      />
    </div>
  );
}

function Field({
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  value,
  values,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: string[];
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-foreground">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-border"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
