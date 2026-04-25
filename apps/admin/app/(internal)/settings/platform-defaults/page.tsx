import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function PlatformDefaultsPage() {
  return (
    <SettingsShell
      title="Platform defaults"
      description="Configure the global behavior used across DijiPeople admin, billing, tenants, and operational modules."
    >
      <SettingsFormCard
        title="Regional defaults"
        description="These values are used as the default configuration when new tenants or commercial records are created."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default country" value="Qatar" />
          <Field label="Default currency" value="USD" />
          <Field label="Default timezone" value="Asia/Qatar" />
          <Field label="Date format" value="DD/MM/YYYY" />
          <Field label="Time format" value="12-hour" />
          <Field label="Default locale" value="en-US" />
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
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
      />
    </label>
  );
}