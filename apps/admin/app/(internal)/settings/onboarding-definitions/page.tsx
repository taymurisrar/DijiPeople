import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function OnboardingDefinitionsPage() {
  return (
    <SettingsShell
      title="Onboarding definitions"
      description="Configure onboarding statuses, checklist behavior, and tenant readiness rules."
    >
      <SettingsFormCard title="Onboarding lifecycle">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default onboarding status" value="Draft" />
          <Field label="In-progress status" value="In progress" />
          <Field label="Completed status" value="Completed" />
          <Field label="Cancelled status" value="Cancelled" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Tenant readiness">
        <div className="space-y-3">
          <Toggle label="Require completed checklist before tenant activation" defaultChecked />
          <Toggle label="Create tenant only after onboarding approval" defaultChecked />
          <Toggle label="Allow onboarding notes" defaultChecked />
          <Toggle label="Allow onboarding document attachments" defaultChecked />
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