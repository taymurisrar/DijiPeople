"use client";

import { useState } from "react";
import { AdminSectionCard } from "@/app/_components/admin-ui";

type Preferences = {
  density: "compact" | "comfortable";
  landingPage: string;
  theme: "system" | "light";
};

const defaultPreferences: Preferences = {
  density: "comfortable",
  landingPage: "/",
  theme: "system",
};

const storageKey = "dijipeople.admin.preferences";

export function AccountPreferencesClient() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    if (typeof window === "undefined") return defaultPreferences;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultPreferences;

    try {
      return { ...defaultPreferences, ...JSON.parse(stored) };
    } catch {
      return defaultPreferences;
    }
  });
  const [message, setMessage] = useState("Preferences are stored locally for this browser.");

  function updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setMessage("Preferences saved for this browser.");
  }

  return (
    <AdminSectionCard
      description="No backend preference API is currently exposed, so these safe UI preferences persist in localStorage."
      title="Workspace preferences"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Theme
          <select
            className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            onChange={(event) =>
              updatePreference("theme", event.target.value as Preferences["theme"])
            }
            value={preferences.theme}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Density
          <select
            className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            onChange={(event) =>
              updatePreference(
                "density",
                event.target.value as Preferences["density"],
              )
            }
            value={preferences.density}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          Default landing page
          <select
            className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            onChange={(event) =>
              updatePreference("landingPage", event.target.value)
            }
            value={preferences.landingPage}
          >
            <option value="/">Dashboard</option>
            <option value="/leads">Leads</option>
            <option value="/customers">Customers</option>
            <option value="/tenants">Tenants</option>
            <option value="/billing">Billing</option>
          </select>
        </label>
      </div>
      <p className="mt-4 text-sm text-slate-600">{message}</p>
    </AdminSectionCard>
  );
}
