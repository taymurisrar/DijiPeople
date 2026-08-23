"use client";

import { useState } from "react";

import {
  ConsentBox,
  ConsentCheckbox,
  Field,
  FormFeedback,
  SubmitButton,
  controlClass,
  formCardClass,
  textareaClass,
} from "../_components/forms/form-kit";
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
      className={formCardClass}
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
              className={controlClass}
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
              className={controlClass}
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
              className={controlClass}
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
            className={controlClass}
          />
        </Field>

        <Field label="Last name" required>
          <input
            name="contactLastName"
            required
            autoComplete="family-name"
            className={controlClass}
          />
        </Field>

        <Field label="Work email" required>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={controlClass}
            placeholder="name@company.com"
          />
        </Field>

        <Field label="Phone number" required>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            className={controlClass}
            placeholder="+974 0000 0000"
          />
        </Field>

        <Field label="Country / Region" required>
          <select
            name="country"
            required
            className={controlClass}
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
              className={controlClass}
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
              className={textareaClass}
              placeholder="Briefly describe your business, target market, and how you'd like to partner with DijiPeople."
            />
          </Field>
        </div>
      </div>

      {/* Consent */}
      <div className="mt-6">
        <ConsentBox>
          <ConsentCheckbox name="consentAccepted" required>
            We can use these details to review and reply to this partnership
            inquiry
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
          </ConsentCheckbox>

          <ConsentCheckbox name="marketingConsent">
            I&rsquo;d also like partner and product updates from DijiPeople.{" "}
            <span className="text-muted-soft">
              Optional — you can ask us to stop at any time.
            </span>
          </ConsentCheckbox>
        </ConsentBox>
      </div>

      {/* Result */}
      {result ? (
        <div className="mt-4">
          <FormFeedback tone={result.referenceNumber ? "success" : "error"}>
            {result.message}
            {result.referenceNumber ? (
              <strong className="ml-2">
                Reference {result.referenceNumber}
              </strong>
            ) : null}
          </FormFeedback>
        </div>
      ) : null}

      {/* Submit */}
      <div className="mt-5">
        <SubmitButton busy={busy} busyLabel="Submitting…">
          Submit partner inquiry
        </SubmitButton>
      </div>

      {/*
        No "* Required fields" footnote.

        It explained the asterisk below the last field, which is after the point
        anyone needed the explanation, and it occupied the line where a
        submission error now appears. The asterisk carries "(required)" to a
        screen reader on its own — see `RequiredMark` in the form kit.
      */}
    </form>
  );
}
