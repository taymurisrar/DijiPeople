"use client";

import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import {
  BLOOD_GROUP_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
} from "../field-options";
import { EmployeeProfile } from "../types";
import { useEmployeeLookups } from "./use-employee-lookups";
import { Button } from "@/app/components/ui/button";

type PersonalState = {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  alternatePhone: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  nationalityCountryId: string;
  nationality: string;
  cnic: string;
  bloodGroup: string;
  addressLine1: string;
  addressLine2: string;
  countryId: string;
  stateProvinceId: string;
  cityId: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactRelationTypeId: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  emergencyContactAlternatePhone: string;
};

export function EmployeePersonalInfoForm({
  employee,
  mode = "admin",
}: {
  employee: EmployeeProfile;
  mode?: "admin" | "self-service";
}) {
  const router = useRouter();
  const [form, setForm] = useState<PersonalState>({
    firstName: employee.firstName,
    middleName: employee.middleName || "",
    lastName: employee.lastName,
    preferredName: employee.preferredName || "",
    workEmail: employee.workEmail || "",
    personalEmail: employee.personalEmail || "",
    phone: employee.phone,
    alternatePhone: employee.alternatePhone || "",
    dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : "",
    gender: employee.gender || "",
    maritalStatus: employee.maritalStatus || "",
    nationalityCountryId: employee.nationalityCountryId || "",
    nationality: employee.nationality || "",
    cnic: employee.cnic || "",
    bloodGroup: employee.bloodGroup || "",
    addressLine1: employee.addressLine1 || "",
    addressLine2: employee.addressLine2 || "",
    countryId: employee.countryId || "",
    stateProvinceId: employee.stateProvinceId || "",
    cityId: employee.cityId || "",
    postalCode: employee.postalCode || "",
    emergencyContactName: employee.emergencyContactName || "",
    emergencyContactRelationTypeId: employee.emergencyContactRelationTypeId || "",
    emergencyContactRelation: employee.emergencyContactRelation || "",
    emergencyContactPhone: employee.emergencyContactPhone || "",
    emergencyContactAlternatePhone:
      employee.emergencyContactAlternatePhone || "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { countries, states, cities, relationTypes, isLoading } =
    useEmployeeLookups({
      countryId: form.countryId || undefined,
      stateProvinceId: form.stateProvinceId || undefined,
    });

  const isSelfService = mode === "self-service";

  function setValue(key: keyof PersonalState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const responses = await Promise.all([
      fetch(`/api/employees/${employee.id}/personal-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          middleName: emptyToNull(form.middleName),
          lastName: form.lastName,
          preferredName: emptyToNull(form.preferredName),
          ...(!isSelfService ? { workEmail: emptyToNull(form.workEmail) } : {}),
          personalEmail: emptyToNull(form.personalEmail),
          phone: form.phone,
          alternatePhone: emptyToNull(form.alternatePhone),
          ...(!isSelfService
            ? {
                dateOfBirth: emptyToNull(form.dateOfBirth),
                gender: emptyToNull(form.gender),
                maritalStatus: emptyToNull(form.maritalStatus),
                nationalityCountryId: emptyToNull(form.nationalityCountryId),
                nationality: emptyToNull(form.nationality),
                cnic: emptyToNull(form.cnic),
                bloodGroup: emptyToNull(form.bloodGroup),
              }
            : {
                maritalStatus: emptyToNull(form.maritalStatus),
                bloodGroup: emptyToNull(form.bloodGroup),
              }),
        }),
      }),
      fetch(`/api/employees/${employee.id}/address`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressLine1: emptyToNull(form.addressLine1),
          addressLine2: emptyToNull(form.addressLine2),
          countryId: emptyToNull(form.countryId),
          stateProvinceId: emptyToNull(form.stateProvinceId),
          cityId: emptyToNull(form.cityId),
          postalCode: emptyToNull(form.postalCode),
        }),
      }),
      fetch(`/api/employees/${employee.id}/emergency-contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emergencyContactName: emptyToNull(form.emergencyContactName),
          emergencyContactRelationTypeId: emptyToNull(
            form.emergencyContactRelationTypeId,
          ),
          emergencyContactRelation: emptyToNull(form.emergencyContactRelation),
          emergencyContactPhone: emptyToNull(form.emergencyContactPhone),
          emergencyContactAlternatePhone: emptyToNull(
            form.emergencyContactAlternatePhone,
          ),
        }),
      }),
    ]);

    const failed = responses.find((response) => !response.ok);
    if (failed) {
      const data = (await failed.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ?? "Unable to update employee information.");
      setIsSubmitting(false);
      return;
    }

    setMessage(
      isSelfService
        ? "Your profile details were updated."
        : "Employee profile details updated.",
    );
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <FormSection
        description="Keep your personal and contact details up to date."
        title="Personal Details"
      >
        <TextField
          label="First name"
          required
          value={form.firstName}
          onChange={(value) => setValue("firstName", value)}
        />
        <TextField
          label="Middle name"
          value={form.middleName}
          onChange={(value) => setValue("middleName", value)}
        />
        <TextField
          label="Last name"
          required
          value={form.lastName}
          onChange={(value) => setValue("lastName", value)}
        />
        <TextField
          label="Preferred name"
          value={form.preferredName}
          onChange={(value) => setValue("preferredName", value)}
        />

        {!isSelfService ? (
          <TextField
            label="Work Email"
            type="email"
            value={form.workEmail}
            onChange={(value) => setValue("workEmail", value)}
          />
        ) : (
          <ReadOnlyField label="Work Email" value={form.workEmail || "Not set"} />
        )}

        <TextField
          label="Personal Email"
          type="email"
          value={form.personalEmail}
          onChange={(value) => setValue("personalEmail", value)}
        />
        <TextField
          label="Phone"
          required
          value={form.phone}
          onChange={(value) => setValue("phone", value)}
        />
        <TextField
          label="Alternate phone"
          value={form.alternatePhone}
          onChange={(value) => setValue("alternatePhone", value)}
        />

        {!isSelfService ? (
          <TextField
            label="Date of birth"
            type="date"
            value={form.dateOfBirth}
            onChange={(value) => setValue("dateOfBirth", value)}
          />
        ) : (
          <ReadOnlyField
            label="Date of birth"
            value={form.dateOfBirth || "Not set"}
          />
        )}

        {!isSelfService ? (
          <SelectField
            label="Gender"
            options={GENDER_OPTIONS}
            value={form.gender}
            onChange={(value) => setValue("gender", value)}
          />
        ) : (
          <ReadOnlyField label="Gender" value={form.gender || "Not set"} />
        )}

        <SelectField
          label="Marital status"
          options={MARITAL_STATUS_OPTIONS}
          value={form.maritalStatus}
          onChange={(value) => setValue("maritalStatus", value)}
        />

        {!isSelfService ? (
          <LookupField
            label="Nationality"
            options={countries}
            placeholder={
              isLoading ? "Loading nationalities..." : "Select nationality"
            }
            value={form.nationalityCountryId}
            onChange={(value) => {
              setValue("nationalityCountryId", value);
              const selectedCountry = countries.find((country) => country.id === value);
              setValue("nationality", selectedCountry?.name ?? "");
            }}
          />
        ) : (
          <ReadOnlyField
            label="Nationality"
            value={form.nationality || "Not set"}
          />
        )}

        {!isSelfService ? (
          <TextField
            label="CNIC"
            value={form.cnic}
            onChange={(value) => setValue("cnic", value)}
          />
        ) : (
          <ReadOnlyField label="CNIC" value={form.cnic || "Not set"} />
        )}

        <SelectField
          label="Blood group"
          options={BLOOD_GROUP_OPTIONS}
          value={form.bloodGroup}
          onChange={(value) => setValue("bloodGroup", value)}
        />
      </FormSection>

      <FormSection
        description="Keep your address details current."
        title="Address"
      >
        <TextField
          label="Address line 1"
          value={form.addressLine1}
          onChange={(value) => setValue("addressLine1", value)}
        />
        <TextField
          label="Address line 2"
          value={form.addressLine2}
          onChange={(value) => setValue("addressLine2", value)}
        />
        <LookupField
          label="Country"
          options={countries}
          placeholder={isLoading ? "Loading countries..." : "Select country"}
          value={form.countryId}
          onChange={(value) => {
            setValue("countryId", value);
            setValue("stateProvinceId", "");
            setValue("cityId", "");
          }}
        />
        <LookupField
          label="State / Province"
          disabled={!form.countryId}
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
            setValue("stateProvinceId", value);
            setValue("cityId", "");
          }}
        />
        <LookupField
          label="City"
          disabled={!form.countryId}
          options={cities}
          placeholder={
            !form.countryId
              ? "Select country first"
              : isLoading
                ? "Loading cities..."
                : "Select city"
          }
          value={form.cityId}
          onChange={(value) => setValue("cityId", value)}
        />
        <TextField
          label="Postal code"
          value={form.postalCode}
          onChange={(value) => setValue("postalCode", value)}
        />
      </FormSection>

      <FormSection
        description="Keep an emergency contact on file."
        title="Emergency Contact"
      >
        <TextField
          label="Contact name"
          value={form.emergencyContactName}
          onChange={(value) => setValue("emergencyContactName", value)}
        />
        <LookupField
          label="Relation type"
          options={relationTypes}
          placeholder={
            isLoading ? "Loading relation types..." : "Select relation type"
          }
          value={form.emergencyContactRelationTypeId}
          onChange={(value) => setValue("emergencyContactRelationTypeId", value)}
        />
        <TextField
          label="Relation label"
          value={form.emergencyContactRelation}
          onChange={(value) => setValue("emergencyContactRelation", value)}
        />
        <TextField
          label="Contact phone"
          value={form.emergencyContactPhone}
          onChange={(value) => setValue("emergencyContactPhone", value)}
        />
        <TextField
          label="Alternate phone"
          value={form.emergencyContactAlternatePhone}
          onChange={(value) => setValue("emergencyContactAlternatePhone", value)}
        />
      </FormSection>

      {message ? (
        <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div>
<Button
  variant="primary"
  size="lg"
  loading={isSubmitting}
  loadingText="Saving..."
  disabled={isSubmitting}
  type="submit"
>
  {isSelfService ? "Save my profile" : "Save personal info"}
</Button>
      </div>
    </form>
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
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
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

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="w-full rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-muted">
        {value}
      </div>
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

function LookupField({
  disabled,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-slate-50 disabled:text-muted"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={`${label}-${option.id}`} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
