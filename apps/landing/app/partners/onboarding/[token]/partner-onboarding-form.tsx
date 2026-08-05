"use client";

import { useEffect, useState } from "react";

type Invitation = {
  status: string;
  partner: { displayName: string; email: string; type: string };
  expiresAt: string;
  latestSubmission?: Record<string, unknown> | null;
};

export function PartnerOnboardingForm({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    fetch(`/api/partners/onboarding/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message);
        setInvitation(payload);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load onboarding.",
        ),
      );
  }, [token]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      legalName: data.get("legalName"),
      registrationNumber: data.get("registrationNumber"),
      registeredAddress: {
        line1: data.get("addressLine1"),
        city: data.get("city"),
        country: data.get("country"),
      },
      taxInformation: { taxId: data.get("taxId") },
      bankingInformation: {
        bankName: data.get("bankName"),
        accountName: data.get("accountName"),
        iban: data.get("iban"),
      },
      authorizedSigner: {
        name: data.get("signerName"),
        email: data.get("signerEmail"),
        title: data.get("signerTitle"),
      },
      businessProfile: {
        website: data.get("website"),
        serviceRegions: data.get("serviceRegions"),
        experience: data.get("experience"),
      },
      privacyConsent: data.get("privacyConsent") === "on",
    };
    const response = await fetch(
      `/api/partners/onboarding/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      },
    );
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.message ?? "Unable to submit onboarding.");
      return;
    }
    setDone(true);
  }
  if (error && !invitation)
    return <State title="Onboarding unavailable" description={error} />;
  if (!invitation)
    return (
      <State
        title="Opening your secure onboarding"
        description="Please wait while we validate your invitation."
      />
    );
  if (done)
    return (
      <State
        title="Onboarding submitted"
        description="Your information is locked for review. The DijiPeople partner team will contact you if clarification is needed."
      />
    );
  const previous = invitation.latestSubmission ?? {};
  return (
    <form onSubmit={submit} className="space-y-6">
      <header className="rounded-[28px] border border-border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Secure partner onboarding
        </p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">
          Welcome, {invitation.partner.displayName}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Complete the legal, payment, and authorized signer information
          required to prepare your partner agreement. Invitation expires{" "}
          {new Date(invitation.expiresAt).toLocaleDateString()}.
        </p>
      </header>
      <Section
        title="Legal entity"
        description="Information used for due diligence and the agreement."
      >
        <Input
          name="legalName"
          label="Legal name"
          required
          defaultValue={String(
            previous.legalName ?? invitation.partner.displayName,
          )}
        />
        <Input name="registrationNumber" label="Registration number" required />
        <Input name="taxId" label="Tax ID" required />
        <Input name="website" label="Website" type="url" />
      </Section>
      <Section title="Registered address">
        <Input name="addressLine1" label="Address" required />
        <Input name="city" label="City" required />
        <Input name="country" label="Country" required />
      </Section>
      <Section title="Banking and payment">
        <Input name="bankName" label="Bank name" required />
        <Input name="accountName" label="Account name" required />
        <Input name="iban" label="IBAN / account number" required />
      </Section>
      <Section title="Authorized signer">
        <Input name="signerName" label="Signer name" required />
        <Input
          name="signerEmail"
          label="Signer email"
          type="email"
          required
          defaultValue={invitation.partner.email}
        />
        <Input name="signerTitle" label="Title" required />
      </Section>
      <Section title="Partner profile">
        <Input name="serviceRegions" label="Service regions" />
        <label className="md:col-span-2 text-sm font-semibold text-foreground">
          Relevant experience
          <textarea
            name="experience"
            rows={5}
            className={`${control} h-auto py-3`}
          />
        </label>
      </Section>
      <label className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-sm leading-6 text-muted">
        <input
          name="privacyConsent"
          type="checkbox"
          required
          className="mt-1 h-4 w-4"
        />
        <span>
          I confirm this information is accurate and consent to its use for
          partner due diligence, contracting, payments, and account
          administration.
        </span>
      </label>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted">{description}</p>
      ) : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
const control =
  "mt-1 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-normal text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
function Input({
  name,
  label,
  type = "text",
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-semibold text-foreground">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={control}
      />
    </label>
  );
}
function State({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-border bg-white p-10 text-center shadow-sm">
      <h1 className="font-serif text-3xl text-foreground">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
    </div>
  );
}
