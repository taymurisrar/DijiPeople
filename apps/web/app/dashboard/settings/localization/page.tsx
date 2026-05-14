import { apiRequestJson } from "@/lib/server-api";
import { TenantResolvedSettingsResponse } from "../types";

export default async function LocalizationSettingsPage() {
  const resolved = await apiRequestJson<TenantResolvedSettingsResponse>(
    "/tenant-settings/resolved",
  ).catch(() => null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-5xl gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Enterprise settings
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Localization
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Locale, date, time, number, timezone, and first-day-of-week values
            are resolved globally through the settings context provider.
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Locale", resolved?.system.locale],
            ["Date format", resolved?.system.dateFormat],
            ["Time format", resolved?.system.timeFormat],
            ["Timezone", resolved?.system.defaultTimezone],
            ["Currency", resolved?.system.defaultCurrency],
            ["Week starts", resolved?.system.defaultWeekStartDay],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium uppercase text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-slate-950">
                {value ?? "Not configured"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
