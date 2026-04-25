import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function CustomerDefinitionsPage() {
  return (
    <SettingsShell
      title="Customer definitions"
      description="Manage customer lifecycle stages, account readiness rules, and conversion defaults."
    >
      <SettingsFormCard title="Customer lifecycle">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default customer status" value="Prospect" />
          <Field label="Active customer status" value="Active" />
          <Field label="Churned customer status" value="Churned" />
          <Field label="Default account type" value="Company" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Readiness rules">
        <div className="space-y-3">
          <Toggle label="Require billing contact before onboarding" defaultChecked />
          <Toggle label="Require company profile before tenant creation" defaultChecked />
          <Toggle label="Allow multiple onboarding records over time" defaultChecked />
          <Toggle label="Allow only one active onboarding at a time" defaultChecked />
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