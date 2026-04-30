"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

type SourceCategory =
  | "EARNING"
  | "ALLOWANCE"
  | "REIMBURSEMENT"
  | "DEDUCTION"
  | "TAX"
  | "EMPLOYER_CONTRIBUTION"
  | "ADJUSTMENT";

export type GlAccountOption = { id: string; code: string; name: string; isActive: boolean };
export type PayComponentOption = { id: string; code: string; name: string; isActive: boolean };
export type TaxRuleOption = { id: string; code: string; name: string; isActive: boolean };

export type PostingRuleRecord = {
  id: string;
  name: string;
  description?: string | null;
  sourceCategory: SourceCategory;
  payComponentId?: string | null;
  taxRuleId?: string | null;
  debitAccountId?: string | null;
  creditAccountId?: string | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  payComponent?: PayComponentOption | null;
  taxRule?: TaxRuleOption | null;
  debitAccount?: GlAccountOption | null;
  creditAccount?: GlAccountOption | null;
};

const categories: SourceCategory[] = ["EARNING", "ALLOWANCE", "REIMBURSEMENT", "DEDUCTION", "TAX", "EMPLOYER_CONTRIBUTION", "ADJUSTMENT"];

const emptyForm = {
  name: "",
  description: "",
  sourceCategory: "EARNING" as SourceCategory,
  payComponentId: "",
  taxRuleId: "",
  debitAccountId: "",
  creditAccountId: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  isActive: true,
};

export function PostingRulesManager({
  accounts,
  canManage,
  payComponents,
  rules,
  taxRules,
}: {
  accounts: GlAccountOption[];
  canManage: boolean;
  payComponents: PayComponentOption[];
  rules: PostingRuleRecord[];
  taxRules: TaxRuleOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PostingRuleRecord | null>(null);
  const [deactivating, setDeactivating] = useState<PostingRuleRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = useMemo<DataTableColumn<PostingRuleRecord>[]>(
    () => [
      { key: "name", header: "Rule", sortable: true, searchable: true, render: (rule) => <div><p className="font-semibold text-foreground">{rule.name}</p><p className="text-xs text-muted">{rule.sourceCategory}</p></div> },
      { key: "specificity", header: "Specificity", searchable: true, render: (rule) => rule.payComponent ? `Component: ${rule.payComponent.code}` : rule.taxRule ? `Tax: ${rule.taxRule.code}` : "Category default" },
      { key: "debit", header: "Debit", render: (rule) => rule.debitAccount ? `${rule.debitAccount.code} / ${rule.debitAccount.name}` : "Missing" },
      { key: "credit", header: "Credit", render: (rule) => rule.creditAccount ? `${rule.creditAccount.code} / ${rule.creditAccount.name}` : "Missing" },
      { key: "effectiveFrom", header: "Effective", sortable: true, sortAccessor: (rule) => new Date(rule.effectiveFrom), render: (rule) => `${new Date(rule.effectiveFrom).toLocaleDateString()}${rule.effectiveTo ? ` - ${new Date(rule.effectiveTo).toLocaleDateString()}` : ""}` },
      { key: "status", header: "Status", render: (rule) => (rule.isActive ? "Active" : "Inactive") },
      {
        key: "actions",
        header: "",
        render: (rule) => canManage ? (
          <div className="flex justify-end gap-2">
            <button className="text-sm font-medium text-accent" onClick={() => startEdit(rule)} type="button">Edit</button>
            {rule.isActive ? <button className="text-sm font-medium text-red-700" onClick={() => setDeactivating(rule)} type="button">Deactivate</button> : null}
          </div>
        ) : null,
      },
    ],
    [canManage],
  );

  function startEdit(rule: PostingRuleRecord) {
    setEditing(rule);
    setError(null);
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      sourceCategory: rule.sourceCategory,
      payComponentId: rule.payComponentId ?? "",
      taxRuleId: rule.taxRuleId ?? "",
      debitAccountId: rule.debitAccountId ?? "",
      creditAccountId: rule.creditAccountId ?? "",
      effectiveFrom: new Date(rule.effectiveFrom).toISOString().slice(0, 10),
      effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo).toISOString().slice(0, 10) : "",
      isActive: rule.isActive,
    });
  }

  function reset() {
    setEditing(null);
    setError(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.debitAccountId || !form.creditAccountId) {
      setError("Name, debit account, and credit account are required.");
      return;
    }
    if (form.debitAccountId === form.creditAccountId) {
      setError("Debit and credit accounts must be different.");
      return;
    }
    if (form.effectiveTo && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) {
      setError("Effective to must be greater than or equal to effective from.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(editing ? `/api/payroll/posting-rules/${editing.id}` : "/api/payroll/posting-rules", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        description: form.description || null,
        payComponentId: form.payComponentId || null,
        taxRuleId: form.taxRuleId || null,
        effectiveTo: form.effectiveTo || null,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message ?? "Unable to save posting rule.");
      return;
    }
    reset();
    router.refresh();
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/posting-rules/${deactivating.id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message ?? "Unable to deactivate posting rule.");
      return;
    }
    setDeactivating(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {canManage ? (
        <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm" onSubmit={submit}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">{editing ? "Edit rule" : "Create rule"}</p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">Payroll posting logic</h3>
            </div>
            {editing ? <button className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted" onClick={reset} type="button">New rule</button> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Name"><input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Source category"><select className={inputClassName} value={form.sourceCategory} onChange={(event) => setForm((current) => ({ ...current, sourceCategory: event.target.value as SourceCategory }))}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
            <Field label="Pay component"><select className={inputClassName} value={form.payComponentId} onChange={(event) => setForm((current) => ({ ...current, payComponentId: event.target.value, taxRuleId: event.target.value ? "" : current.taxRuleId }))}><option value="">Category default</option>{payComponents.map((component) => <option key={component.id} value={component.id}>{component.code} / {component.name}</option>)}</select></Field>
            <Field label="Tax rule"><select className={inputClassName} value={form.taxRuleId} onChange={(event) => setForm((current) => ({ ...current, taxRuleId: event.target.value, payComponentId: event.target.value ? "" : current.payComponentId }))}><option value="">Category default</option>{taxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.code} / {rule.name}</option>)}</select></Field>
            <Field label="Debit account"><select className={inputClassName} value={form.debitAccountId} onChange={(event) => setForm((current) => ({ ...current, debitAccountId: event.target.value }))}><option value="">Select debit</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} / {account.name}</option>)}</select></Field>
            <Field label="Credit account"><select className={inputClassName} value={form.creditAccountId} onChange={(event) => setForm((current) => ({ ...current, creditAccountId: event.target.value }))}><option value="">Select credit</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} / {account.name}</option>)}</select></Field>
            <Field label="Effective from"><input className={inputClassName} type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></Field>
            <Field label="Effective to"><input className={inputClassName} type="date" value={form.effectiveTo} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} /></Field>
            <label className="flex items-end gap-3 pb-3 text-sm font-medium text-foreground"><input checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />Active</label>
            <Field label="Description" className="md:col-span-3"><input className={inputClassName} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button className="w-fit rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={busy} type="submit">{busy ? "Saving..." : editing ? "Save rule" : "Create rule"}</button>
        </form>
      ) : null}
      <DataTable columns={columns} getRowKey={(rule) => rule.id} rows={rules} searchPlaceholder="Search posting rules" />
      <ConfirmDialog
        confirmAction={{ label: "Deactivate", onClick: deactivate, variant: "danger" }}
        description="The rule will stop being used for future journal generation."
        isLoading={busy}
        onClose={() => setDeactivating(null)}
        open={Boolean(deactivating)}
        title={`Deactivate ${deactivating?.name ?? "posting rule"}?`}
      />
    </div>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return <label className={`grid gap-2 text-sm ${className ?? ""}`}><span className="font-medium text-foreground">{label}</span>{children}</label>;
}

const inputClassName = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
