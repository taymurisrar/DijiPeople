import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function EmailProviderSettingsPage() {
  return (
    <SettingsShell
      title="Email provider"
      description="Configure SMTP delivery, sender identity, email templates, and system notification behavior."
    >
      <SettingsFormCard title="SMTP settings">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SMTP host" value="smtp.example.com" />
          <Field label="SMTP port" value="587" />
          <Field label="SMTP username" value="notifications@dijipeople.com" />
          <Field label="Sender email" value="no-reply@dijipeople.com" />
          <Field label="Sender name" value="DijiPeople" />
          <Field label="Delivery mode" value="Production" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Email controls">
        <div className="space-y-3">
          <Toggle label="Send account activation emails" defaultChecked />
          <Toggle label="Send password reset emails" defaultChecked />
          <Toggle label="Send billing notification emails" defaultChecked />
          <Toggle label="Send onboarding notification emails" defaultChecked />
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