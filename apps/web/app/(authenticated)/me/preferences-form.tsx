"use client";

import { useEffect, useState } from "react";

type Preferences = {
  timezone?: string;
  locale?: string;
  dateFormat?: string;
  timeFormat?: string;
};

const TIMEZONES = [
  "Asia/Qatar",
  "Asia/Karachi",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Dubai",
  "UTC",
];

export function MyPreferencesForm() {
  const [preferences, setPreferences] = useState<Preferences>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    let isMounted = true;
    fetch("/api/settings/my-preferences", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => {
        if (isMounted) setPreferences(data);
      })
      .catch(() => {
        if (isMounted) setStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function savePreferences() {
    setStatus("saving");
    const response = await fetch("/api/settings/my-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Display timezone
          <select
            value={preferences.timezone ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                timezone: event.target.value,
              }))
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option value="">Tenant default</option>
            {TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Locale
          <input
            value={preferences.locale ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                locale: event.target.value,
              }))
            }
            placeholder="Tenant default"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Date format
          <input
            value={preferences.dateFormat ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                dateFormat: event.target.value,
              }))
            }
            placeholder="Tenant default"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Time format
          <select
            value={preferences.timeFormat ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                timeFormat: event.target.value,
              }))
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option value="">Tenant default</option>
            <option value="12h">12-hour</option>
            <option value="24h">24-hour</option>
          </select>
        </label>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={savePreferences}
          disabled={status === "saving"}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "saving" ? "Saving..." : "Save preferences"}
        </button>
        {status === "saved" ? (
          <span className="text-sm text-emerald-700">Saved</span>
        ) : null}
        {status === "error" ? (
          <span className="text-sm text-red-700">
            Preferences could not be saved.
          </span>
        ) : null}
      </div>
    </section>
  );
}
