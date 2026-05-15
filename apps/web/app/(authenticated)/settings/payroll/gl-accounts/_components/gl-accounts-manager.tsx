"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

export type GlAccountRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  accountType: "ASSET" | "LIABILITY" | "EXPENSE" | "EQUITY" | "REVENUE";
  isActive: boolean;
};

const accountTypes: GlAccountRecord["accountType"][] = [
  "ASSET",
  "LIABILITY",
  "EXPENSE",
  "EQUITY",
  "REVENUE",
];

const emptyForm = {
  code: "",
  name: "",
  description: "",
  accountType: "EXPENSE" as GlAccountRecord["accountType"],
  isActive: true,
};

export function GlAccountsManager({
  accounts,
  canManage,
}: {
  accounts: GlAccountRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GlAccountRecord | null>(null);
  const [deactivating, setDeactivating] = useState<GlAccountRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = useMemo<DataTableColumn<GlAccountRecord>[]>(
    () => [
      { key: "code", header: "Code", sortable: true, searchable: true, render: (account) => <span className="font-semibold text-foreground">{account.code}</span> },
      { key: "name", header: "Name", sortable: true, searchable: true, render: (account) => account.name },
      { key: "accountType", header: "Type", sortable: true, render: (account) => account.accountType },
      { key: "isActive", header: "Status", sortable: true, render: (account) => (account.isActive ? "Active" : "Inactive") },
      {
        key: "actions",
        header: "",
        render: (account) =>
          canManage ? (
            <div className="flex justify-end gap-2">
              <button className="text-sm font-medium text-accent" onClick={() => startEdit(account)} type="button">Edit</button>
              {account.isActive ? <button className="text-sm font-medium text-red-700" onClick={() => setDeactivating(account)} type="button">Deactivate</button> : null}
            </div>
          ) : null,
      },
    ],
    [canManage],
  );

  function startEdit(account: GlAccountRecord) {
    setEditing(account);
    setError(null);
    setForm({
      code: account.code,
      name: account.name,
      description: account.description ?? "",
      accountType: account.accountType,
      isActive: account.isActive,
    });
  }

  function reset() {
    setEditing(null);
    setError(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(editing ? `/api/payroll/gl-accounts/${editing.id}` : "/api/payroll/gl-accounts", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message ?? "Unable to save GL account.");
      return;
    }
    reset();
    router.refresh();
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/gl-accounts/${deactivating.id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message ?? "Unable to deactivate GL account.");
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
              <p className="text-sm uppercase tracking-[0.18em] text-muted">{editing ? "Edit account" : "Create account"}</p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">Chart of accounts mapping</h3>
            </div>
            {editing ? <button className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted" onClick={reset} type="button">New account</button> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Code"><input className={inputClassName} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/\s+/g, "_") }))} /></Field>
            <Field label="Name"><input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Type">
              <select className={inputClassName} value={form.accountType} onChange={(event) => setForm((current) => ({ ...current, accountType: event.target.value as GlAccountRecord["accountType"] }))}>
                {accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <label className="flex items-end gap-3 pb-3 text-sm font-medium text-foreground">
              <input checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
              Active
            </label>
            <Field label="Description" className="md:col-span-4"><input className={inputClassName} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button className="w-fit rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={busy} type="submit">{busy ? "Saving..." : editing ? "Save account" : "Create account"}</button>
        </form>
      ) : null}
      <DataTable columns={columns} getRowKey={(account) => account.id} rows={accounts} searchPlaceholder="Search GL accounts" />
      <ConfirmDialog
        confirmAction={{ label: "Deactivate", onClick: deactivate, variant: "danger" }}
        description="Accounts used by active posting rules cannot be deactivated."
        isLoading={busy}
        onClose={() => setDeactivating(null)}
        open={Boolean(deactivating)}
        title={`Deactivate ${deactivating?.code ?? "account"}?`}
      />
    </div>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return <label className={`grid gap-2 text-sm ${className ?? ""}`}><span className="font-medium text-foreground">{label}</span>{children}</label>;
}

const inputClassName = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
