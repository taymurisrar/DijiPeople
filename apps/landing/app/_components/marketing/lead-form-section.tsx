"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { ArrowRight, Mail, Phone } from "lucide-react";
import {
  companySizeOptions,
  contactInfo,
  industryOptions,
  interestedPlanOptions,
} from "./content";
import { readReferralCode } from "@/lib/referral";

type LeadFormState = {
  firstName: string;
  lastName: string;
  companyName: string;
  workEmail: string;
  phoneNumber: string;
  industry: string;
  companySize: string;
  interestedPlan: string;
  message: string;
  website: string;
};

/** Visual order, so "first invalid" means what the visitor sees. */
const FIELD_ORDER: Array<keyof LeadFormState> = [
  "firstName",
  "lastName",
  "companyName",
  "workEmail",
  "phoneNumber",
  "industry",
  "companySize",
  "interestedPlan",
  "message",
];

const initialState: LeadFormState = {
  firstName: "",
  lastName: "",
  companyName: "",
  workEmail: "",
  phoneNumber: "",
  industry: "",
  companySize: "",
  interestedPlan: "",
  message: "",
  website: "",
};

export function LeadFormSection() {
  /*
   * BUG-0063. This form used to disable its submit button until every required
   * field was filled, which made the messages in `validate()` unreachable for
   * exactly the case they were written for, and left keyboard and
   * screen-reader users with a dead control and no stated reason. Its inputs
   * additionally carried no name, id, required or autocomplete, and its errors
   * were bare spans inside the label — so the message became part of the
   * field's accessible *name* rather than its description.
   *
   * The shape below follows `/contact`, which already did all of this
   * correctly. Adopting the neighbour beats inventing a third convention.
   */
  const formId = useId();
  const errorSummaryRef = useRef<HTMLParagraphElement>(null);
  const [form, setForm] = useState<LeadFormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormState, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capture moved to `<ReferralCapture>` in the root layout. It ran here, in a
  // form-scoped effect, which meant a visitor who followed a partner link and
  // went straight to Plans -> Subscribe never captured anything and their
  // purchase was recorded as a direct sale. BUG-0281.

  function updateField<Key extends keyof LeadFormState>(
    key: Key,
    value: LeadFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const nextErrors: Partial<Record<keyof LeadFormState, string>> = {};

    if (!form.firstName.trim()) {
      nextErrors.firstName = "First name is required.";
    } else if (form.firstName.trim().length > 100) {
      nextErrors.firstName = "First name must be 100 characters or fewer.";
    }

    if (!form.lastName.trim()) {
      nextErrors.lastName = "Last name is required.";
    } else if (form.lastName.trim().length > 100) {
      nextErrors.lastName = "Last name must be 100 characters or fewer.";
    }

    if (!form.companyName.trim()) {
      nextErrors.companyName = "Company name is required.";
    } else if (form.companyName.trim().length > 160) {
      nextErrors.companyName = "Company name must be 160 characters or fewer.";
    }

    const normalizedEmail = form.workEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      nextErrors.workEmail = "Work email is required.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.includes("..")
    ) {
      nextErrors.workEmail = "Enter a valid work email address.";
    }

    if (!form.phoneNumber.trim()) {
      nextErrors.phoneNumber = "Phone number is required.";
    } else if (!/^[+()\-.\s0-9]{7,40}$/.test(form.phoneNumber.trim())) {
      nextErrors.phoneNumber = "Enter a valid business phone number.";
    }

    if (!form.industry) {
      nextErrors.industry = "Industry is required.";
    }

    if (!form.companySize) {
      nextErrors.companySize = "Company size is required.";
    }

    if (form.message.trim().length > 1500) {
      nextErrors.message = "Requirements must be 1500 characters or fewer.";
    }

    setErrors(nextErrors);

    // Move focus to the first thing that needs attention. Without this a
    // keyboard user submits, the page appears not to react, and the message
    // they need is somewhere above or below the viewport.
    const firstInvalid = FIELD_ORDER.find((key) => nextErrors[key]);
    if (firstInvalid) {
      requestAnimationFrame(() => {
        document
          .getElementById(`${formId}-${firstInvalid}`)
          ?.focus({ preventScroll: false });
      });
    }

    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          companyName: form.companyName.trim(),
          workEmail: form.workEmail.trim().toLowerCase(),
          phoneNumber: form.phoneNumber.trim(),
          industry: form.industry,
          companySize: form.companySize,
          interestedPlan: form.interestedPlan || undefined,
          message: form.message.trim() || undefined,
          website: form.website,
          referralCode: readReferralCode(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setSubmitError(data?.message ?? "Unable to submit your request right now.");
        return;
      }

      setSubmitted(true);
      setForm(initialState);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to submit your request right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      id="lead-form"
      className="rounded-[32px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,252,251,0.96))] p-6 shadow-sm lg:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
<div className="space-y-5 lg:flex lg:min-h-full lg:flex-col lg:justify-between">
  <div className="space-y-5">
    {/*
      `tracking-[0.22em]` here, `0.18em` two blocks down, `0.16em` everywhere
      else on the site. Three spacings for one eyebrow.
    */}
    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
      Request a demo
    </p>

    <div className="space-y-4">
      {/* Sans where every other page heading on the site is serif. */}
      <h1 className="max-w-md font-serif text-4xl leading-tight text-foreground sm:text-5xl">
        See it with your own setup in mind.
      </h1>

      <p className="max-w-md text-base leading-7 text-muted">
        Tell us how your team is organised and what you’re trying to fix
        first. We’ll show you the parts that matter to you and suggest a plan.
      </p>
    </div>
  </div>

  <div className="grid gap-3 rounded-[24px] border border-border bg-white/85 p-4">
    <ContactRow
      icon={<Mail className="h-4 w-4 text-accent" />}
      label="Business inquiries"
      value={contactInfo.businessEmail}
    />
    <ContactRow
      icon={<Mail className="h-4 w-4 text-accent" />}
      label="Support"
      value={contactInfo.supportEmail}
    />
    <ContactRow
      icon={<Phone className="h-4 w-4 text-accent" />}
      label="Phone"
      value={contactInfo.phone}
    />
  </div>
</div>

        <div className="rounded-[28px] border border-border bg-white/94 p-5 shadow-sm sm:p-6">
          {submitted ? (
            <div
              aria-live="polite"
              className="grid gap-3 rounded-[24px] border border-accent/20 bg-accent-soft/60 p-5"
              role="status"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                Request received
              </p>
              <h3 className="text-2xl font-semibold text-foreground">
                Thanks, your request is now with our team.
              </h3>
              <p className="text-sm leading-6 text-muted">
                We&apos;ve captured your details and will follow up with the next
                best step for your business.
              </p>
            </div>
          ) : (
            <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  error={errors.firstName}
                  label="First name"
                  id={`${formId}-firstName`}
                  name="firstName"
                  autoComplete="given-name"
                  onChange={(value) => updateField("firstName", value)}
                  placeholder="Enter first name"
                  required
                  value={form.firstName}
                />
                <Field
                  error={errors.lastName}
                  label="Last name"
                  id={`${formId}-lastName`}
                  name="lastName"
                  autoComplete="family-name"
                  onChange={(value) => updateField("lastName", value)}
                  placeholder="Enter last name"
                  required
                  value={form.lastName}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  error={errors.companyName}
                  label="Company name"
                  id={`${formId}-companyName`}
                  name="companyName"
                  autoComplete="organization"
                  onChange={(value) => updateField("companyName", value)}
                  placeholder="Enter company name"
                  required
                  value={form.companyName}
                />
                <Field
                  error={errors.workEmail}
                  label="Work email"
                  id={`${formId}-workEmail`}
                  name="workEmail"
                  autoComplete="email"
                  onChange={(value) => updateField("workEmail", value)}
                  placeholder="name@company.com"
                  required
                  type="email"
                  value={form.workEmail}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  error={errors.phoneNumber}
                  label="Phone number"
                  id={`${formId}-phoneNumber`}
                  name="phoneNumber"
                  autoComplete="tel"
                  onChange={(value) => updateField("phoneNumber", value)}
                  placeholder="+1 (312) 555-0184"
                  required
                  type="tel"
                  value={form.phoneNumber}
                />
                <SelectField
                  error={errors.industry}
                  label="Industry"
                  id={`${formId}-industry`}
                  name="industry"
                  onChange={(value) => updateField("industry", value)}
                  options={industryOptions}
                  required
                  value={form.industry}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  error={errors.companySize}
                  label="Company size"
                  id={`${formId}-companySize`}
                  name="companySize"
                  onChange={(value) => updateField("companySize", value)}
                  options={companySizeOptions}
                  required
                  value={form.companySize}
                />
                <SelectField
                  label="Interested plan"
                  id={`${formId}-interestedPlan`}
                  name="interestedPlan"
                  onChange={(value) => updateField("interestedPlan", value)}
                  options={interestedPlanOptions}
                  value={form.interestedPlan}
                />
              </div>

              <TextAreaField
                error={errors.message}
                label="Requirements"
                id={`${formId}-message`}
                  name="message"
                  onChange={(value) => updateField("message", value)}
                placeholder="Tell us about your team, goals, and workflows you want to improve."
                value={form.message}
              />

              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input
                    autoComplete="off"
                    tabIndex={-1}
                    value={form.website}
                    onChange={(event) => updateField("website", event.target.value)}
                  />
                </label>
              </div>

              {submitError ? (
                <p
                  aria-live="assertive"
                  className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
                  ref={errorSummaryRef}
                  role="alert"
                  tabIndex={-1}
                >
                  {submitError}
                </p>
              ) : null}

              <button
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
                aria-busy={isSubmitting}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Submitting..." : "Request demo"}
                {!isSubmitting ? (
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                ) : null}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-accent-soft p-2">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Field({
  autoComplete,
  error,
  id,
  label,
  name,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  autoComplete?: string;
  error?: string;
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2 text-sm">
      <label className="block font-medium text-foreground" htmlFor={id}>
        {label}
        {required ? null : <OptionalHint />}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className={[
          "w-full rounded-2xl border bg-surface-strong px-4 py-3 outline-none transition",
          "placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/15",
          error ? "border-danger/40 focus:border-danger focus:ring-danger/10" : "border-border",
        ].join(" ")}
        id={id}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
      {error ? (
        <span className="block text-xs text-danger" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/*
 * Optional is what gets marked, matching /contact. The hint is plain text
 * inside the label, so it reaches assistive technology as part of the field's
 * name rather than needing a separate legend to decode a glyph.
 */
function OptionalHint() {
  return <span className="font-normal text-muted-soft"> (optional)</span>;
}

function SelectField({
  autoComplete,
  error,
  id,
  label,
  name,
  onChange,
  options,
  required,
  value,
}: {
  autoComplete?: string;
  error?: string;
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: readonly string[];
  required?: boolean;
  value: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2 text-sm">
      <label className="block font-medium text-foreground" htmlFor={id}>
        {label}
        {required ? null : <OptionalHint />}
      </label>
      <select
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className={[
          "w-full rounded-2xl border bg-surface-strong px-4 py-3 outline-none transition",
          "focus:border-accent focus:ring-2 focus:ring-accent/15",
          error ? "border-danger/40 focus:border-danger focus:ring-danger/10" : "border-border",
        ].join(" ")}
        id={id}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <span className="block text-xs text-danger" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function TextAreaField({
  error,
  id,
  label,
  name,
  onChange,
  placeholder,
  value,
}: {
  error?: string;
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2 text-sm">
      <label className="block font-medium text-foreground" htmlFor={id}>
        {label}
        <OptionalHint />
      </label>
      <textarea
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        id={id}
        name={name}
        className={[
          "min-h-36 w-full rounded-2xl border bg-surface-strong px-4 py-3 outline-none transition",
          "placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/15",
          error ? "border-danger/40 focus:border-danger focus:ring-danger/10" : "border-border",
        ].join(" ")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {error ? (
        <span className="block text-xs text-danger" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
