"use client";

import { ReactNode, useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

export type EmployeeLevelOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type PayComponentOption = {
  id: string;
  code: string;
  name: string;
  componentType: string;
  isActive: boolean;
};

type TaxRuleBracket = {
  id: string;
  minAmount: string;
  maxAmount?: string | null;
  employeeRate?: string | null;
  employerRate?: string | null;
  fixedEmployeeAmount?: string | null;
  fixedEmployerAmount?: string | null;
};

export type TaxRuleRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  taxType: string;
  calculationMethod: string;
  countryCode?: string | null;
  regionCode?: string | null;
  employeeRate?: string | null;
  employerRate?: string | null;
  fixedEmployeeAmount?: string | null;
  fixedEmployerAmount?: string | null;
  currencyCode?: string | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  employeeLevelId?: string | null;
  employeeLevel?: { id: string; code: string; name: string } | null;
  brackets: TaxRuleBracket[];
  payComponents: Array<{
    id: string;
    payComponentId: string;
    payComponent?: { id: string; code: string; name: string } | null;
  }>;
};

type TaxRulesManagerProps = {
  canManage: boolean;
  employeeLevels: EmployeeLevelOption[];
  initialRules: TaxRuleRecord[];
  payComponents: PayComponentOption[];
};

const taxTypes = ["INCOME_TAX", "SOCIAL_SECURITY", "MEDICARE", "OTHER"];
const methods = ["PERCENTAGE", "FIXED", "BRACKET"];

const emptyForm = {
  code: "",
  name: "",
  description: "",
  taxType: "INCOME_TAX",
  calculationMethod: "PERCENTAGE",
  employeeRate: "",
  employerRate: "",
  fixedEmployeeAmount: "",
  fixedEmployerAmount: "",
  currencyCode: "",
  countryCode: "",
  regionCode: "",
  employeeLevelId: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  isActive: true,
};

const emptyBracketForm = {
  minAmount: "",
  maxAmount: "",
  employeeRate: "",
  employerRate: "",
  fixedEmployeeAmount: "",
  fixedEmployerAmount: "",
};

type RuleForm = typeof emptyForm;
type BracketForm = typeof emptyBracketForm;

export function TaxRulesManager({
  canManage,
  employeeLevels,
  initialRules,
  payComponents,
}: TaxRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [bracketForm, setBracketForm] = useState<BracketForm>(emptyBracketForm);
  const [editingBracketId, setEditingBracketId] = useState<string | null>(null);
  const [selectedPayComponentId, setSelectedPayComponentId] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<TaxRuleRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bracketError, setBracketError] = useState<string | null>(null);

  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;
  const mappedComponentIds = new Set(editingRule?.payComponents.map((mapping) => mapping.payComponentId) ?? []);
  const availableComponents = payComponents.filter((component) => !mappedComponentIds.has(component.id));

  const columns = useMemo<DataTableColumn<TaxRuleRecord>[]>(
    () => [
      {
        key: "name",
        header: "Rule",
        sortable: true,
        searchable: true,
        sortAccessor: (rule) => rule.name,
        searchAccessor: (rule) => `${rule.name} ${rule.code}`,
        render: (rule) => (
          <div>
            <p className="font-semibold text-foreground">{rule.name}</p>
            <p className="text-xs text-muted">{rule.code}</p>
          </div>
        ),
      },
      {
        key: "taxType",
        header: "Type",
        sortable: true,
        searchable: true,
        sortAccessor: (rule) => rule.taxType,
        render: (rule) => readable(rule.taxType),
      },
      {
        key: "calculationMethod",
        header: "Method",
        sortable: true,
        sortAccessor: (rule) => rule.calculationMethod,
        render: (rule) => readable(rule.calculationMethod),
      },
      {
        key: "employeeAmount",
        header: "Employee",
        sortable: true,
        sortAccessor: (rule) => Number(rule.employeeRate ?? rule.fixedEmployeeAmount ?? 0),
        render: (rule) => formatRuleAmount(rule, "employee"),
      },
      {
        key: "employerAmount",
        header: "Employer",
        sortable: true,
        sortAccessor: (rule) => Number(rule.employerRate ?? rule.fixedEmployerAmount ?? 0),
        render: (rule) => formatRuleAmount(rule, "employer"),
      },
      {
        key: "effectiveFrom",
        header: "Effective",
        sortable: true,
        sortAccessor: (rule) => new Date(rule.effectiveFrom),
        render: (rule) => (
          <span>
            {formatDate(rule.effectiveFrom)}
            {rule.effectiveTo ? ` - ${formatDate(rule.effectiveTo)}` : ""}
          </span>
        ),
      },
      {
        key: "isActive",
        header: "Status",
        sortable: true,
        sortAccessor: (rule) => rule.isActive,
        render: (rule) => (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {rule.isActive ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        render: (rule) => (
          <div className="flex justify-end gap-2">
            <button
              className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface"
              onClick={() => openEdit(rule)}
              type="button"
            >
              View
            </button>
            {canManage && rule.isActive ? (
              <button
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
                onClick={() => setDeactivateTarget(rule)}
                type="button"
              >
                Deactivate
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [canManage],
  );

  function openCreate() {
    setEditingRuleId(null);
    setForm(emptyForm);
    setError(null);
    setBracketError(null);
  }

  function openEdit(rule: TaxRuleRecord) {
    setEditingRuleId(rule.id);
    setForm({
      code: rule.code,
      name: rule.name,
      description: rule.description ?? "",
      taxType: rule.taxType,
      calculationMethod: rule.calculationMethod,
      employeeRate: rule.employeeRate ?? "",
      employerRate: rule.employerRate ?? "",
      fixedEmployeeAmount: rule.fixedEmployeeAmount ?? "",
      fixedEmployerAmount: rule.fixedEmployerAmount ?? "",
      currencyCode: rule.currencyCode ?? "",
      countryCode: rule.countryCode ?? "",
      regionCode: rule.regionCode ?? "",
      employeeLevelId: rule.employeeLevelId ?? "",
      effectiveFrom: toDateInput(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo ? toDateInput(rule.effectiveTo) : "",
      isActive: rule.isActive,
    });
    setBracketForm(emptyBracketForm);
    setEditingBracketId(null);
    setSelectedPayComponentId("");
    setError(null);
    setBracketError(null);
  }

  async function submitRule() {
    if (!canManage) return;
    const validation = validateRuleForm(form);
    if (validation) {
      setError(validation);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const saved = await requestJson<TaxRuleRecord>(
        editingRule ? `/api/tax-rules/${editingRule.id}` : "/api/tax-rules",
        {
          method: editingRule ? "PATCH" : "POST",
          body: JSON.stringify(toRulePayload(form)),
        },
      );
      setRules((current) =>
        editingRule
          ? current.map((rule) => (rule.id === saved.id ? saved : rule))
          : [saved, ...current],
      );
      openEdit(saved);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitBracket() {
    if (!canManage || !editingRule) return;
    const validation = validateBracketForm(bracketForm, editingRule.brackets, editingBracketId);
    if (validation) {
      setBracketError(validation);
      return;
    }

    setIsSaving(true);
    setBracketError(null);
    try {
      const updated = await requestJson<TaxRuleRecord>(
        editingBracketId
          ? `/api/tax-rules/${editingRule.id}/brackets/${editingBracketId}`
          : `/api/tax-rules/${editingRule.id}/brackets`,
        {
          method: editingBracketId ? "PATCH" : "POST",
          body: JSON.stringify(toBracketPayload(bracketForm)),
        },
      );
      replaceRule(updated);
      setBracketForm(emptyBracketForm);
      setEditingBracketId(null);
    } catch (caught) {
      setBracketError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteBracket(bracketId: string) {
    if (!canManage || !editingRule) return;
    setIsSaving(true);
    setBracketError(null);
    try {
      const updated = await requestJson<TaxRuleRecord>(
        `/api/tax-rules/${editingRule.id}/brackets/${bracketId}`,
        { method: "DELETE" },
      );
      replaceRule(updated);
    } catch (caught) {
      setBracketError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function addPayComponentMapping() {
    if (!canManage || !editingRule || !selectedPayComponentId) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await requestJson<TaxRuleRecord>(
        `/api/tax-rules/${editingRule.id}/pay-components`,
        {
          method: "POST",
          body: JSON.stringify({ payComponentId: selectedPayComponentId }),
        },
      );
      replaceRule(updated);
      setSelectedPayComponentId("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function removePayComponentMapping(payComponentId: string) {
    if (!canManage || !editingRule) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await requestJson<TaxRuleRecord>(
        `/api/tax-rules/${editingRule.id}/pay-components/${payComponentId}`,
        { method: "DELETE" },
      );
      replaceRule(updated);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateRule() {
    if (!deactivateTarget) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await requestJson<TaxRuleRecord>(`/api/tax-rules/${deactivateTarget.id}`, {
        method: "DELETE",
      });
      replaceRule(updated);
      setDeactivateTarget(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  function replaceRule(updated: TaxRuleRecord) {
    setRules((current) => current.map((rule) => (rule.id === updated.id ? updated : rule)));
    if (editingRuleId === updated.id) {
      setEditingRuleId(updated.id);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 rounded-[24px] border border-border bg-surface p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Configured rules</p>
          <p className="text-sm text-muted">
            Rules are effective-dated and can map to specific taxable pay components.
          </p>
        </div>
        {canManage ? (
          <button
            className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={openCreate}
            type="button"
          >
            New tax rule
          </button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        getRowKey={(rule) => rule.id}
        rows={rules}
        searchPlaceholder="Search tax rules"
      />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              {editingRule ? `Edit ${editingRule.code}` : "Create tax rule"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Percentage, fixed, and bracket calculations stay generic and tenant configured.
            </p>
          </div>
          {editingRule ? (
            <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">
              {editingRule.brackets.length} brackets / {editingRule.payComponents.length} mappings
            </span>
          ) : null}
        </div>

        {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input className={inputClassName} disabled={!canManage} value={form.name} onChange={(event) => setFormValue("name", event.target.value)} />
          </Field>
          <Field label="Code">
            <input className={inputClassName} disabled={!canManage || Boolean(editingRule)} value={form.code} onChange={(event) => setFormValue("code", event.target.value.toUpperCase().replace(/\s+/g, "_"))} />
          </Field>
          <Field label="Tax type">
            <select className={inputClassName} disabled={!canManage} value={form.taxType} onChange={(event) => setFormValue("taxType", event.target.value)}>
              {taxTypes.map((type) => <option key={type} value={type}>{readable(type)}</option>)}
            </select>
          </Field>
          <Field label="Calculation method">
            <select className={inputClassName} disabled={!canManage} value={form.calculationMethod} onChange={(event) => setFormValue("calculationMethod", event.target.value)}>
              {methods.map((method) => <option key={method} value={method}>{readable(method)}</option>)}
            </select>
          </Field>
          {form.calculationMethod === "PERCENTAGE" ? (
            <>
              <Field label="Employee rate %">
                <input className={inputClassName} disabled={!canManage} min="0" type="number" value={form.employeeRate} onChange={(event) => setFormValue("employeeRate", event.target.value)} />
              </Field>
              <Field label="Employer rate %">
                <input className={inputClassName} disabled={!canManage} min="0" type="number" value={form.employerRate} onChange={(event) => setFormValue("employerRate", event.target.value)} />
              </Field>
            </>
          ) : null}
          {form.calculationMethod === "FIXED" ? (
            <>
              <Field label="Fixed employee amount">
                <input className={inputClassName} disabled={!canManage} min="0" type="number" value={form.fixedEmployeeAmount} onChange={(event) => setFormValue("fixedEmployeeAmount", event.target.value)} />
              </Field>
              <Field label="Fixed employer amount">
                <input className={inputClassName} disabled={!canManage} min="0" type="number" value={form.fixedEmployerAmount} onChange={(event) => setFormValue("fixedEmployerAmount", event.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="Currency code">
            <input className={inputClassName} disabled={!canManage} maxLength={3} value={form.currencyCode} onChange={(event) => setFormValue("currencyCode", event.target.value.toUpperCase())} />
          </Field>
          <Field label="Employee level">
            <select className={inputClassName} disabled={!canManage} value={form.employeeLevelId} onChange={(event) => setFormValue("employeeLevelId", event.target.value)}>
              <option value="">Tenant default</option>
              {employeeLevels.map((level) => <option key={level.id} value={level.id}>{level.code} / {level.name}</option>)}
            </select>
          </Field>
          <Field label="Country code">
            <input className={inputClassName} disabled={!canManage} value={form.countryCode} onChange={(event) => setFormValue("countryCode", event.target.value.toUpperCase())} />
          </Field>
          <Field label="Region code">
            <input className={inputClassName} disabled={!canManage} value={form.regionCode} onChange={(event) => setFormValue("regionCode", event.target.value.toUpperCase())} />
          </Field>
          <Field label="Effective from">
            <input className={inputClassName} disabled={!canManage} type="date" value={form.effectiveFrom} onChange={(event) => setFormValue("effectiveFrom", event.target.value)} />
          </Field>
          <Field label="Effective to">
            <input className={inputClassName} disabled={!canManage} type="date" value={form.effectiveTo} onChange={(event) => setFormValue("effectiveTo", event.target.value)} />
          </Field>
          <Field className="md:col-span-2" label="Description">
            <textarea className={`${inputClassName} min-h-24`} disabled={!canManage} value={form.description} onChange={(event) => setFormValue("description", event.target.value)} />
          </Field>
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input checked={form.isActive} disabled={!canManage} onChange={(event) => setFormValue("isActive", event.target.checked)} type="checkbox" />
            Active
          </label>
        </div>

        {canManage ? (
          <div className="mt-6 flex justify-end">
            <button
              className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
              disabled={isSaving}
              onClick={submitRule}
              type="button"
            >
              {isSaving ? "Saving..." : editingRule ? "Save changes" : "Create rule"}
            </button>
          </div>
        ) : null}
      </section>

      {editingRule ? (
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <BracketManager
            bracketError={bracketError}
            bracketForm={bracketForm}
            canManage={canManage}
            editingBracketId={editingBracketId}
            isSaving={isSaving}
            onDeleteBracket={deleteBracket}
            onEditBracket={(bracket) => {
              setEditingBracketId(bracket.id);
              setBracketForm({
                minAmount: bracket.minAmount,
                maxAmount: bracket.maxAmount ?? "",
                employeeRate: bracket.employeeRate ?? "",
                employerRate: bracket.employerRate ?? "",
                fixedEmployeeAmount: bracket.fixedEmployeeAmount ?? "",
                fixedEmployerAmount: bracket.fixedEmployerAmount ?? "",
              });
              setBracketError(null);
            }}
            onReset={() => {
              setEditingBracketId(null);
              setBracketForm(emptyBracketForm);
              setBracketError(null);
            }}
            onSubmit={submitBracket}
            onUpdateForm={(key, value) => setBracketForm((current) => ({ ...current, [key]: value }))}
            rule={editingRule}
          />

          <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-foreground">Pay component mappings</h3>
            <p className="mt-1 text-sm text-muted">
              When mappings exist, taxable base is calculated only from these components.
            </p>
            <div className="mt-5 grid gap-3">
              {editingRule.payComponents.length ? (
                editingRule.payComponents.map((mapping) => (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3 text-sm" key={mapping.id}>
                    <span>
                      <span className="font-medium text-foreground">{mapping.payComponent?.code ?? mapping.payComponentId}</span>{" "}
                      <span className="text-muted">{mapping.payComponent?.name}</span>
                    </span>
                    {canManage ? (
                      <button className="text-sm font-medium text-red-700" onClick={() => removePayComponentMapping(mapping.payComponentId)} type="button">
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-sm text-muted">
                  No mappings. Taxable base falls back to payroll lines marked taxable.
                </p>
              )}
            </div>
            {canManage ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <select className={inputClassName} value={selectedPayComponentId} onChange={(event) => setSelectedPayComponentId(event.target.value)}>
                  <option value="">Select pay component</option>
                  {availableComponents.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.code} / {component.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-60"
                  disabled={isSaving || !selectedPayComponentId}
                  onClick={addPayComponentMapping}
                  type="button"
                >
                  Add
                </button>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      <ConfirmDialog
        confirmAction={{ label: "Deactivate", onClick: deactivateRule, variant: "danger" }}
        description="This keeps the tax rule history intact. Rules used by approved, paid, or locked payroll cannot be deactivated."
        isLoading={isSaving}
        onClose={() => setDeactivateTarget(null)}
        open={Boolean(deactivateTarget)}
        title={`Deactivate ${deactivateTarget?.code ?? "tax rule"}?`}
      />
    </div>
  );

  function setFormValue<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function BracketManager({
  bracketError,
  bracketForm,
  canManage,
  editingBracketId,
  isSaving,
  onDeleteBracket,
  onEditBracket,
  onReset,
  onSubmit,
  onUpdateForm,
  rule,
}: {
  bracketError: string | null;
  bracketForm: BracketForm;
  canManage: boolean;
  editingBracketId: string | null;
  isSaving: boolean;
  onDeleteBracket: (bracketId: string) => void;
  onEditBracket: (bracket: TaxRuleBracket) => void;
  onReset: () => void;
  onSubmit: () => void;
  onUpdateForm: (key: keyof BracketForm, value: string) => void;
  rule: TaxRuleRecord;
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-foreground">Bracket manager</h3>
      <p className="mt-1 text-sm text-muted">
        Used when calculation method is bracket. Ranges cannot overlap; the final bracket may have no max.
      </p>
      {rule.calculationMethod !== "BRACKET" ? (
        <p className="mt-5 rounded-2xl border border-border bg-white p-4 text-sm text-muted">
          Switch this tax rule to bracket calculation to use bracket ranges.
        </p>
      ) : (
        <>
          {bracketError ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{bracketError}</p> : null}
          <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Range</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Employer</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rule.brackets.length ? rule.brackets.map((bracket) => (
                  <tr key={bracket.id}>
                    <td className="px-4 py-3">{bracket.minAmount} - {bracket.maxAmount ?? "No max"}</td>
                    <td className="px-4 py-3">{bracket.employeeRate ?? "0"}% / {bracket.fixedEmployeeAmount ?? "0"}</td>
                    <td className="px-4 py-3">{bracket.employerRate ?? "0"}% / {bracket.fixedEmployerAmount ?? "0"}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <button className="font-medium text-accent" onClick={() => onEditBracket(bracket)} type="button">Edit</button>
                          <button className="font-medium text-red-700" onClick={() => onDeleteBracket(bracket.id)} type="button">Delete</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td className="px-4 py-6 text-center text-muted" colSpan={4}>No brackets configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {canManage ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Field label="Min amount"><input className={inputClassName} min="0" type="number" value={bracketForm.minAmount} onChange={(event) => onUpdateForm("minAmount", event.target.value)} /></Field>
              <Field label="Max amount"><input className={inputClassName} min="0" type="number" value={bracketForm.maxAmount} onChange={(event) => onUpdateForm("maxAmount", event.target.value)} /></Field>
              <Field label="Employee rate %"><input className={inputClassName} min="0" type="number" value={bracketForm.employeeRate} onChange={(event) => onUpdateForm("employeeRate", event.target.value)} /></Field>
              <Field label="Employer rate %"><input className={inputClassName} min="0" type="number" value={bracketForm.employerRate} onChange={(event) => onUpdateForm("employerRate", event.target.value)} /></Field>
              <Field label="Fixed employee"><input className={inputClassName} min="0" type="number" value={bracketForm.fixedEmployeeAmount} onChange={(event) => onUpdateForm("fixedEmployeeAmount", event.target.value)} /></Field>
              <Field label="Fixed employer"><input className={inputClassName} min="0" type="number" value={bracketForm.fixedEmployerAmount} onChange={(event) => onUpdateForm("fixedEmployerAmount", event.target.value)} /></Field>
              <div className="flex items-end gap-2 md:col-span-3">
                <button className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60" disabled={isSaving} onClick={onSubmit} type="button">
                  {editingBracketId ? "Update bracket" : "Add bracket"}
                </button>
                {editingBracketId ? (
                  <button className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-surface" onClick={onReset} type="button">
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={`grid gap-2 text-sm ${className ?? ""}`}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClassName = "w-full rounded-2xl border border-border bg-white px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted";

async function requestJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? "Request failed.");
  return payload as T;
}

function toRulePayload(form: RuleForm) {
  return {
    code: form.code,
    name: form.name,
    description: form.description || null,
    taxType: form.taxType,
    calculationMethod: form.calculationMethod,
    employeeRate: form.calculationMethod === "PERCENTAGE" ? toOptionalNumber(form.employeeRate) : null,
    employerRate: form.calculationMethod === "PERCENTAGE" ? toOptionalNumber(form.employerRate) : null,
    fixedEmployeeAmount: form.calculationMethod === "FIXED" ? toOptionalNumber(form.fixedEmployeeAmount) : null,
    fixedEmployerAmount: form.calculationMethod === "FIXED" ? toOptionalNumber(form.fixedEmployerAmount) : null,
    currencyCode: form.currencyCode || null,
    countryCode: form.countryCode || null,
    regionCode: form.regionCode || null,
    employeeLevelId: form.employeeLevelId || null,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo || null,
    isActive: form.isActive,
  };
}

function toBracketPayload(form: BracketForm) {
  return {
    minAmount: Number(form.minAmount),
    maxAmount: form.maxAmount ? Number(form.maxAmount) : null,
    employeeRate: toOptionalNumber(form.employeeRate),
    employerRate: toOptionalNumber(form.employerRate),
    fixedEmployeeAmount: toOptionalNumber(form.fixedEmployeeAmount),
    fixedEmployerAmount: toOptionalNumber(form.fixedEmployerAmount),
  };
}

function validateRuleForm(form: RuleForm) {
  if (!form.name.trim()) return "Name is required.";
  if (!form.code.trim()) return "Code is required.";
  if (!form.effectiveFrom) return "Effective from is required.";
  if (form.effectiveTo && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) {
    return "Effective to must be greater than or equal to effective from.";
  }
  const numericFields = [
    form.employeeRate,
    form.employerRate,
    form.fixedEmployeeAmount,
    form.fixedEmployerAmount,
  ].filter(Boolean);
  if (numericFields.some((value) => Number(value) < 0)) return "Rates and fixed amounts cannot be negative.";
  return null;
}

function validateBracketForm(form: BracketForm, brackets: TaxRuleBracket[], editingBracketId: string | null) {
  if (!form.minAmount) return "Bracket min amount is required.";
  const min = Number(form.minAmount);
  const max = form.maxAmount ? Number(form.maxAmount) : Number.POSITIVE_INFINITY;
  if (Number.isNaN(min) || Number.isNaN(max)) return "Bracket amounts must be valid numbers.";
  if (max <= min) return "Bracket max amount must be greater than min amount.";
  const numbers = [form.employeeRate, form.employerRate, form.fixedEmployeeAmount, form.fixedEmployerAmount].filter(Boolean);
  if (numbers.some((value) => Number(value) < 0)) return "Bracket rates and fixed amounts cannot be negative.";
  const overlaps = brackets
    .filter((bracket) => bracket.id !== editingBracketId)
    .some((bracket) => {
      const start = Number(bracket.minAmount);
      const end = bracket.maxAmount ? Number(bracket.maxAmount) : Number.POSITIVE_INFINITY;
      return min < end && start < max;
    });
  return overlaps ? "Tax brackets cannot overlap." : null;
}

function toOptionalNumber(value: string) {
  return value === "" ? null : Number(value);
}

function formatRuleAmount(rule: TaxRuleRecord, side: "employee" | "employer") {
  if (rule.calculationMethod === "PERCENTAGE") return `${side === "employee" ? rule.employeeRate ?? "0" : rule.employerRate ?? "0"}%`;
  if (rule.calculationMethod === "FIXED") return `${rule.currencyCode ?? ""} ${side === "employee" ? rule.fixedEmployeeAmount ?? "0" : rule.fixedEmployerAmount ?? "0"}`.trim();
  return `${rule.brackets.length} brackets`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function toDateInput(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function readable(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}
