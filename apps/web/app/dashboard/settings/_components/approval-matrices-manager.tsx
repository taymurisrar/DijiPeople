"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatEnumLabel } from "@/lib/common";
import {
  ApprovalMatrixRecord,
  LeavePolicyRecord,
  LeaveTypeRecord,
  RoleRecord,
  UserOptionRecord,
} from "../types";

type FormState = {
  moduleKey: string;
  name: string;
  leaveTypeId: string;
  leavePolicyId: string;
  sequence: string;
  approverType: string;
  approverRoleId: string;
  approverUserId: string;
  approvalMode: string;
  scopeType: string;
  scopeId: string;
  isActive: boolean;
};

const moduleOptions = [
  "LEAVE_REQUEST",
  "TIMESHEET",
  "CLAIM_REQUEST",
  "BUSINESS_TRIP",
  "RESOURCE_REQUEST",
  "PAYROLL_RUN",
].map((value) => ({ value, label: formatEnumLabel(value) }));

const approverTypeOptions = [
  { value: "LINE_MANAGER", label: "Line Manager" },
  { value: "ROLE", label: "Role" },
  { value: "USER", label: "User" },
];

const approvalModeOptions = [
  { value: "ANY_ONE", label: "Any One" },
  { value: "ALL", label: "All" },
];

const scopeOptions = [
  { value: "", label: "Tenant default" },
  { value: "TENANT", label: "Tenant" },
  { value: "ORGANIZATION", label: "Organization" },
  { value: "BUSINESS_UNIT", label: "Business Unit" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "EMPLOYEE_LEVEL", label: "Employee Level" },
  { value: "EMPLOYEE", label: "Employee" },
];

const emptyForm: FormState = {
  moduleKey: "LEAVE_REQUEST",
  name: "",
  leaveTypeId: "",
  leavePolicyId: "",
  sequence: "1",
  approverType: "LINE_MANAGER",
  approverRoleId: "",
  approverUserId: "",
  approvalMode: "ANY_ONE",
  scopeType: "",
  scopeId: "",
  isActive: true,
};

export function ApprovalMatricesManager({
  approvalMatrices,
  leaveTypes,
  leavePolicies,
  roles,
  users,
  canManage,
}: {
  approvalMatrices: ApprovalMatrixRecord[];
  leaveTypes: LeaveTypeRecord[];
  leavePolicies: LeavePolicyRecord[];
  roles: RoleRecord[];
  users: UserOptionRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const isLeaveModule = form.moduleKey === "LEAVE_REQUEST";
  const leaveTypeOptions = leaveTypes.map((leaveType) => ({
    value: leaveType.id,
    label: `${leaveType.name} (${leaveType.code})`,
  }));
  const leavePolicyOptions = leavePolicies.map((policy) => ({
    value: policy.id,
    label: policy.name,
  }));
  const roleOptions = roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));
  const userOptions = users.map((user) => ({
    value: user.id,
    label: `${user.firstName} ${user.lastName} (${user.email})`,
  }));

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function startEdit(matrix: ApprovalMatrixRecord) {
    setEditingId(matrix.id);
    setError(null);
    setForm({
      moduleKey: matrix.moduleKey ?? "LEAVE_REQUEST",
      name: matrix.name,
      leaveTypeId: matrix.leaveTypeId ?? "",
      leavePolicyId: matrix.leavePolicyId ?? "",
      sequence: String(matrix.sequence),
      approverType:
        matrix.approverType === "MANAGER"
          ? "LINE_MANAGER"
          : matrix.approverType === "HR"
            ? "ROLE"
            : matrix.approverType,
      approverRoleId: matrix.approverRoleId ?? "",
      approverUserId: matrix.approverUserId ?? "",
      approvalMode: matrix.approvalMode ?? "ANY_ONE",
      scopeType: matrix.scopeType ?? "",
      scopeId: matrix.scopeId ?? "",
      isActive: matrix.isActive,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const sequence = Number(form.sequence);
    if (!form.name.trim()) return setError("Matrix name is required.");
    if (!Number.isInteger(sequence) || sequence < 1) {
      return setError("Sequence must be a positive whole number.");
    }
    if (form.approverType === "ROLE" && !form.approverRoleId) {
      return setError("Role approver requires a role.");
    }
    if (form.approverType === "USER" && !form.approverUserId) {
      return setError("User approver requires a user.");
    }
    if (form.scopeType && form.scopeType !== "TENANT" && !form.scopeId.trim()) {
      return setError("Scope ID is required for the selected scope.");
    }

    setBusy(true);
    const response = await fetch(
      editingId ? `/api/approval-matrices/${editingId}` : "/api/approval-matrices",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey: form.moduleKey,
          name: form.name.trim(),
          leaveTypeId: isLeaveModule ? form.leaveTypeId || null : null,
          leavePolicyId: isLeaveModule ? form.leavePolicyId || null : null,
          sequence,
          approverType: form.approverType,
          approverRoleId:
            form.approverType === "ROLE" ? form.approverRoleId : null,
          approverUserId:
            form.approverType === "USER" ? form.approverUserId : null,
          approvalMode: form.approvalMode,
          scopeType: form.scopeType || null,
          scopeId:
            form.scopeType && form.scopeType !== "TENANT"
              ? form.scopeId.trim()
              : null,
          isActive: form.isActive,
        }),
      },
    );
    const data = (await response.json()) as { message?: string };
    setBusy(false);
    if (!response.ok) return setError(data.message ?? "Unable to save matrix.");
    resetForm();
    router.refresh();
  }

  async function deactivateMatrix(id: string) {
    if (!window.confirm("Deactivate this approval matrix row?")) return;
    setDeactivatingId(id);
    const response = await fetch(`/api/approval-matrices/${id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { message?: string };
    setDeactivatingId(null);
    if (!response.ok) return setError(data.message ?? "Unable to deactivate.");
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <section className="grid gap-6">
      <form
        className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Generic Approval Matrix
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Reusable workflow routing
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Configure module-aware approval steps. Leave filters appear only for
            leave requests; other modules use the same resolver foundation.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <SelectField
            label="Module"
            value={form.moduleKey}
            options={moduleOptions}
            disabled={!canManage}
            onChange={(moduleKey) =>
              setForm((current) => ({
                ...current,
                moduleKey,
                leavePolicyId:
                  moduleKey === "LEAVE_REQUEST" ? current.leavePolicyId : "",
                leaveTypeId:
                  moduleKey === "LEAVE_REQUEST" ? current.leaveTypeId : "",
              }))
            }
          />
          <TextField
            label="Name"
            required
            value={form.name}
            disabled={!canManage}
            onChange={(name) => setForm((current) => ({ ...current, name }))}
          />
          <TextField
            label="Sequence"
            required
            value={form.sequence}
            disabled={!canManage}
            onChange={(sequence) =>
              setForm((current) => ({ ...current, sequence }))
            }
          />
          <SelectField
            label="Approval mode"
            value={form.approvalMode}
            options={approvalModeOptions}
            disabled={!canManage}
            onChange={(approvalMode) =>
              setForm((current) => ({ ...current, approvalMode }))
            }
          />
          {isLeaveModule ? (
            <>
              <SelectField
                label="Leave policy"
                value={form.leavePolicyId}
                options={leavePolicyOptions}
                placeholder="All policies"
                disabled={!canManage}
                onChange={(leavePolicyId) =>
                  setForm((current) => ({ ...current, leavePolicyId }))
                }
              />
              <SelectField
                label="Leave type"
                value={form.leaveTypeId}
                options={leaveTypeOptions}
                placeholder="All leave types"
                disabled={!canManage}
                onChange={(leaveTypeId) =>
                  setForm((current) => ({ ...current, leaveTypeId }))
                }
              />
            </>
          ) : null}
          <SelectField
            label="Approver type"
            value={form.approverType}
            options={approverTypeOptions}
            disabled={!canManage}
            onChange={(approverType) =>
              setForm((current) => ({
                ...current,
                approverType,
                approverRoleId:
                  approverType === "ROLE" ? current.approverRoleId : "",
                approverUserId:
                  approverType === "USER" ? current.approverUserId : "",
              }))
            }
          />
          {form.approverType === "ROLE" ? (
            <SelectField
              label="Approver role"
              value={form.approverRoleId}
              options={roleOptions}
              placeholder="Select role"
              disabled={!canManage}
              onChange={(approverRoleId) =>
                setForm((current) => ({ ...current, approverRoleId }))
              }
            />
          ) : null}
          {form.approverType === "USER" ? (
            <SelectField
              label="Approver user"
              value={form.approverUserId}
              options={userOptions}
              placeholder="Select user"
              disabled={!canManage}
              onChange={(approverUserId) =>
                setForm((current) => ({ ...current, approverUserId }))
              }
            />
          ) : null}
          <SelectField
            label="Scope"
            value={form.scopeType}
            options={scopeOptions}
            disabled={!canManage}
            onChange={(scopeType) =>
              setForm((current) => ({
                ...current,
                scopeType,
                scopeId: scopeType === "TENANT" ? "" : current.scopeId,
              }))
            }
          />
          {form.scopeType && form.scopeType !== "TENANT" ? (
            <TextField
              label="Scope ID"
              value={form.scopeId}
              disabled={!canManage}
              onChange={(scopeId) =>
                setForm((current) => ({ ...current, scopeId }))
              }
            />
          ) : null}
          <CheckboxField
            className="lg:mt-7"
            label="Active route"
            checked={form.isActive}
            disabled={!canManage}
            onChange={(isActive) =>
              setForm((current) => ({ ...current, isActive }))
            }
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
            disabled={!canManage || busy}
            type="submit"
          >
            {busy ? "Saving..." : editingId ? "Save matrix" : "Add matrix"}
          </button>
          {editingId ? (
            <button
              className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted"
              onClick={resetForm}
              type="button"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-[24px] border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Applies To</th>
              <th className="px-4 py-3">Sequence</th>
              <th className="px-4 py-3">Approver</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {approvalMatrices.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-muted" colSpan={8}>
                  No approval matrix rows have been configured yet.
                </td>
              </tr>
            ) : (
              approvalMatrices.map((matrix) => (
                <tr className="border-t border-border bg-white text-sm" key={matrix.id}>
                  <td className="px-4 py-4 font-semibold">{matrix.name}</td>
                  <td className="px-4 py-4">{formatEnumLabel(matrix.moduleKey)}</td>
                  <td className="px-4 py-4">{getAppliesToLabel(matrix)}</td>
                  <td className="px-4 py-4">{matrix.sequence}</td>
                  <td className="px-4 py-4">{formatApprover(matrix)}</td>
                  <td className="px-4 py-4">{formatEnumLabel(matrix.approvalMode)}</td>
                  <td className="px-4 py-4">
                    <StatusPill tone={matrix.isActive ? "good" : "danger"}>
                      {matrix.isActive ? "Active" : "Inactive"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      className="mr-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-accent disabled:opacity-60"
                      disabled={!canManage}
                      onClick={() => startEdit(matrix)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                      disabled={!canManage || !matrix.isActive || deactivatingId === matrix.id}
                      onClick={() => deactivateMatrix(matrix.id)}
                      type="button"
                    >
                      {deactivatingId === matrix.id ? "Deactivating..." : "Deactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getAppliesToLabel(matrix: ApprovalMatrixRecord) {
  if (matrix.moduleKey === "LEAVE_REQUEST") {
    if (matrix.leavePolicy && matrix.leaveType) return "Policy + Leave Type";
    if (matrix.leavePolicy) return "Policy";
    if (matrix.leaveType) return "Leave Type";
  }
  if (matrix.scopeType) return formatEnumLabel(matrix.scopeType);
  return "Tenant default";
}

function formatApprover(matrix: ApprovalMatrixRecord) {
  if (matrix.approverType === "ROLE") {
    return matrix.approverRole?.name ?? "Role";
  }
  if (matrix.approverType === "USER") {
    return matrix.approverUser
      ? `${matrix.approverUser.firstName} ${matrix.approverUser.lastName}`
      : "User";
  }
  if (matrix.approverType === "MANAGER") return "Line Manager";
  if (matrix.approverType === "HR") return "HR Role";
  return formatEnumLabel(matrix.approverType);
}
