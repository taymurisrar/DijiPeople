"use client";

import { FormEvent, useState } from "react";

type FormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
  country: string;
  companySize: string;
  interestArea: string;
  message: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  country: "",
  companySize: "",
  interestArea: "",
  message: "",
};

export function ContactForm() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const [firstName, ...lastName] = form.name.trim().split(/\s+/);
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName: lastName.join(" ") || "Contact",
        companyName: form.company,
        workEmail: form.email,
        phoneNumber: form.phone || undefined,
        industry: form.interestArea || "General HR operations",
        companySize: form.companySize || "Unknown",
        country: form.country || undefined,
        interestArea: form.interestArea || undefined,
        message: form.message,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setStatus(payload?.message ?? "Unable to submit your request.");
      return;
    }

    setForm(initialForm);
    setStatus("Thanks. Your message has been captured for the DijiPeople team.");
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-white p-5 shadow-sm" onSubmit={submit}>
      <Field label="Name" onChange={(value) => update("name", value)} required value={form.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" onChange={(value) => update("email", value)} required type="email" value={form.email} />
        <Field label="Company" onChange={(value) => update("company", value)} required value={form.company} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" onChange={(value) => update("phone", value)} type="tel" value={form.phone} />
        <Field label="Country" onChange={(value) => update("country", value)} value={form.country} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Company size" onChange={(value) => update("companySize", value)} options={["1-10", "11-50", "51-200", "201-500", "500+"]} value={form.companySize} />
        <Select label="Interest area" onChange={(value) => update("interestArea", value)} options={["Employee management", "Attendance and leave", "Payroll", "Recruitment", "Onboarding", "Full platform"]} value={form.interestArea} />
      </div>
      <label className="text-sm font-medium text-foreground">
        Message
        <textarea
          className="mt-2 min-h-32 w-full rounded-xl border border-border px-3 py-2"
          onChange={(event) => update("message", event.target.value)}
          required
          value={form.message}
        />
      </label>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <button className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Submitting..." : "Submit contact request"}
      </button>
    </form>
  );
}

function Field({
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
    <label className="text-sm font-medium text-foreground">
      {label}
      <input
        className="mt-2 w-full rounded-xl border border-border px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function Select({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-foreground">
      {label}
      <select
        className="mt-2 w-full rounded-xl border border-border px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
