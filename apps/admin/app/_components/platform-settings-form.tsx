"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PlatformSettingsRecord } from "./platform-lifecycle-types";

type Props = {
  settings: PlatformSettingsRecord;
};

export function PlatformSettingsForm({ settings }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    platformDefaults: JSON.stringify(settings.platformDefaults ?? {}, null, 2),
    publicPlanVisibility: JSON.stringify(settings.publicPlanVisibility ?? {}, null, 2),
    billingDefaults: JSON.stringify(settings.billingDefaults ?? {}, null, 2),
    invoiceDefaults: JSON.stringify(settings.invoiceDefaults ?? {}, null, 2),
    emailProvider: JSON.stringify(settings.emailProvider ?? {}, null, 2),
    branding: JSON.stringify(settings.branding ?? {}, null, 2),
    featureCatalog: JSON.stringify(settings.featureCatalog ?? {}, null, 2),
    leadDefinitions: JSON.stringify(settings.leadDefinitions ?? {}, null, 2),
  });

  function parseJson(value: string, label: string) {
    try {
      return JSON.parse(value || "{}");
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    let payload: Record<string, unknown>;
    try {
      payload = {
        platformDefaults: parseJson(form.platformDefaults, "Platform defaults"),
        publicPlanVisibility: parseJson(form.publicPlanVisibility, "Public plan visibility"),
        billingDefaults: parseJson(form.billingDefaults, "Billing defaults"),
        invoiceDefaults: parseJson(form.invoiceDefaults, "Invoice defaults"),
        emailProvider: parseJson(form.emailProvider, "Email provider"),
        branding: parseJson(form.branding, "Branding"),
        featureCatalog: parseJson(form.featureCatalog, "Feature catalog"),
        leadDefinitions: parseJson(form.leadDefinitions, "Lead definitions"),
      };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid JSON payload.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/super-admin/platform-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.message ?? "Unable to save platform settings.");
        return;
      }

      setMessage("Platform settings saved.");
      router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <JsonField
        label="Platform defaults"
        value={form.platformDefaults}
        onChange={(value) => setForm((current) => ({ ...current, platformDefaults: value }))}
      />
      <JsonField
        label="Public plan visibility"
        value={form.publicPlanVisibility}
        onChange={(value) => setForm((current) => ({ ...current, publicPlanVisibility: value }))}
      />
      <JsonField
        label="Billing defaults"
        value={form.billingDefaults}
        onChange={(value) => setForm((current) => ({ ...current, billingDefaults: value }))}
      />
      <JsonField
        label="Invoice defaults"
        value={form.invoiceDefaults}
        onChange={(value) => setForm((current) => ({ ...current, invoiceDefaults: value }))}
      />
      <JsonField
        label="Email provider"
        value={form.emailProvider}
        onChange={(value) => setForm((current) => ({ ...current, emailProvider: value }))}
      />
      <JsonField
        label="Branding"
        value={form.branding}
        onChange={(value) => setForm((current) => ({ ...current, branding: value }))}
      />
      <JsonField
        label="Feature catalog"
        value={form.featureCatalog}
        onChange={(value) => setForm((current) => ({ ...current, featureCatalog: value }))}
      />
      <JsonField
        label="Lead definitions"
        value={form.leadDefinitions}
        onChange={(value) => setForm((current) => ({ ...current, leadDefinitions: value }))}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {message ?? "Platform settings are global and separate from tenant settings."}
        </p>
        <button
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <textarea
        className="mt-2 min-h-36 w-full rounded-2xl border border-slate-300 px-4 py-3 font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
