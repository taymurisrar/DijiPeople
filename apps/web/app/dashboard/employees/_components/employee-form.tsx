"use client";

import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  DateField,
  LookupField,
  NumberField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import type { RuntimeFormLayout } from "@/lib/customization-forms";
import {
  BLOOD_GROUP_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYEE_TYPE_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  WORK_MODE_OPTIONS,
} from "../field-options";
import {
  EmployeeFormValues,
  EmployeeListItem,
  EmployeeRoleOption,
} from "../types";
import { useEmployeeLookups } from "./use-employee-lookups";

type EmployeeFormProps = {
  canManageAccess?: boolean;
  employeeId?: string;
  initialValues: EmployeeFormValues;
  managerOptions: EmployeeListItem[];
  roleOptions: EmployeeRoleOption[];
  settings?: {
    employeeIdPrefix?: string;
    employeeIdSequenceLength?: number;
    autoGenerateEmployeeId?: boolean;
    requireDepartment?: boolean;
    requireDesignation?: boolean;
    requireReportingManager?: boolean;
    requireWorkLocation?: boolean;
  };
  runtimeFormLayout?: RuntimeFormLayout | null;
  mode: "create" | "edit";
};

type DuplicateConflict = {
  ruleKey: string;
  label: string;
  severity: "BLOCK" | "WARN";
  value: string;
  existingRecordId?: string;
};

type DuplicateCheckResponse = {
  conflicts: DuplicateConflict[];
};

export function EmployeeForm({
  canManageAccess = false,
  employeeId,
  initialValues,
  managerOptions,
  roleOptions,
  runtimeFormLayout,
  settings,
  mode,
}: EmployeeFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<EmployeeFormValues>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateConflicts, setDuplicateConflicts] = useState<
    DuplicateConflict[]
  >([]);
  const [hasConfirmedDuplicateWarning, setHasConfirmedDuplicateWarning] =
    useState(false);

  const autoGenerateEmployeeId =
    mode === "create" && settings?.autoGenerateEmployeeId === true;

  const employeeCodePrefix = settings?.employeeIdPrefix?.trim() || "EMP";
  const employeeCodeSequenceLength =
    settings?.employeeIdSequenceLength && settings.employeeIdSequenceLength > 0
      ? settings.employeeIdSequenceLength
      : 5;

  const employeeCodePreview = `${employeeCodePrefix}-AUTO`;
  const employeeCodeExample = `${employeeCodePrefix}-${"1".padStart(
    employeeCodeSequenceLength,
    "0",
  )}`;

  const {
    countries,
    states,
    cities,
    relationTypes,
    departments,
    designations,
    employeeLevels,
    locations,
    isLoading,
  } = useEmployeeLookups({
    countryId: form.countryId || undefined,
    stateProvinceId: form.stateProvinceId || undefined,
  });

  const availableManagerOptions = useMemo(
    () => managerOptions.filter((manager) => manager.id !== employeeId),
    [employeeId, managerOptions],
  );

  const runtimeForm = useMemo(
    () => buildRuntimeFormState(runtimeFormLayout),
    [runtimeFormLayout],
  );

  function updateField<Key extends keyof EmployeeFormValues>(
    key: Key,
    value: EmployeeFormValues[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));

    if (["personalEmail", "phone", "cnic", "workEmail"].includes(String(key))) {
      setDuplicateConflicts([]);
      setHasConfirmedDuplicateWarning(false);
      setError(null);
    }
  }

  function validateForm() {
    if (!autoGenerateEmployeeId && !form.employeeCode.trim()) {
      return "Employee code is required.";
    }

    if (!form.firstName.trim()) return "First name is required.";
    if (!form.lastName.trim()) return "Last name is required.";
    if (!form.phone.trim()) return "Phone is required.";
    if (!form.hireDate) return "Hire date is required.";

    if (settings?.requireDepartment && !form.departmentId.trim()) {
      return "Department is required by tenant employee settings.";
    }

    if (settings?.requireDesignation && !form.designationId.trim()) {
      return "Designation is required by tenant employee settings.";
    }

    if (
      settings?.requireReportingManager &&
      !form.reportingManagerEmployeeId.trim()
    ) {
      return "Reporting manager is required by tenant employee settings.";
    }

    if (settings?.requireWorkLocation && !form.locationId.trim()) {
      return "Work location is required by tenant employee settings.";
    }

    if (form.workEmail && !isValidEmail(form.workEmail)) {
      return "Work email must be a valid email address.";
    }

    if (form.personalEmail && !isValidEmail(form.personalEmail)) {
      return "Personal email must be a valid email address.";
    }

    if (
      canManageAccess &&
      form.provisionSystemAccess &&
      !form.workEmail.trim()
    ) {
      return "Work email is required when system access is enabled.";
    }

    if (
      canManageAccess &&
      form.provisionSystemAccess &&
      form.initialRoleIds.length === 0
    ) {
      return "Select at least one initial role when system access is enabled.";
    }

    if (form.terminationDate && form.terminationDate < form.hireDate) {
      return "Termination date cannot be before hire date.";
    }

    if (form.confirmationDate && form.confirmationDate < form.hireDate) {
      return "Confirmation date cannot be before hire date.";
    }

    if (form.probationEndDate && form.probationEndDate < form.hireDate) {
      return "Probation end date cannot be before hire date.";
    }

    if (
      form.dateOfBirth &&
      form.dateOfBirth > new Date().toISOString().slice(0, 10)
    ) {
      return "Date of birth cannot be in the future.";
    }

    return null;
  }

  function buildPayload() {
    return {
      employeeCode: autoGenerateEmployeeId ? undefined : form.employeeCode,
      firstName: form.firstName,
      middleName: emptyToUndefined(form.middleName),
      lastName: form.lastName,
      preferredName: emptyToUndefined(form.preferredName),
      workEmail: emptyToUndefined(form.workEmail),
      personalEmail: emptyToUndefined(form.personalEmail),
      phone: form.phone,
      alternatePhone: emptyToUndefined(form.alternatePhone),
      dateOfBirth: emptyToUndefined(form.dateOfBirth),
      gender: emptyToUndefined(form.gender),
      maritalStatus: emptyToUndefined(form.maritalStatus),
      nationalityCountryId: emptyToUndefined(form.nationalityCountryId),
      nationality: emptyToUndefined(form.nationality),
      cnic: emptyToUndefined(form.cnic),
      bloodGroup: emptyToUndefined(form.bloodGroup),
      employmentStatus: form.employmentStatus,
      employeeType: emptyToUndefined(form.employeeType),
      workMode: emptyToUndefined(form.workMode),
      contractType: emptyToUndefined(form.contractType),
      hireDate: form.hireDate,
      confirmationDate: emptyToUndefined(form.confirmationDate),
      probationEndDate: emptyToUndefined(form.probationEndDate),
      terminationDate: emptyToUndefined(form.terminationDate),
      departmentId: emptyToUndefined(form.departmentId),
      designationId: emptyToUndefined(form.designationId),
      employeeLevelId: emptyToUndefined(form.employeeLevelId),
      locationId: emptyToUndefined(form.locationId),
      officialJoiningLocationId: emptyToUndefined(
        form.officialJoiningLocationId,
      ),
      reportingManagerEmployeeId: emptyToUndefined(
        form.reportingManagerEmployeeId,
      ),
      userId: emptyToUndefined(form.userId),
      noticePeriodDays:
        form.noticePeriodDays == null ? undefined : form.noticePeriodDays,
      taxIdentifier: emptyToUndefined(form.taxIdentifier),
      provisionSystemAccess: canManageAccess
        ? form.provisionSystemAccess
        : undefined,
      sendInvitationNow:
        canManageAccess && form.provisionSystemAccess
          ? form.sendInvitationNow
          : undefined,
      initialRoleIds:
        canManageAccess && form.provisionSystemAccess
          ? form.initialRoleIds
          : [],
      addressLine1: emptyToUndefined(form.addressLine1),
      addressLine2: emptyToUndefined(form.addressLine2),
      countryId: emptyToUndefined(form.countryId),
      stateProvinceId: emptyToUndefined(form.stateProvinceId),
      cityId: emptyToUndefined(form.cityId),
      postalCode: emptyToUndefined(form.postalCode),
      emergencyContactName: emptyToUndefined(form.emergencyContactName),
      emergencyContactRelation:
        form.emergencyContactRelation == null
          ? undefined
          : form.emergencyContactRelation,
      emergencyContactRelationTypeId: emptyToUndefined(
        form.emergencyContactRelationTypeId,
      ),
      emergencyContactPhone: emptyToUndefined(form.emergencyContactPhone),
      emergencyContactAlternatePhone: emptyToUndefined(
        form.emergencyContactAlternatePhone,
      ),
    };
  }

  async function checkDuplicates(payload: Record<string, unknown>) {
    if (mode !== "create") return [];

    const response = await fetch("/api/employees/duplicate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | DuplicateCheckResponse
      | { message?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "message" in data && data.message
          ? data.message
          : "Unable to check duplicate employee records.",
      );
    }

    return data && "conflicts" in data ? data.conflicts ?? [] : [];
  }

  async function submitEmployee(payload: Record<string, unknown>) {
    const response = await fetch(
      mode === "create" ? "/api/employees" : `/api/employees/${employeeId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json().catch(() => null)) as {
      message?: string;
      id?: string;
    } | null;

    if (!response.ok) {
      throw new Error(data?.message ?? `Unable to ${mode} employee.`);
    }

    const nextEmployeeId = employeeId ?? data?.id;

    if (!nextEmployeeId) {
      throw new Error("Employee was saved but no employee id was returned.");
    }

    router.push(`/dashboard/employees/${nextEmployeeId}`);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    const payload = buildPayload();

    try {
      if (!hasConfirmedDuplicateWarning) {
        const conflicts = await checkDuplicates(payload);

        const blockingConflicts = conflicts.filter(
          (conflict) => conflict.severity === "BLOCK",
        );

        const warningConflicts = conflicts.filter(
          (conflict) => conflict.severity === "WARN",
        );

        if (blockingConflicts.length > 0) {
          setDuplicateConflicts(blockingConflicts);
          setError(
            "Duplicate employee record found. Please resolve the highlighted conflict before creating this employee.",
          );
          setIsSubmitting(false);
          return;
        }

        if (warningConflicts.length > 0) {
          setDuplicateConflicts(warningConflicts);
          setError(null);
          setIsSubmitting(false);
          return;
        }
      }

      await submitEmployee(payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : `Unable to ${mode} employee.`,
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      {runtimeForm.isCustomized ? (
        <section className="rounded-[20px] border border-accent/20 bg-accent-soft px-5 py-4 text-sm text-accent">
          This employee form is using the published customization layout. Fields
          not present in the layout are hidden in this integrated runtime view;
          backend validation still enforces required system rules.
        </section>
      ) : null}

      {autoGenerateEmployeeId ? (
        <section className="rounded-[20px] border border-border bg-white px-5 py-4 text-sm text-muted">
          Employee code is controlled by tenant settings and will be generated
          automatically on save. Current format preview:{" "}
          <span className="font-semibold text-foreground">
            {employeeCodeExample}
          </span>
        </section>
      ) : null}

      {runtimeForm.showSection("Core Identity") ? (
        <FormSection
          description="Use work email only for authentication-facing identity. Personal email remains contact-only."
          title="Core Identity"
        >
          {runtimeForm.showField("employeeCode") ? (
            autoGenerateEmployeeId ? (
              <TextField
                disabled
                hint={`Will be generated by the system on save, for example ${employeeCodeExample}.`}
                label="Employee code"
                value={employeeCodePreview}
                onChange={() => undefined}
              />
            ) : (
              <TextField
                label="Employee code"
                required
                value={form.employeeCode}
                onChange={(value) => updateField("employeeCode", value)}
              />
            )
          ) : null}

          {runtimeForm.showField("firstName") ? (
            <TextField
              label="First name"
              required
              value={form.firstName}
              onChange={(value) => updateField("firstName", value)}
            />
          ) : null}

          {runtimeForm.showField("middleName") ? (
            <TextField
              label="Middle name"
              value={form.middleName}
              onChange={(value) => updateField("middleName", value)}
            />
          ) : null}

          {runtimeForm.showField("lastName") ? (
            <TextField
              label="Last name"
              required
              value={form.lastName}
              onChange={(value) => updateField("lastName", value)}
            />
          ) : null}

          {runtimeForm.showField("preferredName") ? (
            <TextField
              label="Preferred name"
              value={form.preferredName}
              onChange={(value) => updateField("preferredName", value)}
            />
          ) : null}

          {runtimeForm.showField("email") ||
            runtimeForm.showField("workEmail") ? (
            <TextField
              label="Work Email"
              type="email"
              value={form.workEmail}
              onChange={(value) => updateField("workEmail", value)}
            />
          ) : null}

          {runtimeForm.showField("personalEmail") ? (
            <TextField
              label="Personal Email (Contact Only)"
              type="email"
              value={form.personalEmail}
              onChange={(value) => updateField("personalEmail", value)}
            />
          ) : null}

          {runtimeForm.showField("phone") ? (
            <TextField
              label="Phone"
              required
              value={form.phone}
              onChange={(value) => updateField("phone", value)}
            />
          ) : null}

          {runtimeForm.showField("alternatePhone") ? (
            <TextField
              label="Alternate phone"
              value={form.alternatePhone}
              onChange={(value) => updateField("alternatePhone", value)}
            />
          ) : null}

          {runtimeForm.showField("dateOfBirth") ? (
            <DateField
              label="Date of birth"
              value={form.dateOfBirth}
              onChange={(value) => updateField("dateOfBirth", value)}
            />
          ) : null}

          {runtimeForm.showField("gender") ? (
            <SelectField
              label="Gender"
              options={GENDER_OPTIONS}
              value={form.gender}
              onChange={(value) => updateField("gender", value)}
            />
          ) : null}

          {runtimeForm.showField("maritalStatus") ? (
            <SelectField
              label="Marital status"
              options={MARITAL_STATUS_OPTIONS}
              value={form.maritalStatus}
              onChange={(value) => updateField("maritalStatus", value)}
            />
          ) : null}

          {runtimeForm.showField("nationalityCountryId") ||
            runtimeForm.showField("nationality") ? (
            <LookupField
              label="Nationality"
              options={countries}
              placeholder={
                isLoading ? "Loading nationalities..." : "Select nationality"
              }
              value={form.nationalityCountryId}
              onChange={(value) => {
                updateField("nationalityCountryId", value);
                const selectedCountry = countries.find(
                  (country) => country.id === value,
                );
                updateField("nationality", selectedCountry?.name ?? "");
              }}
            />
          ) : null}

          {runtimeForm.showField("cnic") ? (
            <TextField
              label="CNIC"
              value={form.cnic}
              onChange={(value) => updateField("cnic", value)}
              variant="cnic"
            />
          ) : null}

          {runtimeForm.showField("bloodGroup") ? (
            <SelectField
              label="Blood group"
              options={BLOOD_GROUP_OPTIONS}
              value={form.bloodGroup}
              onChange={(value) => updateField("bloodGroup", value)}
            />
          ) : null}
        </FormSection>
      ) : null}

      {canManageAccess ? (
        <FormSection
          description="Provision a linked user account with the employee's work email and send an activation link instead of sharing a password."
          title="System Access"
        >
          <ToggleField
            description="Create or link a tenant user account for this employee."
            label="Give system access"
            onChange={(value) => updateField("provisionSystemAccess", value)}
            value={form.provisionSystemAccess}
          />

          <ToggleField
            description="Send the activation link immediately after saving."
            disabled={!form.provisionSystemAccess}
            label="Send invitation now"
            onChange={(value) => updateField("sendInvitationNow", value)}
            value={form.sendInvitationNow}
          />

          <RoleChecklist
            disabled={!form.provisionSystemAccess}
            onChange={(roleIds) => updateField("initialRoleIds", roleIds)}
            roles={roleOptions}
            selectedRoleIds={form.initialRoleIds}
          />
        </FormSection>
      ) : null}

      {runtimeForm.showSection("Employment Info") ? (
        <FormSection
          description="These fields drive hierarchy, leave, attendance, payroll, and reporting behavior."
          title="Employment Info"
        >
          <DateField
            label="Hire date"
            required
            value={form.hireDate}
            onChange={(value) => updateField("hireDate", value)}
          />

          <DateField
            label="Confirmation date"
            value={form.confirmationDate}
            onChange={(value) => updateField("confirmationDate", value)}
          />

          <DateField
            label="Probation end date"
            value={form.probationEndDate}
            onChange={(value) => updateField("probationEndDate", value)}
          />

          <DateField
            label="Termination date"
            value={form.terminationDate}
            onChange={(value) => updateField("terminationDate", value)}
          />

          <SelectField
            hint="Default value is controlled by tenant employee settings."
            label="Employment status"
            options={EMPLOYMENT_STATUS_OPTIONS}
            value={form.employmentStatus}
            onChange={(value) =>
              updateField(
                "employmentStatus",
                value as EmployeeFormValues["employmentStatus"],
              )
            }
          />

          <SelectField
            hint="Default value is controlled by tenant employee settings."
            label="Employee type"
            options={EMPLOYEE_TYPE_OPTIONS}
            value={form.employeeType}
            onChange={(value) => updateField("employeeType", value)}
          />

          <SelectField
            hint="Default value is controlled by tenant employee settings."
            label="Work mode"
            options={WORK_MODE_OPTIONS}
            value={form.workMode}
            onChange={(value) => updateField("workMode", value)}
          />

          <SelectField
            label="Contract type"
            options={CONTRACT_TYPE_OPTIONS}
            value={form.contractType}
            onChange={(value) => updateField("contractType", value)}
          />

          <LookupField
            hint={
              settings?.requireDepartment
                ? "Required by tenant employee settings."
                : undefined
            }
            label="Department"
            required={settings?.requireDepartment}
            options={departments}
            placeholder={
              isLoading ? "Loading departments..." : "Select department"
            }
            value={form.departmentId}
            onChange={(value) => updateField("departmentId", value)}
          />

          <LookupField
            hint={
              settings?.requireDesignation
                ? "Required by tenant employee settings."
                : undefined
            }
            label="Designation"
            required={settings?.requireDesignation}
            options={designations}
            placeholder={
              isLoading ? "Loading designations..." : "Select designation"
            }
            value={form.designationId}
            onChange={(value) => updateField("designationId", value)}
          />

          <LookupField
            label="Employee level"
            options={employeeLevels.map((level) => ({
              ...level,
              name: level.code ? `${level.name} (${level.code})` : level.name,
            }))}
            placeholder={
              isLoading ? "Loading employee levels..." : "Select employee level"
            }
            value={form.employeeLevelId}
            onChange={(value) => updateField("employeeLevelId", value)}
          />

          <LookupField
            hint={
              settings?.requireWorkLocation
                ? "Required by tenant employee settings."
                : undefined
            }
            label="Location"
            required={settings?.requireWorkLocation}
            options={locations}
            placeholder={isLoading ? "Loading locations..." : "Select location"}
            value={form.locationId}
            onChange={(value) => updateField("locationId", value)}
          />

          <LookupField
            label="Official joining location"
            options={locations}
            placeholder={
              isLoading ? "Loading locations..." : "Select joining location"
            }
            value={form.officialJoiningLocationId}
            onChange={(value) =>
              updateField("officialJoiningLocationId", value)
            }
          />

          <LookupField
            hint={
              settings?.requireReportingManager
                ? "Required by tenant employee settings."
                : undefined
            }
            label="Reporting manager"
            required={settings?.requireReportingManager}
            options={availableManagerOptions.map((manager) => ({
              id: manager.id,
              name: `${manager.fullName} (${manager.employeeCode})`,
            }))}
            placeholder="Search reporting manager"
            value={form.reportingManagerEmployeeId}
            onChange={(value) =>
              updateField("reportingManagerEmployeeId", value)
            }
          />

          <NumberField
            label="Notice period (days)"
            value={form.noticePeriodDays}
            onChange={(value) => updateField("noticePeriodDays", value)}
          />

          <TextField
            label="Tax identifier"
            value={form.taxIdentifier}
            onChange={(value) => updateField("taxIdentifier", value)}
          />

          <TextField
            label="Linked user ID"
            hint="Optional for now. Use only when connecting an existing auth user."
            value={form.userId}
            onChange={(value) => updateField("userId", value)}
          />
        </FormSection>
      ) : null}

      {runtimeForm.showSection("Address") ? (
        <FormSection
          description="Use lookup-backed geography fields so addresses stay consistent across the platform."
          title="Address"
        >
          <TextField
            label="Address line 1"
            value={form.addressLine1}
            onChange={(value) => updateField("addressLine1", value)}
          />

          <TextField
            label="Address line 2"
            value={form.addressLine2}
            onChange={(value) => updateField("addressLine2", value)}
          />

          <LookupField
            label="Country"
            options={countries}
            placeholder={isLoading ? "Loading countries..." : "Select country"}
            value={form.countryId}
            onChange={(value) => {
              updateField("countryId", value);
              updateField("stateProvinceId", "");
              updateField("cityId", "");
            }}
          />

          <LookupField
            disabled={!form.countryId}
            label="State / Province"
            options={states}
            placeholder={
              !form.countryId
                ? "Select country first"
                : isLoading
                  ? "Loading states..."
                  : "Select state / province"
            }
            value={form.stateProvinceId}
            onChange={(value) => {
              updateField("stateProvinceId", value);
              updateField("cityId", "");
            }}
          />

          <LookupField
            disabled={!form.countryId}
            label="City"
            options={cities}
            placeholder={
              !form.countryId
                ? "Select country first"
                : isLoading
                  ? "Loading cities..."
                  : "Select city"
            }
            value={form.cityId}
            onChange={(value) => updateField("cityId", value)}
          />

          <TextField
            label="Postal code"
            value={form.postalCode}
            onChange={(value) => updateField("postalCode", value)}
          />
        </FormSection>
      ) : null}

      {runtimeForm.showSection("Emergency Contact") ? (
        <FormSection
          description="These details support emergency outreach without making the relation free-form everywhere."
          title="Emergency Contact"
        >
          <TextField
            label="Emergency contact name"
            value={form.emergencyContactName}
            onChange={(value) => updateField("emergencyContactName", value)}
          />

          <LookupField
            label="Relation type"
            options={relationTypes}
            placeholder={
              isLoading ? "Loading relation types..." : "Select relation type"
            }
            value={form.emergencyContactRelationTypeId}
            onChange={(value) =>
              updateField("emergencyContactRelationTypeId", value)
            }
          />

          <TextField
            label="Relation label"
            hint="Optional free text if you need a more specific label."
            value={form.emergencyContactRelation}
            onChange={(value) => updateField("emergencyContactRelation", value)}
          />

          <TextField
            label="Emergency contact phone"
            value={form.emergencyContactPhone}
            onChange={(value) => updateField("emergencyContactPhone", value)}
          />

          <TextField
            label="Emergency contact alternate phone"
            value={form.emergencyContactAlternatePhone}
            onChange={(value) =>
              updateField("emergencyContactAlternatePhone", value)
            }
          />
        </FormSection>
      ) : null}

      {duplicateConflicts.length > 0 ? (
        <DuplicateConflictPanel
          conflicts={duplicateConflicts}
          onContinue={() => {
            setHasConfirmedDuplicateWarning(true);
            setDuplicateConflicts([]);
          }}
        />
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : hasConfirmedDuplicateWarning && mode === "create"
              ? "Create anyway"
              : mode === "create"
                ? "Create employee"
                : "Save changes"}
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

function DuplicateConflictPanel({
  conflicts,
  onContinue,
}: {
  conflicts: DuplicateConflict[];
  onContinue: () => void;
}) {
  const hasBlockingConflict = conflicts.some(
    (conflict) => conflict.severity === "BLOCK",
  );

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <h4 className="font-semibold">
        {hasBlockingConflict
          ? "Duplicate employee detected"
          : "Possible duplicate employee found"}
      </h4>

      <p className="mt-1 text-amber-800">
        {hasBlockingConflict
          ? "This record cannot be created until the duplicate conflict is resolved."
          : "Review the possible duplicate before continuing."}
      </p>

      <div className="mt-3 grid gap-2">
        {conflicts.map((conflict) => (
          <div
            className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"
            key={`${conflict.ruleKey}-${conflict.value}`}
          >
            <span className="font-medium">{conflict.label}</span>
            <span className="mx-2 text-amber-600">→</span>
            <span>{conflict.value}</span>
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold">
              {conflict.severity}
            </span>
          </div>
        ))}
      </div>

      {!hasBlockingConflict ? (
        <button
          className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-950"
          onClick={onContinue}
          type="button"
        >
          Continue anyway
        </button>
      ) : null}
    </section>
  );
}

function ToggleField({
  description,
  disabled,
  label,
  onChange,
  value,
}: {
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <label className="rounded-2xl border border-border bg-white/80 px-4 py-4 text-sm">
      <span className="flex items-start justify-between gap-4">
        <span className="block">
          <span className="block font-medium text-foreground">{label}</span>
          <span className="mt-1 block text-xs text-muted">{description}</span>
        </span>

        <input
          checked={value}
          className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
      </span>
    </label>
  );
}

function RoleChecklist({
  disabled,
  onChange,
  roles,
  selectedRoleIds,
}: {
  disabled?: boolean;
  onChange: (roleIds: string[]) => void;
  roles: EmployeeRoleOption[];
  selectedRoleIds: string[];
}) {
  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <span className="font-medium text-foreground">Initial roles</span>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => {
          const checked = selectedRoleIds.includes(role.id);

          return (
            <label
              key={role.id}
              className="flex items-start gap-3 rounded-2xl border border-border bg-white/80 px-4 py-4"
            >
              <input
                checked={checked}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selectedRoleIds, role.id]);
                    return;
                  }

                  onChange(selectedRoleIds.filter((item) => item !== role.id));
                }}
                type="checkbox"
              />

              <span className="block">
                <span className="block font-medium text-foreground">
                  {role.name}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {role.key}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Work email is the only email used for login and invitations.
      </p>
    </div>
  );
}

function FormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <h4 className="text-lg font-semibold text-foreground">{title}</h4>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildRuntimeFormState(layout?: RuntimeFormLayout | null) {
  const fields =
    layout?.tabs
      ?.flatMap((tab) => tab.sections ?? [])
      .flatMap((section) => section.fields ?? [])
      .filter((field) => field.isVisible !== false)
      .map((field) => field.columnKey) ?? [];

  const visibleFields = new Set(fields.flatMap(expandEmployeeFieldAlias));
  const isCustomized = visibleFields.size > 0;

  return {
    isCustomized,
    showField(fieldKey: string) {
      return !isCustomized || visibleFields.has(fieldKey);
    },
    showSection(sectionTitle: string) {
      if (!isCustomized) return true;

      return (sectionFieldMap[sectionTitle] ?? []).some((fieldKey) =>
        visibleFields.has(fieldKey),
      );
    },
  };
}

const sectionFieldMap: Record<string, string[]> = {
  "Core Identity": [
    "employeeCode",
    "firstName",
    "middleName",
    "lastName",
    "preferredName",
    "email",
    "workEmail",
    "personalEmail",
    "phone",
    "alternatePhone",
    "dateOfBirth",
    "gender",
    "maritalStatus",
    "nationalityCountryId",
    "nationality",
    "cnic",
    "bloodGroup",
  ],
  "Employment Info": [
    "hireDate",
    "confirmationDate",
    "probationEndDate",
    "terminationDate",
    "employmentStatus",
    "employeeType",
    "workMode",
    "contractType",
    "departmentId",
    "designationId",
    "employeeLevelId",
    "locationId",
    "officialJoiningLocationId",
    "managerEmployeeId",
    "reportingManagerEmployeeId",
    "noticePeriodDays",
    "taxIdentifier",
    "userId",
  ],
  Address: [
    "addressLine1",
    "addressLine2",
    "countryId",
    "stateProvinceId",
    "cityId",
    "postalCode",
  ],
  "Emergency Contact": [
    "emergencyContactName",
    "emergencyContactRelationTypeId",
    "emergencyContactRelation",
    "emergencyContactPhone",
    "emergencyContactAlternatePhone",
  ],
};

function expandEmployeeFieldAlias(fieldKey: string) {
  const aliases: Record<string, string[]> = {
    email: ["email", "workEmail"],
    managerEmployeeId: ["managerEmployeeId", "reportingManagerEmployeeId"],
    departmentId: ["departmentId"],
    businessUnitId: ["businessUnitId"],
    employeeLevelId: ["employeeLevelId"],
  };

  return aliases[fieldKey] ?? [fieldKey];
}