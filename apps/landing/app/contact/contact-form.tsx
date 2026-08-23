"use client";

import { FormEvent, useState } from "react";

import {
  ConsentBox,
  ConsentCheckbox,
  Field,
  Fieldset,
  FormFeedback,
  SubmitButton,
  controlClass,
  formCardClass,
  textareaClass,
} from "../_components/forms/form-kit";
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
    <form className={`grid gap-5 ${formCardClass}`} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input
            autoComplete="given-name"
            className={controlClass}
            name="firstName"
            onChange={(event) => update("firstName", event.target.value)}
            required
            value={form.firstName}
          />
        </Field>
        <Field label="Last name">
          <input
            autoComplete="family-name"
            className={controlClass}
            name="lastName"
            onChange={(event) => update("lastName", event.target.value)}
            value={form.lastName}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work email" required>
          <input
            autoComplete="email"
            className={controlClass}
            name="email"
            onChange={(event) => update("email", event.target.value)}
            required
            type="email"
            value={form.email}
          />
        </Field>
        <Field label="Company or organization" required>
          <input
            autoComplete="organization"
            className={controlClass}
            name="company"
            onChange={(event) => update("company", event.target.value)}
            required
            value={form.company}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number">
          <input
            autoComplete="tel"
            className={controlClass}
            name="phone"
            onChange={(event) => update("phone", event.target.value)}
            type="tel"
            value={form.phone}
          />
        </Field>
        <Field label="Country or region">
          <select
            className={controlClass}
            name="country"
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
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What can we help with?" required>
          <select
            className={controlClass}
            name="inquiryIntent"
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
        </Field>
        <Field label="Company size">
          <select
            className={controlClass}
            name="companySize"
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
        </Field>
      </div>

      {interestAreas.length > 0 ? (
        <Fieldset hint="Choose any" label="Which areas interest you?">
          <div className="mt-3 flex flex-wrap gap-2">
            {interestAreas.map((area) => {
              const checked = form.interestAreas.includes(area.key);
              return (
                <label
                  className={[
                    "cursor-pointer rounded-xl border px-3 py-2 text-sm font-normal transition",
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
        </Fieldset>
      ) : null}

      <Field label="Anything else we should know?">
        <textarea
          className={textareaClass}
          maxLength={1500}
          name="message"
          onChange={(event) => update("message", event.target.value)}
          placeholder="Tell us what you're trying to solve, and roughly when you'd like to start."
          value={form.message}
        />
      </Field>

      {/*
        Privacy notice acknowledgement and marketing consent are separate on
        purpose. Acknowledging that we will use these details to reply is not
        agreement to be marketed to, and bundling them would make the
        distinction unrecoverable — and the consent unusable as evidence.
      */}
      <ConsentBox>
        <p className="text-sm leading-6 text-muted">
          We&rsquo;ll use these details to reply to you
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
        </p>
        <ConsentCheckbox
          checked={form.marketingConsent}
          name="marketingConsent"
          onChange={(checked) => update("marketingConsent", checked)}
        >
          I&rsquo;d also like occasional product and company updates from
          DijiPeople.{" "}
          <span className="text-muted-soft">
            Optional — you can ask us to stop at any time.
          </span>
        </ConsentCheckbox>
      </ConsentBox>

      {submission.state === "error" ? (
        <FormFeedback tone="error">{submission.message}</FormFeedback>
      ) : null}

      <SubmitButton busy={isSending} busyLabel="Sending…">
        Send inquiry
      </SubmitButton>
    </form>
  );
}
