"use client";

import { FormEvent, useId, useState } from "react";

import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INQUIRY_INTENT_OPTIONS,
  readAttribution,
  type LeadInquiryIntentValue,
} from "../../lib/acquisition-options";

type InterestArea = { key: string; label: string };

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  country: string;
  companySize: string;
  inquiryIntent: LeadInquiryIntentValue | "";
  interestAreas: string[];
  message: string;
  marketingConsent: boolean;
};

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  phone: "",
  country: "",
  companySize: "",
  inquiryIntent: "",
  interestAreas: [],
  message: "",
  marketingConsent: false,
};

type Submission =
  | { state: "idle" | "sending" | "sent" }
  | { state: "error"; message: string };

export function ContactForm({
  interestAreas,
  initialIntent = "",
  privacyPolicyHref = null,
}: {
  /** DijiPeople modules, from the feature catalogue the product gates on. */
  interestAreas: InterestArea[];
  /**
   * Preselected topic, e.g. a Wave 2 CTA linking from /plans with
   * ?intent=PRICING. Resolved and validated on the server so an arbitrary
   * query value never reaches this component, and so the first render already
   * has the right option selected — no effect, and nothing to re-render.
   */
  initialIntent?: LeadInquiryIntentValue | "";
  /** Null when no privacy route exists yet — the notice renders without a link. */
  privacyPolicyHref?: string | null;
}) {
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    inquiryIntent: initialIntent,
  });
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });
  const formId = useId();

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (submission.state === "error") setSubmission({ state: "idle" });
  }

  function toggleInterest(key: string) {
    setForm((current) => ({
      ...current,
      interestAreas: current.interestAreas.includes(key)
        ? current.interestAreas.filter((area) => area !== key)
        : [...current.interestAreas, key],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.state === "sending") return;

    setSubmission({ state: "sending" });

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          // Sent only when given. This used to fall back to "Contact" for
          // anyone with a single name — BUG-0021.
          lastName: form.lastName.trim() || undefined,
          companyName: form.company.trim(),
          workEmail: form.email.trim(),
          phoneNumber: form.phone.trim() || undefined,
          country: form.country || undefined,
          companySize: form.companySize || undefined,
          inquiryIntent: form.inquiryIntent || undefined,
          interestAreas: form.interestAreas.length
            ? form.interestAreas
            : undefined,
          message: form.message.trim() || undefined,
          marketingConsent: form.marketingConsent,
          // `industry` is deliberately not sent. The form does not ask for it,
          // and it previously received the interest area instead — BUG-0021.
          ...readAttribution(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setSubmission({
          state: "error",
          message:
            response.status === 429
              ? "That is a few too many submissions in a short time. Please wait a moment and try again."
              : (payload?.message ??
                "We could not send your message just now. Please try again in a moment."),
        });
        return;
      }

      // Only after the API confirms it persisted — never optimistically.
      setForm({ ...initialForm, inquiryIntent: initialIntent });
      setSubmission({ state: "sent" });
    } catch {
      setSubmission({
        state: "error",
        message:
          "We could not reach our servers. Check your connection and try again — your details are still here.",
      });
    }
  }

  if (submission.state === "sent") {
    return (
      <div
        aria-live="polite"
        className="rounded-[24px] border border-border bg-white p-6 shadow-sm"
        role="status"
      >
        <h2 className="text-xl font-semibold text-foreground">
          Thanks — we&rsquo;ve received your inquiry.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Our team will review what you sent and follow up using the contact
          details you provided.
        </p>
        <button
          className="mt-5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          onClick={() => setSubmission({ state: "idle" })}
          type="button"
        >
          Send another message
        </button>
      </div>
    );
  }

  const isSending = submission.state === "sending";

  return (
    <form
      className="grid gap-5 rounded-[24px] border border-border bg-white p-5 shadow-sm sm:p-6"
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          autoComplete="given-name"
          id={`${formId}-first`}
          label="First name"
          onChange={(value) => update("firstName", value)}
          required
          value={form.firstName}
        />
        <Field
          autoComplete="family-name"
          id={`${formId}-last`}
          label="Last name"
          onChange={(value) => update("lastName", value)}
          optionalHint
          value={form.lastName}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          autoComplete="email"
          id={`${formId}-email`}
          label="Work email"
          onChange={(value) => update("email", value)}
          required
          type="email"
          value={form.email}
        />
        <Field
          autoComplete="organization"
          id={`${formId}-company`}
          label="Company or organization"
          onChange={(value) => update("company", value)}
          required
          value={form.company}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          autoComplete="tel"
          id={`${formId}-phone`}
          label="Phone number"
          onChange={(value) => update("phone", value)}
          optionalHint
          type="tel"
          value={form.phone}
        />
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={`${formId}-country`}
        >
          Country or region
          <select
            className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal"
            id={`${formId}-country`}
            onChange={(event) => update("country", event.target.value)}
            value={form.country}
          >
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={`${formId}-intent`}
        >
          What can we help with?
          <select
            className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal"
            id={`${formId}-intent`}
            onChange={(event) =>
              update(
                "inquiryIntent",
                event.target.value as LeadInquiryIntentValue,
              )
            }
            required
            value={form.inquiryIntent}
          >
            <option value="">Select a topic</option>
            {INQUIRY_INTENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={`${formId}-size`}
        >
          Company size{" "}
          <span className="font-normal text-muted-soft">(optional)</span>
          <select
            className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal"
            id={`${formId}-size`}
            onChange={(event) => update("companySize", event.target.value)}
            value={form.companySize}
          >
            <option value="">Prefer not to say</option>
            {COMPANY_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {interestAreas.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Which areas interest you?{" "}
            <span className="font-normal text-muted-soft">
              (optional, choose any)
            </span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {interestAreas.map((area) => {
              const checked = form.interestAreas.includes(area.key);
              return (
                <label
                  className={[
                    "cursor-pointer rounded-xl border px-3 py-2 text-sm transition",
                    checked
                      ? "border-accent bg-accent-soft font-semibold text-accent"
                      : "border-border text-muted hover:bg-surface-muted",
                  ].join(" ")}
                  key={area.key}
                >
                  <input
                    checked={checked}
                    className="sr-only"
                    onChange={() => toggleInterest(area.key)}
                    type="checkbox"
                    value={area.key}
                  />
                  {area.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <label
        className="text-sm font-medium text-foreground"
        htmlFor={`${formId}-message`}
      >
        Anything else we should know?
        <textarea
          className="mt-2 min-h-32 w-full rounded-xl border border-border px-3 py-2 font-normal"
          id={`${formId}-message`}
          maxLength={1500}
          onChange={(event) => update("message", event.target.value)}
          value={form.message}
        />
      </label>

      {/*
        Privacy notice acknowledgement and marketing consent are separate on
        purpose. Acknowledging that we will use these details to reply is not
        agreement to be marketed to, and bundling them would make the
        distinction unrecoverable — and the consent unusable as evidence.
      */}
      <div className="rounded-xl border border-border bg-surface-muted p-4">
        <p className="text-sm leading-6 text-muted">
          We&rsquo;ll use the details you provide to respond to this inquiry
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
        </p>
        <label className="mt-3 flex items-start gap-3 text-sm text-muted">
          <input
            checked={form.marketingConsent}
            className="mt-0.5 h-4 w-4 rounded border-border"
            onChange={(event) =>
              update("marketingConsent", event.target.checked)
            }
            type="checkbox"
          />
          <span>
            I&rsquo;d also like occasional product and company updates from
            DijiPeople.{" "}
            <span className="text-muted-soft">
              Optional — you can ask us to stop at any time.
            </span>
          </span>
        </label>
      </div>

      {submission.state === "error" ? (
        <p
          aria-live="assertive"
          className="rounded-xl bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {submission.message}
        </p>
      ) : null}

      <button
        aria-busy={isSending}
        className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        disabled={isSending}
        type="submit"
      >
        {isSending ? "Sending…" : "Send inquiry"}
      </button>
    </form>
  );
}

function Field({
  autoComplete,
  id,
  label,
  onChange,
  optionalHint,
  required,
  type = "text",
  value,
}: {
  autoComplete?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  optionalHint?: boolean;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-foreground" htmlFor={id}>
      {label}
      {optionalHint ? (
        <span className="font-normal text-muted-soft"> (optional)</span>
      ) : null}
      <input
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-xl border border-border px-3 py-2 font-normal"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
