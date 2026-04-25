import { PlatformSettingsForm } from "@/app/_components/platform-settings-form";
import type { PlatformSettingsRecord } from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function PlatformDefaultsSettingsPage() {
  const settings = await apiRequestJson<PlatformSettingsRecord>(
    "/super-admin/platform-settings",
  ).catch(() => ({
    platformDefaults: {},
    publicPlanVisibility: {},
    billingDefaults: {},
    invoiceDefaults: {},
    emailProvider: {},
    branding: {},
    featureCatalog: {},
    leadDefinitions: {},
  }));

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Settings / Platform
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Platform defaults
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Manage global defaults that control the baseline behavior of the
          platform across customers, billing, lifecycle, and operational setup.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <PlatformSettingsForm settings={settings} section="platformDefaults" />
      </section>
    </main>
  );
}