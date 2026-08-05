import Link from "next/link";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";
import { DEFAULT_PLATFORM_DEFAULTS } from "@/lib/reference-data/platform-reference-data";

export default async function PlanVisibilitySettingsPage() {
  const settings = await apiRequestJson<{
    platformDefaults?: { currency?: string; reportingCurrency?: string };
  }>("/super-admin/platform-settings");
  const transactionCurrency =
    settings.platformDefaults?.currency ?? DEFAULT_PLATFORM_DEFAULTS.currency;
  const reportingCurrency =
    settings.platformDefaults?.reportingCurrency ?? transactionCurrency;
  return (
    <SettingsShell
      title="Plans & visibility"
      description="Control how commercial plans behave and how they are shown during customer onboarding and tenant subscription setup."
    >
      <SettingsFormCard
        title="Plan visibility"
        description="Use these settings to control which plans are visible and selectable by default."
      >
        <div className="space-y-3">
          <Toggle label="Show active plans during onboarding" defaultChecked />
          <Toggle label="Allow annual billing options" defaultChecked />
          <Toggle label="Allow monthly billing options" defaultChecked />
          <Toggle label="Hide inactive plans from assignment screens" defaultChecked />
        </div>
      </SettingsFormCard>

      <SettingsFormCard
        title="Commercial defaults"
        description="Default behavior used when creating new plan and subscription records."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default billing cycle" value="Monthly" />
          <Field label="Default trial duration" value="14 days" />
          <Field label="Transaction currency" value={transactionCurrency} />
          <Field label="Reporting currency" value={reportingCurrency} />
          <Field label="Default plan sort order" value="10" />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Currency values are managed centrally in{" "}
          <Link href="/settings/platform-defaults" className="font-semibold text-[var(--admin-primary)] hover:underline">
            Platform defaults
          </Link>
          .
        </p>
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
