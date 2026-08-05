"use client";

import { useState } from "react";

export function PartnerInquiryForm() {
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
          companyName: data.get("companyName"),
          contactFirstName: data.get("contactFirstName"),
          contactLastName: data.get("contactLastName"),
          email: data.get("email"),
          phone: data.get("phone"),
          country: data.get("country"),
          website: data.get("website"),
          message: data.get("message"),
          consentAccepted: data.get("consentAccepted") === "on",
          source: "partner-page",
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
        <Field label="Partner type">
          <select name="type" required className={control}>
            <option value="COMPANY">Company</option>
            <option value="INDIVIDUAL">Individual</option>
          </select>
        </Field>
        <Field label="Company name">
          <input name="companyName" className={control} />
        </Field>
        <Field label="First name">
          <input name="contactFirstName" required className={control} />
        </Field>
        <Field label="Last name">
          <input name="contactLastName" required className={control} />
        </Field>
        <Field label="Business email">
          <input name="email" type="email" required className={control} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" className={control} />
        </Field>
        <Field label="Country">
          <input name="country" className={control} />
        </Field>
        <Field label="Website">
          <input name="website" type="url" className={control} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="How would you work with DijiPeople?">
            <textarea name="message" rows={5} className={`${control} py-3`} />
          </Field>
        </div>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-muted">
        <input
          name="consentAccepted"
          required
          type="checkbox"
          className="mt-1 h-4 w-4"
        />
        <span>
          I consent to DijiPeople processing this information to assess and
          administer a potential partner relationship.
        </span>
      </label>
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
