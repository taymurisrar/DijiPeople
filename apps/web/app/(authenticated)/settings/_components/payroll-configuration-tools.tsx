"use client";

import { useCallback, useEffect, useState } from "react";

type RuntimeRecord = Readonly<Record<string, unknown>>;

type TaxBracket = {
  id: string;
  sequence: number;
  lowerLimit?: string | number | null;
  upperLimit?: string | number | null;
  ratePercentage?: string | number | null;
  baseTax?: string | number | null;
  status?: string | null;
};

type TaxBracketResponse = {
  items?: TaxBracket[];
  warnings?: string[];
};

type TaxPreviewResponse = {
  taxableIncome?: string;
  employeeTax?: string;
  employerTax?: string;
  baseTax?: string;
  marginalTax?: string;
  appliedBracket?: TaxBracket | null;
  warnings?: string[];
};

type PostingRuleSummary = {
  id?: string;
  name?: string;
  code?: string;
  debitAccount?: { name?: string; accountNumber?: string; code?: string } | null;
  creditAccount?: { name?: string; accountNumber?: string; code?: string } | null;
};

type PostingPreviewResponse = {
  selectedRule?: PostingRuleSummary | null;
  selectedScore?: number | null;
  candidates?: Array<{ rule?: PostingRuleSummary; score?: number }>;
  conflicts?: Array<{ rule?: PostingRuleSummary; score?: number }>;
};

type EmployeeOption = {
  id: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
};

type PackageAssignment = {
  id: string;
  employeeId?: string | null;
  employeeName?: string | null;
  employeeCode?: string | null;
  effectiveFrom?: string | null;
  status?: string | null;
  baseAmount?: string | number | null;
  grossAmount?: string | number | null;
  currencyCode?: string | null;
};

export function CompensationPackageAssignment({
  recordId,
  currencyCode,
  payFrequency,
}: {
  readonly recordId?: string;
  readonly currencyCode?: string;
  readonly payFrequency?: string;
}) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assignments, setAssignments] = useState<PackageAssignment[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayDate());
  const [baseAmount, setBaseAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!recordId) return;
    setError("");
    const [employeeResponse, assignmentResponse] = await Promise.all([
      fetch("/api/employees?page=1&pageSize=100", {
        credentials: "include",
      }),
      fetch(
        `/api/salary-package-rules/${encodeURIComponent(recordId)}/assignments`,
        { credentials: "include" },
      ),
    ]);
    const employeeBody = (await employeeResponse.json().catch(() => null)) as
      | { items?: EmployeeOption[]; data?: EmployeeOption[] }
      | EmployeeOption[]
      | { message?: string }
      | null;
    const assignmentBody = (await assignmentResponse.json().catch(() => null)) as
      | { items?: PackageAssignment[]; data?: PackageAssignment[] }
      | PackageAssignment[]
      | { message?: string }
      | null;
    if (!employeeResponse.ok) {
      setError(readApiMessage(employeeBody, "Unable to load employees."));
      return;
    }
    if (!assignmentResponse.ok) {
      setError(readApiMessage(assignmentBody, "Unable to load assignments."));
      return;
    }
    const nextEmployees = readItems<EmployeeOption>(employeeBody);
    setEmployees(nextEmployees);
    setEmployeeId((current) => current || nextEmployees[0]?.id || "");
    setAssignments(readItems<PackageAssignment>(assignmentBody));
  }, [recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!recordId) {
    return <SaveFirstNotice action="assign it to employees" />;
  }

  async function assign() {
    if (!employeeId || !effectiveFrom) return;
    setLoading(true);
    setError("");
    setMessage("");
    const response = await fetch(
      `/api/employees/${encodeURIComponent(employeeId)}/compensation-history/assign-package`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryPackageRuleId: recordId,
          effectiveFrom,
          payFrequency: payFrequency || undefined,
          baseAmount: baseAmount || undefined,
          status: "ACTIVE",
          changeReason: "Assigned from the compensation package workspace",
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    setLoading(false);
    if (!response.ok) {
      setError(readApiMessage(body, "Unable to assign the compensation package."));
      return;
    }
    setMessage("Compensation package assigned and snapshotted for payroll.");
    setBaseAmount("");
    await load();
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-white p-4">
      <h3 className="font-semibold text-foreground">Assign to employee</h3>
      <p className="mt-1 text-sm text-muted">
        Creates an effective-dated employee compensation snapshot from this package. Payroll runs use that saved snapshot.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium text-foreground">
          Employee
          <select
            className={inputClass}
            onChange={(event) => setEmployeeId(event.target.value)}
            value={employeeId}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employeeLabel(employee)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          Effective from
          <input
            className={inputClass}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
            type="date"
            value={effectiveFrom}
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Base amount ({currencyCode || "package currency"})
          <input
            className={inputClass}
            min="0"
            onChange={(event) => setBaseAmount(event.target.value)}
            placeholder="Use package calculation"
            step="0.01"
            type="number"
            value={baseAmount}
          />
        </label>
        <button
          className={primaryButtonClass}
          disabled={loading || !employeeId || !effectiveFrom}
          onClick={() => void assign()}
          type="button"
        >
          {loading ? "Assigning…" : "Assign package"}
        </button>
      </div>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      {message ? <InlineMessage tone="success" message={message} /> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Effective from</th>
              <th className="px-3 py-2">Base amount</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td className="px-3 py-2">
                  {assignment.employeeName || assignment.employeeCode || assignment.employeeId || "Employee"}
                </td>
                <td className="px-3 py-2">{displayDate(assignment.effectiveFrom)}</td>
                <td className="px-3 py-2">
                  {formatMoney(
                    assignment.grossAmount ?? assignment.baseAmount,
                    assignment.currencyCode || currencyCode,
                  )}
                </td>
                <td className="px-3 py-2">{friendlyEnum(assignment.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!assignments.length ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-muted">
            No employees are assigned to this package yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function TaxSlabManager({ recordId }: { readonly recordId?: string }) {
  const [brackets, setBrackets] = useState<TaxBracket[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!recordId) return;
    setError("");
    const response = await fetch(
      `/api/tax-rules/${encodeURIComponent(recordId)}/brackets`,
      { credentials: "include" },
    );
    const body = (await response.json().catch(() => null)) as
      | TaxBracketResponse
      | { message?: string }
      | null;
    if (!response.ok) {
      setError(readApiMessage(body, "Unable to load tax slabs."));
      return;
    }
    const result = body as TaxBracketResponse;
    setBrackets(
      [...(result.items ?? [])].sort(
        (left, right) => left.sequence - right.sequence,
      ),
    );
    setWarnings(result.warnings ?? []);
  }, [recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(index: number, direction: -1 | 1) {
    if (!recordId) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= brackets.length) return;
    const next = [...brackets];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setSaving(true);
    setError("");
    const response = await fetch(
      `/api/tax-rules/${encodeURIComponent(recordId)}/brackets/reorder`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: next.map((item, itemIndex) => ({
            id: item.id,
            sequence: (itemIndex + 1) * 10,
          })),
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | TaxBracketResponse
      | { message?: string }
      | null;
    setSaving(false);
    if (!response.ok) {
      setError(readApiMessage(body, "Unable to reorder tax slabs."));
      await load();
      return;
    }
    const result = body as TaxBracketResponse;
    setBrackets(
      [...(result.items ?? next)].sort(
        (left, right) => left.sequence - right.sequence,
      ),
    );
    setWarnings(result.warnings ?? []);
  }

  if (!recordId) {
    return <SaveFirstNotice action="manage and reorder tax slabs" />;
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Slab order and validation</h3>
          <p className="mt-1 text-sm text-muted">
            Move slabs without editing their values. Overlaps are blocked; gaps and a missing open-ended final slab are shown as warnings.
          </p>
        </div>
        <button className={secondaryButtonClass} onClick={() => void load()} type="button">
          Refresh slabs
        </button>
      </div>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      {warnings.map((warning) => (
        <InlineMessage key={warning} tone="warning" message={warning} />
      ))}
      {brackets.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Sequence</th>
                <th className="px-3 py-2">Lower</th>
                <th className="px-3 py-2">Upper</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">Base tax</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {brackets.map((bracket, index) => (
                <tr key={bracket.id}>
                  <td className="px-3 py-2">{bracket.sequence}</td>
                  <td className="px-3 py-2">{displayAmount(bracket.lowerLimit)}</td>
                  <td className="px-3 py-2">{displayAmount(bracket.upperLimit, "No limit")}</td>
                  <td className="px-3 py-2">{displayAmount(bracket.ratePercentage)}%</td>
                  <td className="px-3 py-2">{displayAmount(bracket.baseTax)}</td>
                  <td className="px-3 py-2">{friendlyEnum(bracket.status)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        aria-label={`Move slab ${index + 1} up`}
                        className={smallButtonClass}
                        disabled={saving || index === 0}
                        onClick={() => void move(index, -1)}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        aria-label={`Move slab ${index + 1} down`}
                        className={smallButtonClass}
                        disabled={saving || index === brackets.length - 1}
                        onClick={() => void move(index, 1)}
                        type="button"
                      >
                        Down
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-muted">
          No slabs have been added. Use the Slabs related grid above to add the first slab.
        </p>
      )}
    </section>
  );
}

export function TaxCalculationPreview({
  recordId,
  currencyCode,
}: {
  readonly recordId?: string;
  readonly currencyCode?: string;
}) {
  const [taxableIncome, setTaxableIncome] = useState("100000");
  const [result, setResult] = useState<TaxPreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!recordId) return <SaveFirstNotice action="run the tax preview" />;

  async function preview() {
    setLoading(true);
    setError("");
    setResult(null);
    const response = await fetch(
      `/api/tax-rules/${encodeURIComponent(recordId!)}/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxableIncome: Number(taxableIncome) }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | TaxPreviewResponse
      | { message?: string }
      | null;
    setLoading(false);
    if (!response.ok) {
      setError(readApiMessage(body, "Unable to calculate the tax preview."));
      return;
    }
    setResult(body as TaxPreviewResponse);
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-white p-4">
      <h3 className="font-semibold text-foreground">Tax preview calculator</h3>
      <p className="mt-1 text-sm text-muted">
        Validate the saved calculation method and slabs against a taxable amount before assigning the policy.
      </p>
      <div className="mt-3 flex max-w-xl flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-sm font-medium text-foreground">
          Taxable income ({currencyCode || "policy currency"})
          <input
            className={inputClass}
            min="0"
            onChange={(event) => setTaxableIncome(event.target.value)}
            step="0.01"
            type="number"
            value={taxableIncome}
          />
        </label>
        <button
          className={primaryButtonClass}
          disabled={loading || !taxableIncome || Number(taxableIncome) < 0}
          onClick={() => void preview()}
          type="button"
        >
          {loading ? "Calculating…" : "Calculate preview"}
        </button>
      </div>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      {result ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewValue label="Employee tax" value={formatMoney(result.employeeTax, currencyCode)} />
          <PreviewValue label="Employer tax" value={formatMoney(result.employerTax, currencyCode)} />
          <PreviewValue label="Base tax" value={formatMoney(result.baseTax, currencyCode)} />
          <PreviewValue label="Marginal tax" value={formatMoney(result.marginalTax, currencyCode)} />
        </div>
      ) : null}
      {result?.warnings?.map((warning) => (
        <InlineMessage key={warning} tone="warning" message={warning} />
      ))}
    </section>
  );
}

export function PostingRuleResolutionPreview({
  recordId,
  record,
}: {
  readonly recordId?: string;
  readonly record: RuntimeRecord;
}) {
  const [sourceCategory, setSourceCategory] = useState(
    stringValue(record.sourceCategory) || "EARNING",
  );
  const [effectiveDate, setEffectiveDate] = useState(todayDate());
  const [result, setResult] = useState<PostingPreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!recordId) return <SaveFirstNotice action="preview rule resolution" />;

  async function preview() {
    setLoading(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/payroll/posting-rules/preview-resolution", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceCategory,
        effectiveDate,
        ...optionalStringFields(record, [
          "lineCategory",
          "payComponentId",
          "taxRuleId",
          "businessUnitId",
          "departmentId",
          "projectId",
          "payrollRegionId",
          "costCenterId",
          "employmentTypeId",
        ]),
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | PostingPreviewResponse
      | { message?: string }
      | null;
    setLoading(false);
    if (!response.ok) {
      setError(readApiMessage(body, "Unable to preview posting rule resolution."));
      return;
    }
    setResult(body as PostingPreviewResponse);
  }

  const selected = result?.selectedRule;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-white p-4">
      <h3 className="font-semibold text-foreground">Rule-resolution preview</h3>
      <p className="mt-1 text-sm text-muted">
        Resolve the saved criteria by specificity and priority, and expose equal-ranked conflicts before a payroll journal is generated.
      </p>
      <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-medium text-foreground">
          Payroll line type
          <select
            className={inputClass}
            onChange={(event) => setSourceCategory(event.target.value)}
            value={sourceCategory}
          >
            {[
              "EARNING",
              "ALLOWANCE",
              "REIMBURSEMENT",
              "DEDUCTION",
              "TAX",
              "EMPLOYER_CONTRIBUTION",
              "ADJUSTMENT",
            ].map((value) => (
              <option key={value} value={value}>
                {friendlyEnum(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          Effective date
          <input
            className={inputClass}
            onChange={(event) => setEffectiveDate(event.target.value)}
            type="date"
            value={effectiveDate}
          />
        </label>
        <button className={primaryButtonClass} disabled={loading} onClick={() => void preview()} type="button">
          {loading ? "Resolving…" : "Preview resolution"}
        </button>
      </div>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      {result ? (
        <div className="mt-4 rounded-xl border border-border bg-slate-50 p-3 text-sm">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{selected.name || selected.code || "Selected rule"}</strong>
                <span className="rounded-full bg-white px-2 py-1 text-xs text-muted">
                  Score {result.selectedScore ?? "—"}
                </span>
              </div>
              <p className="mt-2 text-muted">
                Debit: {accountLabel(selected.debitAccount)} · Credit: {accountLabel(selected.creditAccount)}
              </p>
              <p className="mt-1 text-muted">
                {result.candidates?.length ?? 0} candidate(s) evaluated.
              </p>
            </>
          ) : (
            <p className="text-muted">No active rule matches these saved criteria.</p>
          )}
          {result.conflicts?.length ? (
            <InlineMessage
              tone="error"
              message={`Conflict: ${result.conflicts
                .map((item) => item.rule?.name || item.rule?.code || "Unnamed rule")
                .join(", ")}`}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SaveFirstNotice({ action }: { readonly action: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-3 text-sm text-muted">
      Save this configuration first, then return to this tab to {action}.
    </div>
  );
}

function PreviewValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-border bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function InlineMessage({
  message,
  tone,
}: {
  readonly message: string;
  readonly tone: "error" | "warning" | "success";
}) {
  return (
    <p
      className={`mt-3 rounded-xl px-3 py-2 text-sm ${
        tone === "error"
          ? "bg-red-50 text-red-700"
          : tone === "success"
            ? "bg-emerald-50 text-emerald-800"
            : "bg-amber-50 text-amber-800"
      }`}
    >
      {message}
    </p>
  );
}

function readItems<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (!body || typeof body !== "object") return [];
  const record = body as { items?: unknown; data?: unknown };
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.data)) return record.data as T[];
  if (record.data && typeof record.data === "object") {
    const nested = record.data as { items?: unknown };
    if (Array.isArray(nested.items)) return nested.items as T[];
  }
  return [];
}

function employeeLabel(employee: EmployeeOption) {
  const name =
    employee.displayName?.trim() ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return [employee.employeeCode, name].filter(Boolean).join(" · ") || employee.id;
}

function displayDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  return value.slice(0, 10);
}

function readApiMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message)) return message.map(String).join(" ");
  }
  return fallback;
}

function optionalStringFields(record: RuntimeRecord, fields: readonly string[]) {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = stringValue(record[field]);
      return value ? [[field, value]] : [];
    }),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function displayAmount(value: unknown, empty = "—") {
  if (value === null || value === undefined || value === "") return empty;
  return String(value);
}

function friendlyEnum(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: unknown, currencyCode?: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return `${currencyCode || ""} ${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`.trim();
}

function accountLabel(account: PostingRuleSummary["debitAccount"]) {
  if (!account) return "Not mapped";
  const code = account.accountNumber || account.code;
  return [code, account.name].filter(Boolean).join(" · ") || "Unnamed account";
}

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const primaryButtonClass =
  "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-slate-50";
const smallButtonClass =
  "rounded-lg border border-border bg-white px-2 py-1 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-40";
