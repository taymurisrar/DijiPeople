import type { Metadata } from "next";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Lead Definitions",
};


export default async function LeadDefinitionsPage() {
  return (
    <SettingsShell
      title="Lead definitions"
      description="Configure lead statuses, sources, qualification rules, and pipeline defaults."
    >
      <SettingsFormCard title="Lead lifecycle">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default lead status" value="New" />
          <Field label="Qualified status" value="Qualified" />
          <Field label="Disqualified status" value="Disqualified" />
          <Field label="Default lead owner rule" value="Manual assignment" />
        </div>
      </SettingsFormCard>

      <SettingsFormCard title="Lead sources">
        <div className="grid gap-3 md:grid-cols-2">
          {["Website", "Referral", "Upwork", "LinkedIn", "Manual", "Partner"].map(
            (source) => (
              <Toggle key={source} label={source} defaultChecked />
            ),
          )}
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