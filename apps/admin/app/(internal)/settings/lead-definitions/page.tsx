import { PlatformSettingsForm } from "@/app/_components/platform-settings-form";
import type { PlatformSettingsRecord } from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function LeadDefinitionsSettingsPage() {
  const settings = await apiRequestJson<PlatformSettingsRecord>(
    "/super-admin/platform-settings",
  );

  return (
    <main className="space-y-6">
      <SettingsHeader
        eyebrow="Settings / Lifecycle"
        title="Lead definitions"
        description="Manage lead statuses, sub-statuses, sources, qualification rules, and lifecycle metadata."
      />

      <SettingsCard>
        <PlatformSettingsForm settings={settings} section="leadDefinitions" />
      </SettingsCard>
    </main>
  );
}

function SettingsHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      {children}
    </section>
  );
}