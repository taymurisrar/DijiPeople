"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckboxField,
  DateField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatEnumLabel } from "@/lib/common";
import {
  LeavePolicyAssignmentRecord,
  LeavePolicyRecord,
} from "../types";

const scopeOptions = [
  { value: "TENANT", label: "Tenant" },
  { value: "ORGANIZATION", label: "Organization" },
  { value: "BUSINESS_UNIT", label: "Business Unit" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "EMPLOYEE_LEVEL", label: "Employee Level" },
  { value: "EMPLOYEE", label: "Employee" },
];

type AssignmentFormState = {
  leavePolicyId: string;
  scopeType: string;
  scopeId: string;
  effectiveFrom: string;
  effectiveTo: string;
  priority: string;
  isActive: boolean;
};

type LeavePolicyAssignmentsManagerProps = {
  assignments: LeavePolicyAssignmentRecord[];
  canManage: boolean;
  currentPolicyId?: string;
  leavePolicies: LeavePolicyRecord[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function makeEmptyForm(policyId?: string): AssignmentFormState {
  return {
    leavePolicyId: policyId ?? "",
    scopeType: "TENANT",
    scopeId: "",
    effectiveFrom: today(),
    effectiveTo: "",
    priority: "0",
    isActive: true,
  };
}

export function LeavePolicyAssignmentsManager({
  assignments,
  canManage,
  currentPolicyId,
  leavePolicies,
}: LeavePolicyAssignmentsManagerProps) {
  const router = useRouter();

  const [form, setForm] = useState<AssignmentFormState>(
    makeEmptyForm(currentPolicyId),
  );
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const policyOptions = leavePolicies.map((policy) => ({
    value: policy.id,
    label: policy.name,
  }));

  function resetForm() {
    setForm(makeEmptyForm(currentPolicyId));
    setEditingAssignmentId(null);
    setError(null);
  }

  function editAssignment(assignment: LeavePolicyAssignmentRecord) {
    setEditingAssignmentId(assignment.id);
    setError(null);
    setForm({
      leavePolicyId: assignment.leavePolicyId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId ?? "",
      effectiveFrom: toDateInput(assignment.effectiveFrom),
      effectiveTo: toDateInput(assignment.effectiveTo),
      priority: assignment.priority.toString(),
      isActive: assignment.isActive,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.leavePolicyId) {
      setError("Leave policy is required.");
      return;
    }

    if (form.scopeType !== "TENANT" && !form.scopeId.trim()) {
      setError("Scope ID is required unless the assignment applies to the tenant.");
      return;
    }

    if (!form.effectiveFrom) {
      setError("Effective from date is required.");
      return;
    }

    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      setError("Effective to cannot be before effective from.");
      return;
    }

    const priority = Number(form.priority || 0);

    if (!Number.isInteger(priority)) {
      setError("Priority must be a whole number.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      editingAssignmentId
        ? `/api/leave-policies/assignments/${editingAssignmentId}`
        : "/api/leave-policies/assignments",
      {
        method: editingAssignmentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leavePolicyId: form.leavePolicyId,
          scopeType: form.scopeType,
          scopeId: form.scopeType === "TENANT" ? null : form.scopeId.trim(),
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo || null,
          priority,
          isActive: form.isActive,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };

    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save leave policy assignment.");
      return;
    }

    resetForm();
    router.refresh();
  }

  async function deleteAssignment(assignmentId: string) {
    if (!window.confirm("Deactivate this leave policy assignment?")) {
      return;
    }

    setIsDeletingId(assignmentId);
    setError(null);

    const response = await fetch(
      `/api/leave-policies/assignments/${assignmentId}`,
      { method: "DELETE" },
    );

    const data = (await response.json()) as { message?: string };
    setIsDeletingId(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to delete leave policy assignment.");
      return;
    }

    router.refresh();
  }

  function policyName(assignment: LeavePolicyAssignmentRecord) {
    return (
      assignment.leavePolicy?.name ??
      leavePolicies.find((policy) => policy.id === assignment.leavePolicyId)
        ?.name ??
      "Leave policy"
    );
  }

  return (
    <section className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="border-b border-border pb-5">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Leave Policy Assignments
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Assign this policy to workforce scopes
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Assignments decide which effective-dated leave policy applies to a
          tenant, organization, business unit, department, level, or employee.
          Higher specificity wins, then priority and effective date.
        </p>
      </div>

      {canManage ? (
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Leave policy"
              onChange={(value) =>
                setForm((current) => ({ ...current, leavePolicyId: value }))
              }
              options={policyOptions}
              required
              value={form.leavePolicyId}
            />
            <SelectField
              label="Scope"
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  scopeType: value,
                  scopeId: value === "TENANT" ? "" : current.scopeId,
                }))
              }
              options={scopeOptions}
              required
              value={form.scopeType}
            />
            <TextField
              disabled={form.scopeType === "TENANT"}
              hint="Use the target record ID for non-tenant scopes until lookup pickers are added."
              label="Scope ID"
              onChange={(value) =>
                setForm((current) => ({ ...current, scopeId: value }))
              }
              placeholder={
                form.scopeType === "TENANT" ? "Not required" : "Record ID"
              }
              value={form.scopeId}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <DateField
              label="Effective from"
              onChange={(value) =>
                setForm((current) => ({ ...current, effectiveFrom: value }))
              }
              required
              value={form.effectiveFrom}
            />
            <DateField
              label="Effective to"
              onChange={(value) =>
                setForm((current) => ({ ...current, effectiveTo: value }))
              }
              value={form.effectiveTo}
            />
            <TextField
              label="Priority"
              onChange={(value) =>
                setForm((current) => ({ ...current, priority: value }))
              }
              value={form.priority}
            />
            <CheckboxField
              checked={form.isActive}
              label="Active"
              onChange={(checked) =>
                setForm((current) => ({ ...current, isActive: checked }))
              }
            />
          </div>

          {error ? (
            <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Saving..."
                : editingAssignmentId
                  ? "Save assignment"
                  : "Add assignment"}
            </button>
            {editingAssignmentId ? (
              <button
                className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted transition hover:bg-slate-50"
                disabled={isSubmitting}
                onClick={resetForm}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-muted">
          You can view assignments, but updating them requires assignment
          management permission.
        </p>
      )}

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Current Assignments
        </h3>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No leave policy assignments have been configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Scope ID</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr
                    className="border-b border-border text-sm text-foreground"
                    key={assignment.id}
                  >
                    <td className="px-4 py-4 font-medium">
                      {policyName(assignment)}
                    </td>
                    <td className="px-4 py-4">
                      {formatEnumLabel(assignment.scopeType)}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {assignment.scopeId ?? "Tenant"}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {toDateInput(assignment.effectiveFrom)}
                      {assignment.effectiveTo
                        ? ` to ${toDateInput(assignment.effectiveTo)}`
                        : " onward"}
                    </td>
                    <td className="px-4 py-4">{assignment.priority}</td>
                    <td className="px-4 py-4">
                      <StatusPill
                        tone={assignment.isActive ? "good" : "muted"}
                      >
                        {assignment.isActive ? "Active" : "Inactive"}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-muted transition hover:bg-slate-50 disabled:opacity-60"
                          disabled={!canManage}
                          onClick={() => editAssignment(assignment)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60"
                          disabled={!canManage || isDeletingId === assignment.id}
                          onClick={() => deleteAssignment(assignment.id)}
                          type="button"
                        >
                          {isDeletingId === assignment.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
