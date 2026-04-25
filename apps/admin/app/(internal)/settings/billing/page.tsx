import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function BillingSettingsPage() {
  return (
    <SettingsShell
      title="Billing defaults"
      description="Configure billing cycles, taxes, payment terms, and currency defaults."
    >
      <SettingsFormCard title="Billing behavior">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default billing cycle" value="Monthly" />
          <Field label="Default payment terms" value="Net 15" />
          <Field label="Default currency" value="USD" />
          <Field label="Tax calculation mode" value="Manual" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Billing controls">
        <div className="space-y-3">
          <Toggle label="Allow monthly billing" defaultChecked />
          <Toggle label="Allow annual billing" defaultChecked />
          <Toggle label="Auto-create invoice after subscription activation" defaultChecked />
          <Toggle label="Mark subscription past due when invoice is overdue" defaultChecked />
        </div>
      </SettingsFormCard>
    </SettingsShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input
        defaultValue={value}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
      />
    </label>
  );
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <span className="text-sm font-semibold text-slate-950">{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />
    </label>
  );
}