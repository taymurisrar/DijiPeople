"use client";

import { useState } from "react";

import {
  COUNTRY_OPTIONS,
  PARTNERSHIP_MODEL_OPTIONS,
  readAttribution,
} from "../../lib/acquisition-options";

export function PartnerInquiryForm({
  privacyPolicyHref = null,
}: {
  /** Null when no privacy route exists yet — the notice renders without a link. */
  privacyPolicyHref?: string | null;
}) {
  const [busy, setBusy] = useState(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.get("type"),
          // The commercial relationship. `type` above is the contracting
          // entity type and cannot express it — ITEM-0030.
          partnershipModel: data.get("partnershipModel") || undefined,
          companyName: data.get("companyName"),
          contactFirstName: data.get("contactFirstName"),
          contactLastName: data.get("contactLastName"),
          email: data.get("email"),
          phone: data.get("phone"),
          country: data.get("country"),
          /*
           * An untouched <input> yields "" from FormData, not null, and
           * class-validator's @IsOptional() only skips null/undefined. The API
           * therefore ran @IsUrl() against "" and answered "website must be a
           * URL address" — so **every visitor who left this optional field
           * blank was unable to submit the form at all** (BUG-0048).
           *
           * Only `website` broke: the other optional fields are @IsString(),
           * which "" satisfies. `partnershipModel` above already had this
           * treatment, which is why it worked.
           */
          website: data.get("website") || undefined,
          message: data.get("message"),
          consentAccepted: data.get("consentAccepted") === "on",
          // Optional and separate — never a condition of submitting.
          marketingConsent: data.get("marketingConsent") === "on",
          source: "partner-page",
          ...readAttribution(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({
          message: payload.message ?? "Unable to submit your inquiry.",
        });
        return;
      }
      setResult(payload);
      form.reset();
    } catch {
      setResult({
        message: "Unable to submit your inquiry.",
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="How would you like to partner with DijiPeople?">
            <select name="partnershipModel" required className={control}>
              <option value="">Select a partnership type</option>
              {PARTNERSHIP_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Are you applying as a company or an individual?">
          <select name="type" required className={control}>
            <option value="COMPANY">A company or organization</option>
            <option value="INDIVIDUAL">An individual</option>
          </select>
        </Field>
        <Field label="Company / Organization name">
          <input name="companyName" className={control} />
        </Field>
        <Field label="First name">
          <input name="contactFirstName" required className={control} />
        </Field>
        <Field label="Last name">
          <input name="contactLastName" required className={control} />
        </Field>
        <Field label="Work email">
          <input name="email" type="email" required className={control} />
        </Field>
        <Field label="Phone number">
          <input name="phone" type="tel" className={control} />
        </Field>
        <Field label="Country / Region">
          <select name="country" className={control}>
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Company website">
          <input name="website" type="url" className={control} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tell us how you&rsquo;d like to work with DijiPeople">
            <textarea name="message" rows={5} className={`${control} py-3`} />
          </Field>
        </div>
      </div>
      {/*
        Acknowledgement and marketing are separate. Agreeing that we will use
        these details to assess a partnership is not agreement to be marketed
        to, and one checkbox for both makes the distinction unrecoverable.
      */}
      <div className="mt-5 rounded-xl border border-border bg-surface-muted p-4">
        <label className="flex items-start gap-3 text-sm leading-6 text-muted">
          <input
            name="consentAccepted"
            required
            type="checkbox"
            className="mt-1 h-4 w-4"
          />
          <span>
            I acknowledge that DijiPeople will use the information submitted to
            evaluate and respond to this partnership inquiry
            {privacyPolicyHref ? (
              <>
                , as described in our{" "}
                <a
                  className="font-semibold text-accent underline"
                  href={privacyPolicyHref}
                >
                  Privacy Policy
                </a>
              </>
            ) : null}
            .
          </span>
        </label>
        <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-muted">
          <input name="marketingConsent" type="checkbox" className="mt-1 h-4 w-4" />
          <span>
            I&rsquo;d also like partner and product updates from DijiPeople.{" "}
            <span className="text-muted-soft">
              Optional — you can ask us to stop at any time.
            </span>
          </span>
        </label>
      </div>
      {result ? (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${result.referenceNumber ? "bg-accent-soft text-accent-strong" : "bg-red-50 text-danger"}`}
          role="status"
        >
          {result.message}
          {result.referenceNumber ? (
            <strong className="ml-2">Reference {result.referenceNumber}</strong>
          ) : null}
        </div>
      ) : null}
      <button
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit partner inquiry"}
      </button>
    </form>
  );
}

const control =
  "mt-1 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
