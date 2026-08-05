"use client";

import Link from "next/link";
import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";

export type BillingDefaults = {
  defaultBillingCycle: "MONTHLY" | "ANNUAL";
  paymentTermsDays: number;
  taxCalculationMode: "MANUAL" | "AUTOMATIC";
  allowMonthlyBilling: boolean;
  allowAnnualBilling: boolean;
  autoCreateInvoice: boolean;
  markPastDueWhenOverdue: boolean;
};

const FALLBACKS: BillingDefaults = {
  defaultBillingCycle: "MONTHLY",
  paymentTermsDays: 15,
  taxCalculationMode: "MANUAL",
  allowMonthlyBilling: true,
  allowAnnualBilling: true,
  autoCreateInvoice: true,
  markPastDueWhenOverdue: true,
};

export function BillingDefaultsForm({ initialDefaults }: { initialDefaults: Partial<BillingDefaults> }) {
  const { defaults } = usePlatformDefaults();
  const [baseline, setBaseline] = useState<BillingDefaults>(() => ({ ...FALLBACKS, ...initialDefaults }));
  const [form, setForm] = useState(baseline);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasChanges = JSON.stringify(form) !== JSON.stringify(baseline);

  function update<K extends keyof BillingDefaults>(key: K, value: BillingDefaults[K]) {
    setMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/super-admin/platform-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billingDefaults: form }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setMessage({ tone: "error", text: payload?.message ?? "Unable to save billing defaults." });
          return;
        }
        const next = { ...FALLBACKS, ...(payload?.billingDefaults ?? form) };
        setForm(next);
        setBaseline(next);
        setMessage({ tone: "success", text: "Billing defaults saved." });
      } catch {
        setMessage({ tone: "error", text: "Network error. Billing defaults were not saved." });
      }
    });
  }

  return (
    <div className="space-y-5">
      {message ? <AppNotification tone={message.tone}>{message.text}</AppNotification> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Transaction currency</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{defaults.currency}</p>
          <p className="mt-1 text-sm text-slate-600">Default for new plans, invoices, subscriptions, and payments.</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Reporting currency</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{defaults.reportingCurrency}</p>
          <p className="mt-1 text-sm text-slate-600">Used by consolidated financial summaries and dashboards.</p>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Currency is controlled in one place. <Link href="/settings/platform-defaults" className="font-semibold text-[var(--admin-primary)] hover:underline">Manage regional and currency settings</Link>.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Default billing cycle</legend>
          <div className="mt-2 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group">
            {(["MONTHLY", "ANNUAL"] as const).map((cycle) => (
              <button key={cycle} type="button" onClick={() => update("defaultBillingCycle", cycle)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${form.defaultBillingCycle === cycle ? "bg-white text-[var(--admin-primary)] shadow-sm" : "text-slate-500"}`}>
                {cycle === "MONTHLY" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-medium text-slate-800">
          Payment terms (days)
          <input type="number" min={0} max={365} value={form.paymentTermsDays} onChange={(event) => update("paymentTermsDays", Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--admin-primary)]" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Toggle label="Allow monthly billing" checked={form.allowMonthlyBilling} onChange={(value) => update("allowMonthlyBilling", value)} />
        <Toggle label="Allow annual billing" checked={form.allowAnnualBilling} onChange={(value) => update("allowAnnualBilling", value)} />
        <Toggle label="Create invoice after activation" checked={form.autoCreateInvoice} onChange={(value) => update("autoCreateInvoice", value)} />
        <Toggle label="Mark subscriptions past due when overdue" checked={form.markPastDueWhenOverdue} onChange={(value) => update("markPastDueWhenOverdue", value)} />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
        <button type="button" disabled={isPending || !hasChanges} onClick={() => setForm(baseline)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Reset</button>
        <button type="button" disabled={isPending || !hasChanges} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{isPending ? "Saving..." : "Save billing defaults"}</button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--admin-primary)]" />
    </label>
  );
}
