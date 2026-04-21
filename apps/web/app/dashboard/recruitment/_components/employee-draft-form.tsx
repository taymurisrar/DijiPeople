"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACT_TYPE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYEE_TYPE_OPTIONS,
  WORK_MODE_OPTIONS,
} from "@/app/dashboard/employees/field-options";
import { LookupField } from "@/app/components/ui/form-control";
import { useEmployeeLookups } from "@/app/dashboard/employees/_components/use-employee-lookups";
import { EmployeeProfile, EmployeeListItem } from "@/app/dashboard/employees/types";

type EmployeeDraftFormProps = {
  employee: EmployeeProfile;
  managerOptions: EmployeeListItem[];
};

type EmployeeDraftFormState = {
  employeeCode: string;
  hireDate: string;
  departmentId: string;
  designationId: string;
  locationId: string;
  officialJoiningLocationId: string;
  reportingManagerEmployeeId: string;
  employeeType: string;
  workMode: string;
  contractType: string;
  employmentStatus: EmployeeProfile["employmentStatus"];
};

export function EmployeeDraftForm({
  employee,
  managerOptions,
}: EmployeeDraftFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<EmployeeDraftFormState>({
    employeeCode: employee.employeeCode,
    hireDate: employee.hireDate.slice(0, 10),
    departmentId: employee.departmentId ?? "",
    designationId: employee.designationId ?? "",
    locationId: employee.locationId ?? "",
    officialJoiningLocationId: employee.officialJoiningLocationId ?? "",
    reportingManagerEmployeeId: employee.reportingManagerEmployeeId ?? "",
    employeeType: employee.employeeType ?? "",
    workMode: employee.workMode ?? "",
    contractType: employee.contractType ?? "",
    employmentStatus: employee.employmentStatus,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { departments, designations, locations, isLoading } = useEmployeeLookups(
    {},
  );

  const availableManagerOptions = useMemo(
    () => managerOptions.filter((manager) => manager.id !== employee.id),
    [employee.id, managerOptions],
  );

  function updateField<Key extends keyof EmployeeDraftFormState>(
    key: Key,
    value: EmployeeDraftFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.employeeCode.trim()) {
      return "Employee code is required.";
    }
    if (!form.hireDate) {
      return "Joining date is required.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode: form.employeeCode.trim(),
        hireDate: form.hireDate,
        departmentId: emptyToUndefined(form.departmentId),
        designationId: emptyToUndefined(form.designationId),
        locationId: emptyToUndefined(form.locationId),
        officialJoiningLocationId: emptyToUndefined(form.officialJoiningLocationId),
        reportingManagerEmployeeId: emptyToUndefined(
          form.reportingManagerEmployeeId,
        ),
        employeeType: emptyToUndefined(form.employeeType),
        workMode: emptyToUndefined(form.workMode),
        contractType: emptyToUndefined(form.contractType),
        employmentStatus: form.employmentStatus,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to update employee draft.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.push(`/dashboard/employees/${employee.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Guided pre-onboarding
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            Complete draft essentials before onboarding
          </h2>
          <p className="text-sm text-muted">
            Fill core organization and joining details first. You can complete the
            full profile later during onboarding and activation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Employee code"
            required
            value={form.employeeCode}
            onChange={(value) => updateField("employeeCode", value)}
          />
          <TextField
            label="Joining date"
            type="date"
            required
            value={form.hireDate}
            onChange={(value) => updateField("hireDate", value)}
          />
          <LookupField
            label="Department"
            options={departments}
            placeholder={isLoading ? "Loading departments..." : "Select department"}
            value={form.departmentId}
            onChange={(value) => updateField("departmentId", value)}
          />
          <LookupField
            label="Designation"
            options={designations}
            placeholder={isLoading ? "Loading designations..." : "Select designation"}
            value={form.designationId}
            onChange={(value) => updateField("designationId", value)}
          />
          <LookupField
            label="Work location"
            options={locations}
            placeholder={isLoading ? "Loading locations..." : "Select location"}
            value={form.locationId}
            onChange={(value) => updateField("locationId", value)}
          />
          <LookupField
            label="Official joining location"
            options={locations}
            placeholder={isLoading ? "Loading locations..." : "Select joining location"}
            value={form.officialJoiningLocationId}
            onChange={(value) => updateField("officialJoiningLocationId", value)}
          />
          <LookupField
            label="Reporting manager"
            options={availableManagerOptions.map((manager) => ({
              id: manager.id,
              name: `${manager.fullName} (${manager.employeeCode})`,
            }))}
            placeholder="Select reporting manager"
            value={form.reportingManagerEmployeeId}
            onChange={(value) => updateField("reportingManagerEmployeeId", value)}
          />
          <SelectField
            label="Employment status"
            options={EMPLOYMENT_STATUS_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={form.employmentStatus}
            onChange={(value) =>
              updateField(
                "employmentStatus",
                value as EmployeeDraftFormState["employmentStatus"],
              )
            }
          />
          <SelectField
            label="Employee type"
            options={EMPLOYEE_TYPE_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={form.employeeType}
            onChange={(value) => updateField("employeeType", value)}
          />
          <SelectField
            label="Work mode"
            options={WORK_MODE_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={form.workMode}
            onChange={(value) => updateField("workMode", value)}
          />
          <SelectField
            label="Contract type"
            options={CONTRACT_TYPE_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={form.contractType}
            onChange={(value) => updateField("contractType", value)}
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save draft essentials"}
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function TextField({
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
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
