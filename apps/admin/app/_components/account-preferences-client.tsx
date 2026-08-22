"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { AdminSectionCard } from "@/app/_components/admin-ui";
import {
  DEFAULT_PREFERENCES,
  LANDING_ROUTE_OPTIONS,
  applyConsolePreferences,
  type ConsolePreferences,
} from "@/lib/console-preferences";

/**
 * Personal console preferences, stored against the operator.
 *
 * These used to live in `localStorage`, and the card said so — which made the
 * limitation honest and the feature useless: an operator who signed in from a
 * second machine, or cleared their browser, got the defaults back with no
 * indication anything had been lost. They were also stored and never read, so
 * choosing Compact changed a value in a JSON blob and nothing on screen.
 *
 * Both halves are fixed here. The preferences persist on `PlatformUser`, and
 * `applyConsolePreferences` writes them onto the document so theme and density
 * take effect immediately rather than at some later render nobody triggers.
 */
export function AccountPreferencesClient() {
  const [preferences, setPreferences] =
    useState<ConsolePreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof ConsolePreferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/platform-users/me/preferences", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as ConsolePreferences;
      })
      .then((payload) => {
        setPreferences({ ...DEFAULT_PREFERENCES, ...payload });
        applyConsolePreferences({ ...DEFAULT_PREFERENCES, ...payload });
        setLoading(false);
      })
      .catch((reason) => {
        if ((reason as { name?: string }).name === "AbortError") return;
        setFailed(true);
        setMessage(
          "Your saved preferences could not be loaded. The defaults are shown.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function update<K extends keyof ConsolePreferences>(
    key: K,
    value: ConsolePreferences[K],
  ) {
    const next = { ...preferences, [key]: value };
    /*
     * Applied before the request, reverted if it fails. A theme that waits for
     * a round trip feels broken, and a theme that changes and then silently
     * does not persist is worse — so the optimistic change is paired with an
     * explicit revert rather than left to hope.
     */
    setPreferences(next);
    applyConsolePreferences(next);
    setSaving(key);
    setFailed(false);
    setMessage(null);

    try {
      const response = await fetch("/api/platform-users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to save this preference.");
      }
      const saved = { ...DEFAULT_PREFERENCES, ...(payload ?? {}) };
      setPreferences(saved);
      applyConsolePreferences(saved);
      setMessage("Saved. This follows you to any browser you sign in from.");
    } catch (reason) {
      setPreferences(preferences);
      applyConsolePreferences(preferences);
      setFailed(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Unable to save this preference.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <AdminSectionCard
      description="Stored against your platform account, so they follow you to any browser you sign in from."
      title="Workspace preferences"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading your preferences…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Theme" busy={saving === "uiTheme"}>
              <select
                aria-label="Theme"
                className={selectClass}
                value={preferences.uiTheme}
                onChange={(event) =>
                  void update(
                    "uiTheme",
                    event.target.value as ConsolePreferences["uiTheme"],
                  )
                }
              >
                <option value="SYSTEM">Match my system</option>
                <option value="LIGHT">Light</option>
                <option value="DARK">Dark</option>
              </select>
            </Field>

            <Field label="Density" busy={saving === "uiDensity"}>
              <select
                aria-label="Density"
                className={selectClass}
                value={preferences.uiDensity}
                onChange={(event) =>
                  void update(
                    "uiDensity",
                    event.target.value as ConsolePreferences["uiDensity"],
                  )
                }
              >
                <option value="COMFORTABLE">Comfortable</option>
                <option value="COMPACT">Compact</option>
              </select>
            </Field>

            <div className="lg:col-span-2">
              <Field
                label="Where to land after signing in"
                busy={saving === "defaultLandingRoute"}
              >
                <select
                  aria-label="Default landing page"
                  className={selectClass}
                  value={preferences.defaultLandingRoute}
                  onChange={(event) =>
                    void update(
                      "defaultLandingRoute",
                      event.target
                        .value as ConsolePreferences["defaultLandingRoute"],
                    )
                  }
                >
                  {LANDING_ROUTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mt-1.5 text-xs text-slate-500">
                Only routes this console owns are offered. A landing page that
                accepted any address would be a redirect anyone could set.
              </p>
            </div>
          </div>

          {message ? (
            <p
              role="status"
              className={`mt-4 text-sm ${failed ? "text-rose-700" : "text-emerald-700"}`}
            >
              {message}
            </p>
          ) : null}
        </>
      )}
    </AdminSectionCard>
  );
}

const selectClass =
  "mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm";

function Field({
  label,
  busy,
  children,
}: {
  label: string;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="inline-flex items-center gap-1.5">
        {label}
        {busy ? (
          <LoaderCircle
            className="h-3 w-3 animate-spin text-slate-400"
            aria-label="Saving"
          />
        ) : null}
      </span>
      {children}
    </label>
  );
}
