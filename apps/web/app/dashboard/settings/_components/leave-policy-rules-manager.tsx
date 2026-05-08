"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatEnumLabel } from "@/lib/common";
import { LeavePolicyRuleRecord, LeaveTypeRecord } from "../types";

const accrualTypeOptions = [
  { value: "FIXED_ANNUAL", label: "Fixed Annual" },
  { value: "MONTHLY_ACCRUAL", label: "Monthly Accrual" },
  { value: "PER_PAY_PERIOD", label: "Per Pay Period" },
  { value: "PER_WORKED_HOUR", label: "Per Worked Hour" },
  { value: "NONE", label: "None" },
];

const accrualFrequencyOptions = [
  { value: "", label: "No frequency" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "PAY_PERIOD", label: "Pay Period" },
];

const genderOptions = [
  { value: "", label: "No restriction" },
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "NON_BINARY", label: "Non Binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer Not To Say" },
];

type RuleFormState = {
  id?: string;
  leaveTypeId: string;
  entitlementDays: string;
  accrualType: string;
  accrualFrequency: string;
  carryForwardAllowed: boolean;
  carryForwardLimit: string;
  negativeBalanceAllowed: boolean;
  requiresDocumentAfterDays: string;
  probationRestriction: boolean;
  genderRestriction: string;
  minServiceMonths: string;
  maxConsecutiveDays: string;
  approvalRequired: boolean;
  isPaid: boolean;
  isActive: boolean;
};

type LeavePolicyRulesManagerProps = {
  leavePolicyId: string;
  leaveTypes: LeaveTypeRecord[];
  rules: LeavePolicyRuleRecord[];
};

const emptyForm: RuleFormState = {
  leaveTypeId: "",
  entitlementDays: "",
  accrualType: "FIXED_ANNUAL",
  accrualFrequency: "",
  carryForwardAllowed: false,
  carryForwardLimit: "",
  negativeBalanceAllowed: false,
  requiresDocumentAfterDays: "",
  probationRestriction: false,
  genderRestriction: "",
  minServiceMonths: "",
  maxConsecutiveDays: "",
  approvalRequired: true,
  isPaid: true,
  isActive: true,
};

export function LeavePolicyRulesManager({
  leavePolicyId,
  leaveTypes,
  rules,
}: LeavePolicyRulesManagerProps) {
  const router = useRouter();

  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableLeaveTypeOptions = leaveTypes.map((leaveType) => ({
    value: leaveType.id,
    label: `${leaveType.name} (${leaveType.code})`,
  }));

  function resetForm() {
    setForm(emptyForm);
    setEditingRuleId(null);
    setError(null);
  }

  function editRule(rule: LeavePolicyRuleRecord) {
    setEditingRuleId(rule.id);
    setError(null);

    setForm({
      id: rule.id,
      leaveTypeId: rule.leaveTypeId,
      entitlementDays: toText(rule.entitlementDays),
      accrualType: rule.accrualType,
      accrualFrequency: rule.accrualFrequency ?? "",
      carryForwardAllowed: rule.carryForwardAllowed,
      carryForwardLimit: toText(rule.carryForwardLimit),
      negativeBalanceAllowed: rule.negativeBalanceAllowed,
      requiresDocumentAfterDays: toText(rule.requiresDocumentAfterDays),
      probationRestriction: rule.probationRestriction,
      genderRestriction: rule.genderRestriction ?? "",
      minServiceMonths: toText(rule.minServiceMonths),
      maxConsecutiveDays: toText(rule.maxConsecutiveDays),
      approvalRequired: rule.approvalRequired,
      isPaid: rule.isPaid,
      isActive: rule.isActive,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.leaveTypeId) {
      setError("Leave type is required.");
      return;
    }

    if (!form.accrualType) {
      setError("Accrual type is required.");
      return;
    }

    const entitlementDays = optionalNumber(form.entitlementDays);
    const carryForwardLimit = optionalNumber(form.carryForwardLimit);
    const requiresDocumentAfterDays = optionalNumber(
      form.requiresDocumentAfterDays,
    );
    const minServiceMonths = optionalNumber(form.minServiceMonths);
    const maxConsecutiveDays = optionalNumber(form.maxConsecutiveDays);

    if (entitlementDays !== undefined && entitlementDays < 0) {
      setError("Entitlement days cannot be negative.");
      return;
    }

    if (
      form.carryForwardAllowed &&
      carryForwardLimit !== undefined &&
      carryForwardLimit < 0
    ) {
      setError("Carry forward limit cannot be negative.");
      return;
    }

    if (!form.carryForwardAllowed && carryForwardLimit) {
      setError("Carry forward limit requires carry forward to be enabled.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      editingRuleId
        ? `/api/leave-policies/${leavePolicyId}/rules/${editingRuleId}`
        : `/api/leave-policies/${leavePolicyId}/rules`,
      {
        method: editingRuleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: form.leaveTypeId,
          entitlementDays,
          accrualType: form.accrualType,
          accrualFrequency: form.accrualFrequency || undefined,
          carryForwardAllowed: form.carryForwardAllowed,
          carryForwardLimit: form.carryForwardAllowed
            ? carryForwardLimit
            : undefined,
          negativeBalanceAllowed: form.negativeBalanceAllowed,
          requiresDocumentAfterDays,
          probationRestriction: form.probationRestriction,
          genderRestriction: form.genderRestriction || undefined,
          minServiceMonths,
          maxConsecutiveDays,
          approvalRequired: form.approvalRequired,
          isPaid: form.isPaid,
          isActive: form.isActive,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };

    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save leave policy rule.");
      return;
    }

    resetForm();
    router.refresh();
  }

  async function deleteRule(ruleId: string) {
    const confirmed = window.confirm(
      "Delete this leave policy rule? This action cannot be undone.",
    );

    if (!confirmed) return;

    setIsDeletingId(ruleId);
    setError(null);

    const response = await fetch(
      `/api/leave-policies/${leavePolicyId}/rules/${ruleId}`,
      {
        method: "DELETE",
      },
    );

    const data = (await response.json()) as { message?: string };

    setIsDeletingId(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to delete leave policy rule.");
      return;
    }

    if (editingRuleId === ruleId) {
      resetForm();
    }

    router.refresh();
  }

  return (
    <section className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="border-b border-border pb-5">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Leave Policy Rules
        </p>

        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          Configure leave entitlements
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Link leave types to this policy and define entitlement, accrual,
          carry forward, restrictions, payment behavior, approval behavior, and
          availability.
        </p>
      </div>

      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            label="Leave type"
            required
            value={form.leaveTypeId}
            options={availableLeaveTypeOptions}
            placeholder="Select leave type"
            onChange={(leaveTypeId) =>
              setForm((current) => ({
                ...current,
                leaveTypeId,
              }))
            }
          />

          <TextField
            label="Entitlement days"
            value={form.entitlementDays}
            placeholder="21"
            onChange={(entitlementDays) =>
              setForm((current) => ({
                ...current,
                entitlementDays,
              }))
            }
          />

          <SelectField
            label="Accrual type"
            required
            value={form.accrualType}
            options={accrualTypeOptions}
            onChange={(accrualType) =>
              setForm((current) => ({
                ...current,
                accrualType,
              }))
            }
          />

          <SelectField
            label="Accrual frequency"
            value={form.accrualFrequency}
            options={accrualFrequencyOptions}
            onChange={(accrualFrequency) =>
              setForm((current) => ({
                ...current,
                accrualFrequency,
              }))
            }
          />

          <TextField
            label="Carry forward limit"
            value={form.carryForwardLimit}
            placeholder="5"
            disabled={!form.carryForwardAllowed}
            onChange={(carryForwardLimit) =>
              setForm((current) => ({
                ...current,
                carryForwardLimit,
              }))
            }
          />

          <TextField
            label="Document required after days"
            value={form.requiresDocumentAfterDays}
            placeholder="3"
            onChange={(requiresDocumentAfterDays) =>
              setForm((current) => ({
                ...current,
                requiresDocumentAfterDays,
              }))
            }
          />

          <SelectField
            label="Gender restriction"
            value={form.genderRestriction}
            options={genderOptions}
            onChange={(genderRestriction) =>
              setForm((current) => ({
                ...current,
                genderRestriction,
              }))
            }
          />

          <TextField
            label="Minimum service months"
            value={form.minServiceMonths}
            placeholder="6"
            onChange={(minServiceMonths) =>
              setForm((current) => ({
                ...current,
                minServiceMonths,
              }))
            }
          />

          <TextField
            label="Max consecutive days"
            value={form.maxConsecutiveDays}
            placeholder="10"
            onChange={(maxConsecutiveDays) =>
              setForm((current) => ({
                ...current,
                maxConsecutiveDays,
              }))
            }
          />
        </div>

        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-sm font-semibold text-foreground">
            Rule behavior
          </p>

          <p className="mt-1 text-xs leading-5 text-muted">
            These switches control how this leave type behaves inside the
            selected policy.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CheckboxField
              label="Carry forward allowed"
              checked={form.carryForwardAllowed}
              onChange={(carryForwardAllowed) =>
                setForm((current) => ({
                  ...current,
                  carryForwardAllowed,
                  carryForwardLimit: carryForwardAllowed
                    ? current.carryForwardLimit
                    : "",
                }))
              }
            />

            <CheckboxField
              label="Negative balance allowed"
              checked={form.negativeBalanceAllowed}
              onChange={(negativeBalanceAllowed) =>
                setForm((current) => ({
                  ...current,
                  negativeBalanceAllowed,
                }))
              }
            />

            <CheckboxField
              label="Restricted during probation"
              checked={form.probationRestriction}
              onChange={(probationRestriction) =>
                setForm((current) => ({
                  ...current,
                  probationRestriction,
                }))
              }
            />

            <CheckboxField
              label="Approval required"
              checked={form.approvalRequired}
              onChange={(approvalRequired) =>
                setForm((current) => ({
                  ...current,
                  approvalRequired,
                }))
              }
            />

            <CheckboxField
              label="Paid leave"
              checked={form.isPaid}
              onChange={(isPaid) =>
                setForm((current) => ({
                  ...current,
                  isPaid,
                }))
              }
            />

            <CheckboxField
              label="Active rule"
              checked={form.isActive}
              onChange={(isActive) =>
                setForm((current) => ({
                  ...current,
                  isActive,
                }))
              }
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isSubmitting || leaveTypes.length === 0}
            type="submit"
          >
            {isSubmitting
              ? "Saving..."
              : editingRuleId
                ? "Save rule"
                : "Add rule"}
          </button>

          {editingRuleId ? (
            <button
              className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted transition hover:bg-slate-50"
              disabled={isSubmitting}
              onClick={resetForm}
              type="button"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="overflow-hidden rounded-[22px] border border-border bg-white">
        {rules.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-foreground">
              No leave rules configured yet
            </p>
            <p className="mt-2 text-sm text-muted">
              Add rules like Annual Leave = 21 days, Sick Leave = 8 days, or
              Unpaid Leave = no entitlement.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Entitlement</th>
                  <th className="px-4 py-3">Accrual</th>
                  <th className="px-4 py-3">Carry Forward</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-t border-border text-sm text-foreground"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold">
                        {rule.leaveType?.name ?? "Unknown leave type"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {rule.leaveType?.code ?? rule.leaveTypeId}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      {formatDays(rule.entitlementDays)}
                    </td>

                    <td className="px-4 py-4">
                      <p>{formatEnumLabel(rule.accrualType)}</p>
                      {rule.accrualFrequency ? (
                        <p className="mt-1 text-xs text-muted">
                          {formatEnumLabel(rule.accrualFrequency)}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-4">
                      {rule.carryForwardAllowed
                        ? formatDays(rule.carryForwardLimit)
                        : "Not allowed"}
                    </td>

                    <td className="px-4 py-4">
                      {rule.isPaid ? "Paid" : "Unpaid"}
                    </td>

                    <td className="px-4 py-4">
                      {rule.approvalRequired ? "Required" : "Not Required"}
                    </td>

                    <td className="px-4 py-4">
                      <StatusPill tone={rule.isActive ? "good" : "danger"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </StatusPill>
                    </td>

                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/5"
                          onClick={() => editRule(rule)}
                          type="button"
                        >
                          Edit
                        </button>

                        <button
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                          disabled={isDeletingId === rule.id}
                          onClick={() => deleteRule(rule.id)}
                          type="button"
                        >
                          {isDeletingId === rule.id ? "Deleting..." : "Delete"}
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

function optionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isNaN(parsed) ? undefined : parsed;
}

function toText(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function formatDays(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Unlimited";
  }

  return `${Number(value)} days`;
}
