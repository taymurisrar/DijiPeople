import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function BrandingSettingsPage() {
  return (
    <SettingsShell
      title="Branding"
      description="Manage platform identity, public visuals, favicon, colors, and customer-facing brand presentation."
    >
      <SettingsFormCard
        title="Brand identity"
        description="These values control the visible branding used across DijiPeople public and admin experiences."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Platform name" value="DijiPeople" />
          <Field label="Logo URL" value="/logo.svg" />
          <Field label="Favicon URL" value="/favicon.ico" />
          <Field label="Primary color" value="#020617" />
          <Field label="Secondary color" value="#475569" />
          <Field label="Accent color" value="#2563eb" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard
        title="Login experience"
        description="Customize how the platform appears on authentication and account activation screens."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Login headline" value="Welcome to DijiPeople" />
          <Field label="Login subheading" value="Sign in to manage your workspace." />
          <Field label="Support email" value="support@dijipeople.com" />
          <Field label="Public website" value="https://dijipeople.com" />
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