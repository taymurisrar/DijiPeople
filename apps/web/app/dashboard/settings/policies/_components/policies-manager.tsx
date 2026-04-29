"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

type PolicyType = "LEAVE" | "CLAIM" | "TADA" | "PAYROLL" | "TAX";
type PolicyStatus = "DRAFT" | "ACTIVE" | "RETIRED";
type ScopeType =
  | "TENANT"
  | "ORGANIZATION"
  | "BUSINESS_UNIT"
  | "DEPARTMENT"
  | "EMPLOYEE_LEVEL"
  | "EMPLOYEE";

export type PolicyRecord = {
  id: string;
  policyType: PolicyType;
  name: string;
  description: string | null;
  version: number;
  status: PolicyStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export type PolicyAssignmentRecord = {
  id: string;
  policyId: string;
  scopeType: ScopeType;
  scopeId: string | null;
  priority: number;
  isActive: boolean;
  policy?: PolicyRecord;
};

type PolicyFormState = {
  policyType: PolicyType;
  name: string;
  description: string;
  version: string;
  status: PolicyStatus;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
};

type AssignmentFormState = {
  policyId: string;
  scopeType: ScopeType;
  scopeId: string;
  priority: string;
  isActive: boolean;
};

const policyTypes: PolicyType[] = ["LEAVE", "CLAIM", "TADA", "PAYROLL", "TAX"];
const policyStatuses: PolicyStatus[] = ["DRAFT", "ACTIVE", "RETIRED"];
const scopeTypes: ScopeType[] = [
  "TENANT",
  "ORGANIZATION",
  "BUSINESS_UNIT",
  "DEPARTMENT",
  "EMPLOYEE_LEVEL",
  "EMPLOYEE",
];

const emptyPolicyForm: PolicyFormState = {
  policyType: "PAYROLL",
  name: "",
  description: "",
  version: "1",
  status: "DRAFT",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  isActive: true,
};

const emptyAssignmentForm: AssignmentFormState = {
  policyId: "",
  scopeType: "TENANT",
  scopeId: "",
  priority: "0",
  isActive: true,
};

export function PoliciesManager({
  assignments,
  policies,
}: {
  assignments: PolicyAssignmentRecord[];
  policies: PolicyRecord[];
}) {
  const router = useRouter();
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);
  const [policyForm, setPolicyForm] =
    useState<PolicyFormState>(emptyPolicyForm);
  const [assignmentForm, setAssignmentForm] =
    useState<AssignmentFormState>(emptyAssignmentForm);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const policyColumns = useMemo<DataTableColumn<PolicyRecord>[]>(
    () => [
      {
        key: "name",
        header: "Policy",
        sortable: true,
        searchable: true,
        render: (policy) => (
          <div>
            <p className="font-semibold text-foreground">{policy.name}</p>
            <p className="mt-1 text-sm text-muted">
              {policy.policyType} v{policy.version}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (policy) => policy.status,
      },
      {
        key: "effectiveFrom",
        header: "Effective",
        sortable: true,
        render: (policy) =>
          `${formatDate(policy.effectiveFrom)}${
            policy.effectiveTo ? ` - ${formatDate(policy.effectiveTo)}` : ""
          }`,
      },
      {
        key: "active",
        header: "Active",
        render: (policy) => (policy.isActive ? "Yes" : "No"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (policy) => (
          <button
            className="text-sm font-medium text-accent transition hover:text-accent-strong"
            onClick={() => startPolicyEdit(policy)}
            type="button"
          >
            Edit
          </button>
        ),
      },
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const assignmentColumns = useMemo<DataTableColumn<PolicyAssignmentRecord>[]>(
    () => [
      {
        key: "policy",
        header: "Policy",
        searchable: true,
        render: (assignment) => assignment.policy?.name ?? assignment.policyId,
      },
      {
        key: "scopeType",
        header: "Scope",
        sortable: true,
        render: (assignment) => assignment.scopeType,
      },
      {
        key: "scopeId",
        header: "Scope ID",
        render: (assignment) => assignment.scopeId ?? "Tenant default",
      },
      {
        key: "priority",
        header: "Priority",
        sortable: true,
        render: (assignment) => assignment.priority,
      },
      {
        key: "status",
        header: "Status",
        render: (assignment) => (assignment.isActive ? "Active" : "Inactive"),
      },
    ],
    [],
  );

  function startPolicyEdit(policy: PolicyRecord) {
    setEditingPolicy(policy);
    setError(null);
    setPolicyForm({
      policyType: policy.policyType,
      name: policy.name,
      description: policy.description ?? "",
      version: String(policy.version),
      status: policy.status,
      effectiveFrom: policy.effectiveFrom.slice(0, 10),
      effectiveTo: policy.effectiveTo?.slice(0, 10) ?? "",
      isActive: policy.isActive,
    });
  }

  function resetPolicyForm() {
    setEditingPolicy(null);
    setError(null);
    setPolicyForm(emptyPolicyForm);
  }

  async function handlePolicySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const version = Number(policyForm.version);
    if (!policyForm.name.trim() || !Number.isInteger(version) || version < 1) {
      setError("Name and a positive version are required.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(
      editingPolicy ? `/api/policies/${editingPolicy.id}` : "/api/policies",
      {
        method: editingPolicy ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policyForm,
          version,
          effectiveTo: policyForm.effectiveTo || undefined,
          description: policyForm.description || undefined,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save policy.");
      return;
    }

    resetPolicyForm();
    router.refresh();
  }

  async function handleAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignmentError(null);

    const priority = Number(assignmentForm.priority);
    if (
      !assignmentForm.policyId ||
      !Number.isInteger(priority) ||
      priority < 0
    ) {
      setAssignmentError("Policy and a non-negative priority are required.");
      return;
    }

    if (
      assignmentForm.scopeType !== "TENANT" &&
      !assignmentForm.scopeId.trim()
    ) {
      setAssignmentError("Scope ID is required for this assignment scope.");
      return;
    }

    setIsAssigning(true);
    const response = await fetch("/api/policies/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...assignmentForm,
        priority,
        scopeId:
          assignmentForm.scopeType === "TENANT"
            ? undefined
            : assignmentForm.scopeId,
      }),
    });

    const data = (await response.json()) as { message?: string };
    setIsAssigning(false);

    if (!response.ok) {
      setAssignmentError(data.message ?? "Unable to assign policy.");
      return;
    }

    setAssignmentForm(emptyAssignmentForm);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handlePolicySubmit}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              {editingPolicy ? "Edit Policy" : "Create Policy"}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Effective-dated reusable policy
            </h3>
          </div>
          {editingPolicy ? (
            <button
              className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted"
              onClick={resetPolicyForm}
              type="button"
            >
              New policy
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <SelectField
            label="Type"
            value={policyForm.policyType}
            values={policyTypes}
            onChange={(policyType) =>
              setPolicyForm((current) => ({
                ...current,
                policyType: policyType as PolicyType,
              }))
            }
          />
          <Field
            label="Name"
            required
            value={policyForm.name}
            onChange={(name) =>
              setPolicyForm((current) => ({ ...current, name }))
            }
          />
          <Field
            label="Version"
            required
            type="number"
            value={policyForm.version}
            onChange={(version) =>
              setPolicyForm((current) => ({ ...current, version }))
            }
          />
          <SelectField
            label="Status"
            value={policyForm.status}
            values={policyStatuses}
            onChange={(status) =>
              setPolicyForm((current) => ({
                ...current,
                status: status as PolicyStatus,
              }))
            }
          />
          <Field
            label="Effective from"
            required
            type="date"
            value={policyForm.effectiveFrom}
            onChange={(effectiveFrom) =>
              setPolicyForm((current) => ({ ...current, effectiveFrom }))
            }
          />
          <Field
            label="Effective to"
            type="date"
            value={policyForm.effectiveTo}
            onChange={(effectiveTo) =>
              setPolicyForm((current) => ({ ...current, effectiveTo }))
            }
          />
          <label className="flex items-center gap-3 pt-8 text-sm font-medium text-foreground">
            <input
              checked={policyForm.isActive}
              className="h-4 w-4 rounded border-border"
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Active
          </label>
          <div className="md:col-span-4">
            <Field
              label="Description"
              value={policyForm.description}
              onChange={(description) =>
                setPolicyForm((current) => ({ ...current, description }))
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
              : editingPolicy
                ? "Save policy"
                : "Create policy"}
          </button>
        </div>
      </form>

      <DataTable
        columns={policyColumns}
        emptyState={
          <div className="p-10 text-center text-muted">
            No policies have been configured yet.
          </div>
        }
        getRowKey={(policy) => policy.id}
        rows={policies}
        searchPlaceholder="Search policies"
      />

      <form
        className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handleAssignmentSubmit}
      >
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Assignments
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Assign policies by scope
          </h3>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <label className="space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-foreground">Policy *</span>
            <select
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  policyId: event.target.value,
                }))
              }
              value={assignmentForm.policyId}
            >
              <option value="">Select policy</option>
              {policies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} ({policy.policyType} v{policy.version})
                </option>
              ))}
            </select>
          </label>
          <SelectField
            label="Scope"
            value={assignmentForm.scopeType}
            values={scopeTypes}
            onChange={(scopeType) =>
              setAssignmentForm((current) => ({
                ...current,
                scopeType: scopeType as ScopeType,
                scopeId: scopeType === "TENANT" ? "" : current.scopeId,
              }))
            }
          />
          <Field
            disabled={assignmentForm.scopeType === "TENANT"}
            label="Scope ID"
            value={assignmentForm.scopeId}
            onChange={(scopeId) =>
              setAssignmentForm((current) => ({ ...current, scopeId }))
            }
          />
          <Field
            label="Priority"
            required
            type="number"
            value={assignmentForm.priority}
            onChange={(priority) =>
              setAssignmentForm((current) => ({ ...current, priority }))
            }
          />
        </div>
        {assignmentError ? (
          <p className="text-sm text-danger">{assignmentError}</p>
        ) : null}
        <div>
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            disabled={isAssigning || policies.length === 0}
            type="submit"
          >
            {isAssigning ? "Assigning..." : "Assign policy"}
          </button>
        </div>
      </form>

      <DataTable
        columns={assignmentColumns}
        emptyState={
          <div className="p-10 text-center text-muted">
            No policy assignments have been configured yet.
          </div>
        }
        getRowKey={(assignment) => assignment.id}
        rows={assignments}
        searchPlaceholder="Search assignments"
      />
    </div>
  );
}

function Field({
  disabled,
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  disabled?: boolean;
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
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-muted/10"
        disabled={disabled}
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
