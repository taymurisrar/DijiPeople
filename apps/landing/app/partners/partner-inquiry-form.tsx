"use client";

import { useState } from "react";

import {
  COUNTRY_OPTIONS,
  PARTNERSHIP_MODEL_OPTIONS,
  readAttribution,
} from "../../lib/acquisition-options";

type ApplicantType = "COMPANY" | "INDIVIDUAL";

export function PartnerInquiryForm({
  privacyPolicyHref = null,
}: {
  privacyPolicyHref?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [applicantType, setApplicantType] =
    useState<ApplicantType>("COMPANY");

  const [result, setResult] = useState<{
    referenceNumber?: string;
    message?: string;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;

    setBusy(true);
    setResult(null);

    try {
      const data = new FormData(form);

      const response = await fetch("/api/partners/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: data.get("type"),

          partnershipModel:
            data.get("partnershipModel") || undefined,

          companyName:
            applicantType === "COMPANY"
              ? data.get("companyName") || undefined
              : undefined,

          contactFirstName: data.get("contactFirstName"),
          contactLastName: data.get("contactLastName"),

          email: data.get("email"),
          phone: data.get("phone"),
          country: data.get("country"),

          website:
            applicantType === "COMPANY"
              ? data.get("website") || undefined
              : undefined,

          message: data.get("message"),

          consentAccepted:
            data.get("consentAccepted") === "on",

          marketingConsent:
            data.get("marketingConsent") === "on",

          source: "partner-page",

          ...readAttribution(),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setResult({
          message:
            payload.message ??
            "Unable to submit your inquiry. Please review the form and try again.",
        });
        return;
      }

      setResult(payload);

      form.reset();
      setApplicantType("COMPANY");
    } catch {
      setResult({
        message:
          "Unable to submit your inquiry. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[28px] border border-border bg-white p-6 shadow-md"
    >
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {/* Partnership model */}
        <div className="sm:col-span-2">
          <Field
            label="How would you like to partner with DijiPeople?"
            required
          >
            <select
              name="partnershipModel"
              required
              className={control}
              defaultValue=""
            >
              <option value="" disabled>
                Select a partnership type
              </option>

              {PARTNERSHIP_MODEL_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Applicant type */}
        <div
          className={
            applicantType === "INDIVIDUAL"
              ? "sm:col-span-2"
              : undefined
          }
        >
<Field label="Applicant type" required>
            <select
              name="type"
              required
              value={applicantType}
              onChange={(event) =>
                setApplicantType(
                  event.target.value as ApplicantType,
                )
              }
              className={control}
            >
              <option value="COMPANY">
                A company or organization
              </option>

              <option value="INDIVIDUAL">
                An individual
              </option>
            </select>
          </Field>
        </div>

        {/* Company-only fields */}
        {applicantType === "COMPANY" ? (
          <Field
            label="Company / Organization name"
            required
          >
            <input
              name="companyName"
              required
              autoComplete="organization"
              className={control}
              placeholder="e.g. Maseer Group"
            />
          </Field>
        ) : null}

        {/* Contact */}
        <Field label="First name" required>
          <input
            name="contactFirstName"
            required
            autoComplete="given-name"
            className={control}
          />
        </Field>

        <Field label="Last name" required>
          <input
            name="contactLastName"
            required
            autoComplete="family-name"
            className={control}
          />
        </Field>

        <Field label="Work email" required>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={control}
            placeholder="name@company.com"
          />
        </Field>

        <Field label="Phone number" required>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            className={control}
            placeholder="+974 0000 0000"
          />
        </Field>

        <Field label="Country / Region" required>
          <select
            name="country"
            required
            className={control}
            defaultValue=""
          >
            <option value="" disabled>
              Select a country
            </option>

            {COUNTRY_OPTIONS.map((country) => (
              <option
                key={country.value}
                value={country.value}
              >
                {country.label}
              </option>
            ))}
          </select>
        </Field>

        {applicantType === "COMPANY" ? (
          <Field
            label="Company website"
            hint="Optional"
          >
            <input
              name="website"
              type="url"
              autoComplete="url"
              className={control}
              placeholder="https://example.com"
            />
          </Field>
        ) : null}

        {/* Message */}
        <div className="sm:col-span-2">
          <Field
            label="Tell us how you'd like to work with DijiPeople"
            required
          >
            <textarea
              name="message"
              required
              rows={5}
              maxLength={2000}
              className={textareaControl}
              placeholder="Briefly describe your business, target market, and how you'd like to partner with DijiPeople."
            />
          </Field>
        </div>
      </div>

      {/* Consent */}
      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-surface-muted p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-muted">
          <input
            name="consentAccepted"
            required
            type="checkbox"
            className={checkboxControl}
          />

          <span>
            <span className="text-danger" aria-hidden="true">
              *{" "}
            </span>

            I acknowledge that DijiPeople will use the
            information submitted to evaluate and respond to
            this partnership inquiry
            {privacyPolicyHref ? (
              <>
                , as described in our{" "}
                <a
                  className="font-semibold text-accent underline underline-offset-2"
                  href={privacyPolicyHref}
                >
                  Privacy Policy
                </a>
              </>
            ) : null}
            .
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-muted">
          <input
            name="marketingConsent"
            type="checkbox"
            className={checkboxControl}
          />

          <span>
            I&rsquo;d also like to receive partner and product
            updates from DijiPeople.{" "}
            <span className="text-muted-soft">
              Optional — you can unsubscribe at any time.
            </span>
          </span>
        </label>
      </div>

      {/* Result */}
      {result ? (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            result.referenceNumber
              ? "bg-accent-soft text-accent-strong"
              : "bg-red-50 text-danger"
          }`}
          role="status"
          aria-live="polite"
        >
          {result.message}

          {result.referenceNumber ? (
            <strong className="ml-2">
              Reference {result.referenceNumber}
            </strong>
          ) : null}
        </div>
      ) : null}

      {/* Submit */}
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Submitting…"
          : "Submit partner inquiry"}
      </button>

      <p className="mt-3 text-center text-xs text-muted-soft">
        <span className="text-danger">*</span> Required fields
      </p>
    </form>
  );
}

const control =
  "mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-surface-muted";

const textareaControl =
  "mt-1.5 min-h-[128px] w-full resize-y rounded-xl border border-border bg-white px-3 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/10";

const checkboxControl =
  "mt-1 h-4 w-4 shrink-0 rounded border-border accent-accent";

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>
          {label}

          {required ? (
            <span
              className="ml-1 text-danger"
              aria-hidden="true"
            >
              *
            </span>
          ) : null}
        </span>

        {hint ? (
          <span className="text-xs font-normal text-muted-soft">
            {hint}
          </span>
        ) : null}
      </span>

      {children}
    </label>
  );
}