"use client";

import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import { useEmployeeLookups } from "@/app/dashboard/employees/_components/use-employee-lookups";
import { LookupOption } from "@/app/dashboard/employees/types";
import {
  CandidateEducationRecord,
  CandidateExperienceRecord,
  CandidateRecord,
  RecruitmentStage,
} from "../types";

type CandidateFormProps = {
  mode: "create" | "edit";
  candidate?: CandidateRecord;
};

const sourceOptions = [
  "LinkedIn",
  "WhatsApp",
  "Referral / Contact",
  "Email",
  "Careers Page",
  "Recruitment Agency",
  "Walk-in",
  "Other",
];

const stageOptions: RecruitmentStage[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "FINAL_REVIEW",
  "OFFER",
  "APPROVED",
  "HIRED",
  "REJECTED",
  "ON_HOLD",
  "WITHDRAWN",
];

const workModeOptions = ["OFFICE", "REMOTE", "HYBRID"];
const genderOptions = ["MALE", "FEMALE", "OTHER"];

type CandidateFormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  personalEmail: string;
  phone: string;
  alternatePhone: string;
  source: string;
  currentStatus: RecruitmentStage;
  gender: string;
  dateOfBirth: string;
  nationalityCountryId: string;
  currentCountryId: string;
  currentStateProvinceId: string;
  currentCityId: string;
  addressArea: string;
  profileSummary: string;
  currentEmployer: string;
  currentDesignation: string;
  totalYearsExperience: string;
  relevantYearsExperience: string;
  currentSalary: string;
  expectedSalary: string;
  noticePeriodDays: string;
  earliestJoiningDate: string;
  reasonForLeavingCurrentEmployer: string;
  preferredWorkMode: string;
  preferredLocation: string;
  willingToRelocate: boolean;
  skills: string;
  certifications: string;
  interests: string;
  hobbies: string;
  strengths: string;
  concerns: string;
  recruiterNotes: string;
  hrNotes: string;
  portfolioUrl: string;
  linkedInUrl: string;
  otherProfileUrl: string;
  resumeDocumentReference: string;
  educationRecords: CandidateEducationRecord[];
  experienceRecords: CandidateExperienceRecord[];
};

function createInitialEducationRecords(
  candidate?: CandidateRecord,
): CandidateEducationRecord[] {
  return candidate?.educationRecords?.length
    ? candidate.educationRecords
    : [{ institutionName: "", degreeTitle: "" }];
}

function createInitialExperienceRecords(
  candidate?: CandidateRecord,
): CandidateExperienceRecord[] {
  return candidate?.experienceRecords?.length
    ? candidate.experienceRecords
    : [{ companyName: "", designation: "" }];
}

export function CandidateForm({ mode, candidate }: CandidateFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CandidateFormState>({
    firstName: candidate?.firstName ?? "",
    middleName: candidate?.middleName ?? "",
    lastName: candidate?.lastName ?? "",
    email: candidate?.email ?? "",
    personalEmail: candidate?.personalEmail ?? "",
    phone: candidate?.phone ?? "",
    alternatePhone: candidate?.alternatePhone ?? "",
    source: candidate?.source ?? "",
    currentStatus: candidate?.currentStatus ?? "APPLIED",
    gender: candidate?.gender ?? "",
    dateOfBirth: candidate?.dateOfBirth?.slice(0, 10) ?? "",
    nationalityCountryId: candidate?.nationalityCountryId ?? "",
    currentCountryId: candidate?.currentCountryId ?? "",
    currentStateProvinceId: candidate?.currentStateProvinceId ?? "",
    currentCityId: candidate?.currentCityId ?? "",
    addressArea: candidate?.addressArea ?? "",
    profileSummary: candidate?.profileSummary ?? "",
    currentEmployer: candidate?.currentEmployer ?? "",
    currentDesignation: candidate?.currentDesignation ?? "",
    totalYearsExperience:
      candidate?.totalYearsExperience !== null &&
      candidate?.totalYearsExperience !== undefined
        ? String(candidate.totalYearsExperience)
        : "",
    relevantYearsExperience:
      candidate?.relevantYearsExperience !== null &&
      candidate?.relevantYearsExperience !== undefined
        ? String(candidate.relevantYearsExperience)
        : "",
    currentSalary:
      candidate?.currentSalary !== null && candidate?.currentSalary !== undefined
        ? String(candidate.currentSalary)
        : "",
    expectedSalary:
      candidate?.expectedSalary !== null && candidate?.expectedSalary !== undefined
        ? String(candidate.expectedSalary)
        : "",
    noticePeriodDays:
      candidate?.noticePeriodDays !== null &&
      candidate?.noticePeriodDays !== undefined
        ? String(candidate.noticePeriodDays)
        : "",
    earliestJoiningDate: candidate?.earliestJoiningDate?.slice(0, 10) ?? "",
    reasonForLeavingCurrentEmployer:
      candidate?.reasonForLeavingCurrentEmployer ?? "",
    preferredWorkMode: candidate?.preferredWorkMode ?? "",
    preferredLocation: candidate?.preferredLocation ?? "",
    willingToRelocate: Boolean(candidate?.willingToRelocate),
    skills: (candidate?.skills ?? []).join(", "),
    certifications: (candidate?.certifications ?? []).join(", "),
    interests: (candidate?.interests ?? []).join(", "),
    hobbies: (candidate?.hobbies ?? []).join(", "),
    strengths: (candidate?.strengths ?? []).join(", "),
    concerns: candidate?.concerns ?? "",
    recruiterNotes: candidate?.recruiterNotes ?? "",
    hrNotes: candidate?.hrNotes ?? "",
    portfolioUrl: candidate?.portfolioUrl ?? "",
    linkedInUrl: candidate?.linkedInUrl ?? "",
    otherProfileUrl: candidate?.otherProfileUrl ?? "",
    resumeDocumentReference: candidate?.resumeDocumentReference ?? "",
    educationRecords: createInitialEducationRecords(candidate),
    experienceRecords: createInitialExperienceRecords(candidate),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { countries, states, cities, isLoading } = useEmployeeLookups({
    countryId: form.currentCountryId || undefined,
    stateProvinceId: form.currentStateProvinceId || undefined,
  });

  function updateField<Key extends keyof CandidateFormState>(
    key: Key,
    value: CandidateFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateEducationRecord(
    index: number,
    key: keyof CandidateEducationRecord,
    value: string,
  ) {
    setForm((current) => {
      const nextRecords = [...current.educationRecords];
      nextRecords[index] = { ...nextRecords[index], [key]: value };
      return { ...current, educationRecords: nextRecords };
    });
  }

  function updateExperienceRecord(
    index: number,
    key: keyof CandidateExperienceRecord,
    value: string,
  ) {
    setForm((current) => {
      const nextRecords = [...current.experienceRecords];
      nextRecords[index] = { ...nextRecords[index], [key]: value };
      return { ...current, experienceRecords: nextRecords };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Candidate first and last name are required.");
      return;
    }

    if (!form.email.trim() || !form.phone.trim()) {
      setError("Candidate email and phone are required.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      firstName: form.firstName.trim(),
      middleName: emptyToUndefined(form.middleName),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      personalEmail: emptyToUndefined(form.personalEmail),
      phone: form.phone.trim(),
      alternatePhone: emptyToUndefined(form.alternatePhone),
      source: emptyToUndefined(form.source),
      currentStatus: form.currentStatus,
      gender: emptyToUndefined(form.gender),
      dateOfBirth: emptyToUndefined(form.dateOfBirth),
      nationalityCountryId: emptyToUndefined(form.nationalityCountryId),
      currentCountryId: emptyToUndefined(form.currentCountryId),
      currentStateProvinceId: emptyToUndefined(form.currentStateProvinceId),
      currentCityId: emptyToUndefined(form.currentCityId),
      addressArea: emptyToUndefined(form.addressArea),
      profileSummary: emptyToUndefined(form.profileSummary),
      currentEmployer: emptyToUndefined(form.currentEmployer),
      currentDesignation: emptyToUndefined(form.currentDesignation),
      totalYearsExperience: toNumber(form.totalYearsExperience),
      relevantYearsExperience: toNumber(form.relevantYearsExperience),
      currentSalary: toNumber(form.currentSalary),
      expectedSalary: toNumber(form.expectedSalary),
      noticePeriodDays: toInteger(form.noticePeriodDays),
      earliestJoiningDate: emptyToUndefined(form.earliestJoiningDate),
      reasonForLeavingCurrentEmployer: emptyToUndefined(
        form.reasonForLeavingCurrentEmployer,
      ),
      preferredWorkMode: emptyToUndefined(form.preferredWorkMode),
      preferredLocation: emptyToUndefined(form.preferredLocation),
      willingToRelocate: form.willingToRelocate,
      skills: csvToArray(form.skills),
      certifications: csvToArray(form.certifications),
      interests: csvToArray(form.interests),
      hobbies: csvToArray(form.hobbies),
      strengths: csvToArray(form.strengths),
      concerns: emptyToUndefined(form.concerns),
      recruiterNotes: emptyToUndefined(form.recruiterNotes),
      hrNotes: emptyToUndefined(form.hrNotes),
      portfolioUrl: emptyToUndefined(form.portfolioUrl),
      linkedInUrl: emptyToUndefined(form.linkedInUrl),
      otherProfileUrl: emptyToUndefined(form.otherProfileUrl),
      resumeDocumentReference: emptyToUndefined(form.resumeDocumentReference),
      educationRecords: form.educationRecords
        .filter((record) => record.institutionName?.trim() && record.degreeTitle?.trim())
        .map((record) => ({
          institutionName: record.institutionName.trim(),
          degreeTitle: record.degreeTitle.trim(),
          fieldOfStudy: emptyToUndefined(record.fieldOfStudy),
          startDate: emptyToUndefined(record.startDate ?? ""),
          endDate: emptyToUndefined(record.endDate ?? ""),
          gradeOrCgpa: emptyToUndefined(record.gradeOrCgpa ?? ""),
          country: emptyToUndefined(record.country ?? ""),
          notes: emptyToUndefined(record.notes ?? ""),
        })),
      experienceRecords: form.experienceRecords
        .filter((record) => record.companyName?.trim() && record.designation?.trim())
        .map((record) => ({
          companyName: record.companyName.trim(),
          designation: record.designation.trim(),
          location: emptyToUndefined(record.location ?? ""),
          employmentType: emptyToUndefined(record.employmentType ?? ""),
          startDate: emptyToUndefined(record.startDate ?? ""),
          endDate: emptyToUndefined(record.endDate ?? ""),
          responsibilities: emptyToUndefined(record.responsibilities ?? ""),
          finalSalary: toNumber(
            record.finalSalary !== undefined && record.finalSalary !== null
              ? String(record.finalSalary)
              : "",
          ),
          reasonForLeaving: emptyToUndefined(record.reasonForLeaving ?? ""),
        })),
    };

    const response = await fetch(
      mode === "create" ? "/api/candidates" : `/api/candidates/${candidate?.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json().catch(() => null)) as
      | { id?: string; message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? `Unable to ${mode} candidate.`);
      setIsSubmitting(false);
      return;
    }

    router.push(`/dashboard/recruitment/candidates/${candidate?.id ?? data?.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <SectionTitle
          description="Capture the core identity and contact details we need before the candidate enters deeper review."
          title="Identity & Contact"
        />
        <TextField label="First name" required value={form.firstName} onChange={(value) => updateField("firstName", value)} />
        <TextField label="Middle name" value={form.middleName} onChange={(value) => updateField("middleName", value)} />
        <TextField label="Last name" required value={form.lastName} onChange={(value) => updateField("lastName", value)} />
        <SelectField label="Source" options={sourceOptions.map((option) => ({ id: option, name: option }))} value={form.source} onChange={(value) => updateField("source", value)} />
        <TextField label="Primary email" type="email" required value={form.email} onChange={(value) => updateField("email", value)} />
        <TextField label="Personal email" type="email" value={form.personalEmail} onChange={(value) => updateField("personalEmail", value)} />
        <TextField label="Phone" required value={form.phone} onChange={(value) => updateField("phone", value)} />
        <TextField label="Alternate phone" value={form.alternatePhone} onChange={(value) => updateField("alternatePhone", value)} />
        <SelectField label="Current stage" options={stageOptions.map((option) => ({ id: option, name: option.replaceAll("_", " ") }))} value={form.currentStatus} onChange={(value) => updateField("currentStatus", value as RecruitmentStage)} />
        <SelectField label="Gender" options={genderOptions.map((option) => ({ id: option, name: option }))} value={form.gender} onChange={(value) => updateField("gender", value)} />
        <TextField label="Date of birth" type="date" value={form.dateOfBirth} onChange={(value) => updateField("dateOfBirth", value)} />
        <SelectField label="Nationality" options={countries} placeholder={isLoading ? "Loading nationalities..." : "Select nationality"} value={form.nationalityCountryId} onChange={(value) => updateField("nationalityCountryId", value)} />
      </section>

      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <SectionTitle
          description="Use controlled location lookups so city and country persist cleanly into candidate and employee records."
          title="Location & Availability"
        />
        <SelectField label="Country" options={countries} placeholder={isLoading ? "Loading countries..." : "Select country"} value={form.currentCountryId} onChange={(value) => setForm((current) => ({ ...current, currentCountryId: value, currentStateProvinceId: "", currentCityId: "" }))} />
        <SelectField label="State / Province" disabled={!form.currentCountryId} options={states} placeholder={form.currentCountryId ? "Select state" : "Select country first"} value={form.currentStateProvinceId} onChange={(value) => setForm((current) => ({ ...current, currentStateProvinceId: value, currentCityId: "" }))} />
        <SelectField label="City" disabled={!form.currentCountryId} options={cities} placeholder={form.currentCountryId ? "Select city" : "Select country first"} value={form.currentCityId} onChange={(value) => updateField("currentCityId", value)} />
        <TextField label="Area / Address" value={form.addressArea} onChange={(value) => updateField("addressArea", value)} />
        <TextField label="Notice period (days)" type="number" value={form.noticePeriodDays} onChange={(value) => updateField("noticePeriodDays", value)} />
        <TextField label="Earliest joining date" type="date" value={form.earliestJoiningDate} onChange={(value) => updateField("earliestJoiningDate", value)} />
        <SelectField label="Preferred work mode" options={workModeOptions.map((option) => ({ id: option, name: option }))} value={form.preferredWorkMode} onChange={(value) => updateField("preferredWorkMode", value)} />
        <TextField label="Preferred location" value={form.preferredLocation} onChange={(value) => updateField("preferredLocation", value)} />
        <ToggleField label="Willing to relocate" checked={form.willingToRelocate} onChange={(checked) => updateField("willingToRelocate", checked)} />
      </section>

      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <SectionTitle
          description="Keep recruiter corrections and parsed resume data in one place so the profile stays trustworthy."
          title="Professional Summary"
        />
        <TextField label="Current employer" value={form.currentEmployer} onChange={(value) => updateField("currentEmployer", value)} />
        <TextField label="Current designation" value={form.currentDesignation} onChange={(value) => updateField("currentDesignation", value)} />
        <TextField label="Total experience (years)" type="number" value={form.totalYearsExperience} onChange={(value) => updateField("totalYearsExperience", value)} />
        <TextField label="Relevant experience (years)" type="number" value={form.relevantYearsExperience} onChange={(value) => updateField("relevantYearsExperience", value)} />
        <TextField label="Current salary" type="number" value={form.currentSalary} onChange={(value) => updateField("currentSalary", value)} />
        <TextField label="Expected salary" type="number" value={form.expectedSalary} onChange={(value) => updateField("expectedSalary", value)} />
        <TextAreaField className="md:col-span-2" label="Profile summary" value={form.profileSummary} onChange={(value) => updateField("profileSummary", value)} />
        <TextAreaField className="md:col-span-2" label="Reason for leaving current employer" value={form.reasonForLeavingCurrentEmployer} onChange={(value) => updateField("reasonForLeavingCurrentEmployer", value)} />
        <TextField label="LinkedIn URL" value={form.linkedInUrl} onChange={(value) => updateField("linkedInUrl", value)} />
        <TextField label="Portfolio URL" value={form.portfolioUrl} onChange={(value) => updateField("portfolioUrl", value)} />
        <TextField label="Other profile URL" value={form.otherProfileUrl} onChange={(value) => updateField("otherProfileUrl", value)} />
        <TextField label="Resume reference" value={form.resumeDocumentReference} onChange={(value) => updateField("resumeDocumentReference", value)} />
        <TextAreaField className="md:col-span-2" label="Skills (comma separated)" value={form.skills} onChange={(value) => updateField("skills", value)} />
        <TextAreaField className="md:col-span-2" label="Certifications (comma separated)" value={form.certifications} onChange={(value) => updateField("certifications", value)} />
      </section>

      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <SectionTitle
          description="These fields are especially useful after screening and interviews."
          title="Recruiter Enrichment"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextAreaField label="Interests (comma separated)" value={form.interests} onChange={(value) => updateField("interests", value)} />
          <TextAreaField label="Hobbies (comma separated)" value={form.hobbies} onChange={(value) => updateField("hobbies", value)} />
          <TextAreaField label="Strengths (comma separated)" value={form.strengths} onChange={(value) => updateField("strengths", value)} />
          <TextAreaField label="Concerns / risks" value={form.concerns} onChange={(value) => updateField("concerns", value)} />
          <TextAreaField label="Recruiter notes" value={form.recruiterNotes} onChange={(value) => updateField("recruiterNotes", value)} />
          <TextAreaField label="HR notes" value={form.hrNotes} onChange={(value) => updateField("hrNotes", value)} />
        </div>
      </section>

      <NestedRecordSection
        addLabel="Add education"
        description="Keep education structured so it can flow into match scoring and employee conversion."
        title="Education"
      >
        {form.educationRecords.map((record, index) => (
          <div key={`education-${index}`} className="grid gap-3 rounded-[20px] border border-border bg-white/90 p-4 md:grid-cols-2">
            <TextField label="Institution" value={record.institutionName} onChange={(value) => updateEducationRecord(index, "institutionName", value)} />
            <TextField label="Degree" value={record.degreeTitle} onChange={(value) => updateEducationRecord(index, "degreeTitle", value)} />
            <TextField label="Field of study" value={record.fieldOfStudy ?? ""} onChange={(value) => updateEducationRecord(index, "fieldOfStudy", value)} />
            <TextField label="Country" value={record.country ?? ""} onChange={(value) => updateEducationRecord(index, "country", value)} />
            <TextField label="Start date" type="date" value={record.startDate ?? ""} onChange={(value) => updateEducationRecord(index, "startDate", value)} />
            <TextField label="End date" type="date" value={record.endDate ?? ""} onChange={(value) => updateEducationRecord(index, "endDate", value)} />
            <TextField label="Grade / CGPA" value={record.gradeOrCgpa ?? ""} onChange={(value) => updateEducationRecord(index, "gradeOrCgpa", value)} />
            <TextAreaField className="md:col-span-2" label="Notes" value={record.notes ?? ""} onChange={(value) => updateEducationRecord(index, "notes", value)} />
          </div>
        ))}
        <button className="justify-self-start rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent" onClick={() => setForm((current) => ({ ...current, educationRecords: [...current.educationRecords, { institutionName: "", degreeTitle: "" }] }))} type="button">
          Add education
        </button>
      </NestedRecordSection>

      <NestedRecordSection
        addLabel="Add experience"
        description="Structured experience history makes screening, matching, and final employee creation much cleaner."
        title="Experience"
      >
        {form.experienceRecords.map((record, index) => (
          <div key={`experience-${index}`} className="grid gap-3 rounded-[20px] border border-border bg-white/90 p-4 md:grid-cols-2">
            <TextField label="Company" value={record.companyName} onChange={(value) => updateExperienceRecord(index, "companyName", value)} />
            <TextField label="Designation" value={record.designation} onChange={(value) => updateExperienceRecord(index, "designation", value)} />
            <TextField label="Employment type" value={record.employmentType ?? ""} onChange={(value) => updateExperienceRecord(index, "employmentType", value)} />
            <TextField label="Location" value={record.location ?? ""} onChange={(value) => updateExperienceRecord(index, "location", value)} />
            <TextField label="Start date" type="date" value={record.startDate ?? ""} onChange={(value) => updateExperienceRecord(index, "startDate", value)} />
            <TextField label="End date" type="date" value={record.endDate ?? ""} onChange={(value) => updateExperienceRecord(index, "endDate", value)} />
            <TextField label="Final salary" type="number" value={record.finalSalary !== undefined && record.finalSalary !== null ? String(record.finalSalary) : ""} onChange={(value) => updateExperienceRecord(index, "finalSalary", value)} />
            <TextField label="Reason for leaving" value={record.reasonForLeaving ?? ""} onChange={(value) => updateExperienceRecord(index, "reasonForLeaving", value)} />
            <TextAreaField className="md:col-span-2" label="Responsibilities" value={record.responsibilities ?? ""} onChange={(value) => updateExperienceRecord(index, "responsibilities", value)} />
          </div>
        ))}
        <button className="justify-self-start rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent" onClick={() => setForm((current) => ({ ...current, experienceRecords: [...current.experienceRecords, { companyName: "", designation: "" }] }))} type="button">
          Add experience
        </button>
      </NestedRecordSection>

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
          {isSubmitting ? "Saving..." : mode === "create" ? "Create candidate" : "Save candidate"}
        </button>
      </div>
    </form>
  );
}

function csvToArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyToUndefined(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}

function toInteger(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number.parseInt(trimmed, 10) : undefined;
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="md:col-span-2">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">{title}</p>
      <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>
    </div>
  );
}

function NestedRecordSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-muted">{title}</p>
        <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[20px] border border-border bg-white/90 px-4 py-3 text-sm md:col-span-2">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="font-medium text-foreground">{label}</span>
    </label>
  );
}

function TextField({
  label,
  onChange,
  required = false,
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
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  className = "",
  label,
  onChange,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`space-y-2 text-sm ${className}`}>
      <span className="font-medium text-foreground">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  disabled = false,
  label,
  onChange,
  options,
  placeholder = "Select option",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: LookupOption[];
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-100"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
