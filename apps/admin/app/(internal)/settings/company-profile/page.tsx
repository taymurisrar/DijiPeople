import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function CompanyProfileSettingsPage() {
  return (
    <SettingsShell
      title="Company profile"
      description="Manage public company identity, address, registration details, and support contact information."
    >
      <SettingsFormCard title="Company details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company name" value="DijiPeople" />
          <Field label="Legal name" value="DijiPeople Technologies" />
          <Field label="Business registration number" value="" />
          <Field label="Tax registration number" value="" />
          <Field label="Support email" value="support@dijipeople.com" />
          <Field label="Website" value="https://dijipeople.com" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Address">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Country" value="Qatar" />
          <Field label="City" value="Doha" />
          <Field label="Street address" value="" />
          <Field label="Postal code" value="" />
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