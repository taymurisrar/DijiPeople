import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

export default async function InvoiceSettingsPage() {
  return (
    <SettingsShell
      title="Invoice defaults"
      description="Configure invoice numbering, due dates, prefixes, notes, and invoice behavior."
    >
      <SettingsFormCard title="Invoice numbering">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Invoice prefix" value="INV" />
          <Field label="Next invoice number" value="1001" />
          <Field label="Number length" value="5" />
          <Field label="Reset sequence" value="Never" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Invoice behavior">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default due days" value="15" />
          <Field label="Default invoice status" value="Draft" />
          <Field label="Default tax label" value="Tax" />
          <Field label="Default invoice note" value="Thank you for your business." />
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