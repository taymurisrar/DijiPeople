"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import {
  CheckboxField,
  DateField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatEnumLabel } from "@/lib/common";
import { formatDate } from "@/lib/formatting-context";

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
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(emptyPolicyForm);
  const [assignmentForm, setAssignmentForm] =
    useState<AssignmentFormState>(emptyAssignmentForm);

  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const policyColumns: DataTableColumn<PolicyRecord>[] = [
    {
      key: "name",
      header: "Policy",
      sortable: true,
      searchable: true,
      render: (policy) => (
        <div>
          <p className="font-semibold text-foreground">{policy.name}</p>
          <p className="mt-1 text-sm text-muted">
            {formatEnumLabel(policy.policyType)} v{policy.version}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (policy) => (
        <StatusPill tone={getPolicyStatusTone(policy.status)}>
          {formatEnumLabel(policy.status)}
        </StatusPill>
      ),
    },
    {
      key: "effectiveFrom",
      header: "Effective",
      sortable: true,
      render: (policy) =>
        `${formatDate(policy.effectiveFrom)}${policy.effectiveTo ? ` - ${formatDate(policy.effectiveTo)}` : ""
        }`,
    },
    {
      key: "active",
      header: "Active",
      render: (policy) => (
        <StatusPill tone={policy.isActive ? "good" : "danger"}>
          {policy.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
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
  ];

  const assignmentColumns: DataTableColumn<PolicyAssignmentRecord>[] = [
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
      render: (assignment) => formatEnumLabel(assignment.scopeType),
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
      render: (assignment) => (
        <StatusPill tone={assignment.isActive ? "good" : "danger"}>
          {assignment.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
  ];

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

    const name = policyForm.name.trim();
    const version = Number(policyForm.version);

    if (!name) {
      setError("Policy name is required.");
      return;
    }

    if (!Number.isInteger(version) || version < 1) {
      setError("Version must be a positive whole number.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      editingPolicy ? `/api/policies/${editingPolicy.id}` : "/api/policies",
      {
        method: editingPolicy ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyType: policyForm.policyType,
          name,
          description: policyForm.description || undefined,
          version,
          status: policyForm.status,
          effectiveFrom: policyForm.effectiveFrom,
          effectiveTo: policyForm.effectiveTo || undefined,
          isActive: policyForm.isActive,
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

    if (!assignmentForm.policyId) {
      setAssignmentError("Policy is required.");
      return;
    }

    if (!Number.isInteger(priority) || priority < 0) {
      setAssignmentError("Priority must be a non-negative whole number.");
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
        policyId: assignmentForm.policyId,
        scopeType: assignmentForm.scopeType,
        scopeId:
          assignmentForm.scopeType === "TENANT"
            ? undefined
            : assignmentForm.scopeId.trim(),
        priority,
        isActive: assignmentForm.isActive,
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
        className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handlePolicySubmit}
      >
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              {editingPolicy ? "Edit Policy" : "Create Policy"}
            </p>

            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Effective-dated reusable policy
            </h3>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Configure versioned policies that can later be assigned by tenant,
              organization, business unit, department, employee level, or
              employee.
            </p>
          </div>

          {editingPolicy ? (
            <button
              className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-medium text-muted transition hover:bg-slate-50"
              disabled={isSubmitting}
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
            required
            value={policyForm.policyType}
            options={policyTypes.map((value) => ({
              label: formatEnumLabel(value),
              value,
            }))}
            onChange={(policyType) =>
              setPolicyForm((current) => ({
                ...current,
                policyType: policyType as PolicyType,
              }))
            }
          />

          <TextField
            label="Name"
            required
            value={policyForm.name}
            onChange={(name) =>
              setPolicyForm((current) => ({ ...current, name }))
            }
          />

          <TextField
            label="Version"
            required
            value={policyForm.version}
            onChange={(version) =>
              setPolicyForm((current) => ({ ...current, version }))
            }
          />

          <SelectField
            label="Status"
            required
            value={policyForm.status}
            options={policyStatuses.map((value) => ({
              label: formatEnumLabel(value),
              value,
            }))}
            onChange={(status) =>
              setPolicyForm((current) => ({
                ...current,
                status: status as PolicyStatus,
              }))
            }
          />

          <DateField
            label="Effective from"
            required
            value={policyForm.effectiveFrom}
            onChange={(effectiveFrom) =>
              setPolicyForm((current) => ({ ...current, effectiveFrom }))
            }
          />

          <DateField
            label="Effective to"
            value={policyForm.effectiveTo}
            onChange={(effectiveTo) =>
              setPolicyForm((current) => ({ ...current, effectiveTo }))
            }
          />

          <CheckboxField
            className="md:col-span-2 md:mt-7"
            label="Active policy"
            hint="Inactive policies should not be selected for new assignments."
            checked={policyForm.isActive}
            onChange={(isActive) =>
              setPolicyForm((current) => ({
                ...current,
                isActive,
              }))
            }
          />

          <TextField
            className="md:col-span-4"
            label="Description"
            value={policyForm.description}
            onChange={(description) =>
              setPolicyForm((current) => ({ ...current, description }))
            }
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
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
        className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handleAssignmentSubmit}
      >
        <div className="border-b border-border pb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Assignments
          </p>

          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Assign policies by scope
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Assign a policy to a resolution scope. More specific scopes can win
            through priority and your backend resolver order.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <SelectField
            className="md:col-span-2"
            label="Policy"
            required
            placeholder="Select policy"
            value={assignmentForm.policyId}
            options={policies.map((policy) => ({
              label: `${policy.name} (${formatEnumLabel(policy.policyType)} v${policy.version})`,
              value: policy.id,
            }))}
            onChange={(policyId) =>
              setAssignmentForm((current) => ({
                ...current,
                policyId,
              }))
            }
          />

          <SelectField
            label="Scope"
            required
            value={assignmentForm.scopeType}
            options={scopeTypes.map((value) => ({
              label: formatEnumLabel(value),
              value,
            }))}
            onChange={(scopeType) =>
              setAssignmentForm((current) => ({
                ...current,
                scopeType: scopeType as ScopeType,
                scopeId: scopeType === "TENANT" ? "" : current.scopeId,
              }))
            }
          />

          <TextField
            disabled={assignmentForm.scopeType === "TENANT"}
            label="Scope ID"
            value={assignmentForm.scopeId}
            placeholder={
              assignmentForm.scopeType === "TENANT"
                ? "Tenant default"
                : "Record ID"
            }
            onChange={(scopeId) =>
              setAssignmentForm((current) => ({ ...current, scopeId }))
            }
          />

          <TextField
            label="Priority"
            required
            value={assignmentForm.priority}
            onChange={(priority) =>
              setAssignmentForm((current) => ({ ...current, priority }))
            }
          />

          <CheckboxField
            className="md:col-span-5"
            label="Active assignment"
            hint="Inactive assignments should be ignored by the policy resolver."
            checked={assignmentForm.isActive}
            onChange={(isActive) =>
              setAssignmentForm((current) => ({
                ...current,
                isActive,
              }))
            }
          />
        </div>

        {assignmentError ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {assignmentError}
          </p>
        ) : null}

        <div>
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
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

function getPolicyStatusTone(
  status: PolicyStatus,
): "good" | "muted" | "neutral" | "danger" | "warning" | "info" {
  if (status === "ACTIVE") return "good";
  if (status === "RETIRED") return "danger";
  return "muted";
}

