import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function SecuritySettingsPage() {
  return (
    <SettingsShell
      title="Security & access"
      description="Manage admin access behavior, session controls, permission policies, and authentication defaults."
    >
      <SettingsFormCard
        title="Session security"
        description="These controls protect internal admin access and reduce unattended session risk."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Session inactivity timeout" value="15 minutes" />
          <Field label="Access token lifetime" value="15 minutes" />
          <Field label="Refresh token lifetime" value="7 days" />
          <Field label="Password reset expiry" value="30 minutes" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard
        title="Access policies"
        description="Define high-level access control defaults for platform admins."
      >
        <div className="space-y-3">
          <Toggle label="Require active user status" defaultChecked />
          <Toggle label="Block suspended tenant access" defaultChecked />
          <Toggle label="Allow super admin impersonation" />
          <Toggle label="Require permission checks for settings pages" defaultChecked />
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

function Toggle({
  label,
  defaultChecked = false,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <span className="text-sm font-semibold text-slate-950">{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />
    </label>
  );
}