"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { FormControl } from "@/app/_components/ui/form-control";
import {
  DEFAULT_PLATFORM_DEFAULTS,
  PLATFORM_COUNTRY_OPTIONS,
  PLATFORM_CURRENCY_OPTIONS,
  PLATFORM_DATE_FORMATS,
  PLATFORM_LOCALE_OPTIONS,
  PLATFORM_TIMEZONE_OPTIONS,
  PLATFORM_TIME_FORMATS,
  normalizePlatformDefaults,
  type PlatformDefaults,
} from "@/lib/reference-data/platform-reference-data";

type MessageState = {
  tone: "success" | "error";
  text: string;
};

export function PlatformDefaultsForm({
  initialDefaults,
}: {
  initialDefaults: Partial<PlatformDefaults>;
}) {
  const { updateDefaults } = usePlatformDefaults();

  const [form, setForm] = useState<PlatformDefaults>(() =>
    normalizePlatformDefaults(initialDefaults),
  );

  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasChanges =
    JSON.stringify(form) !==
    JSON.stringify(normalizePlatformDefaults(initialDefaults));

  function update<K extends keyof PlatformDefaults>(
    key: K,
    value: PlatformDefaults[K],
  ) {
    setMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setMessage(null);
    setForm(normalizePlatformDefaults(initialDefaults));
  }

  function save() {
    setMessage(null);

    const normalizedForm = normalizePlatformDefaults(form);

    startTransition(async () => {
      try {
        const response = await fetch("/api/super-admin/platform-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platformDefaults: normalizedForm }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setMessage({
            tone: "error",
            text: payload?.message ?? "Unable to save platform defaults.",
          });
          return;
        }

        const nextDefaults = normalizePlatformDefaults(
          payload?.platformDefaults ?? normalizedForm,
        );

        updateDefaults(nextDefaults);
        setForm(nextDefaults);

        setMessage({
          tone: "success",
          text: "Platform defaults saved successfully.",
        });
      } catch {
        setMessage({
          tone: "error",
          text: "Network error. Platform defaults were not saved.",
        });
      }
    });
  }

  return (
    <div className="space-y-5">
      {message ? (
        <AppNotification tone={message.tone}>{message.text}</AppNotification>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-950">
            Platform defaults
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            These values are used as the global fallback when creating tenants,
            subscriptions, regional settings, and localized experiences.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormControl
            type="lookup"
            label="Default country"
            value={form.country}
            options={PLATFORM_COUNTRY_OPTIONS}
            disabled={isPending}
            required
            placeholder="Search country"
            helpText="Used as the default country when creating new tenants."
            onChange={(value) =>
              update("country", String(value) as PlatformDefaults["country"])
            }
          />

          <FormControl
            type="lookup"
            label="Default currency"
            value={form.currency}
            options={PLATFORM_CURRENCY_OPTIONS}
            disabled={isPending}
            required
            placeholder="Search currency"
            helpText="Used as the default billing, invoice, and subscription currency."
            onChange={(value) =>
              update("currency", String(value) as PlatformDefaults["currency"])
            }
          />

          <FormControl
            type="lookup"
            label="Default timezone"
            value={form.timezone}
            options={PLATFORM_TIMEZONE_OPTIONS}
            disabled={isPending}
            required
            placeholder="Search timezone"
            helpText="Used for tenant dates, audit logs, schedules, and reminders."
            onChange={(value) =>
              update("timezone", String(value) as PlatformDefaults["timezone"])
            }
          />

          <FormControl
            type="select"
            label="Date format"
            value={form.dateFormat}
            options={PLATFORM_DATE_FORMATS}
            disabled={isPending}
            required
            helpText="Controls how dates are displayed across the platform."
            onChange={(value) =>
              update(
                "dateFormat",
                String(value) as PlatformDefaults["dateFormat"],
              )
            }
          />

          <FormControl
            type="select"
            label="Time format"
            value={form.timeFormat}
            options={PLATFORM_TIME_FORMATS}
            disabled={isPending}
            required
            helpText="Controls whether time is displayed in 12-hour or 24-hour format."
            onChange={(value) =>
              update(
                "timeFormat",
                String(value) as PlatformDefaults["timeFormat"],
              )
            }
          />

          <FormControl
            type="select"
            label="Default locale"
            value={form.locale}
            options={PLATFORM_LOCALE_OPTIONS}
            disabled={isPending}
            required
            helpText="Used for language, number formatting, and localization fallback."
            onChange={(value) =>
              update("locale", String(value) as PlatformDefaults["locale"])
            }
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending || !hasChanges}
            onClick={reset}
            type="button"
          >
            Reset changes
          </button>

          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending || !hasChanges}
            onClick={save}
            type="button"
          >
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save defaults"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        Fallback values: {DEFAULT_PLATFORM_DEFAULTS.country},{" "}
        {DEFAULT_PLATFORM_DEFAULTS.currency},{" "}
        {DEFAULT_PLATFORM_DEFAULTS.timezone},{" "}
        {DEFAULT_PLATFORM_DEFAULTS.locale}
      </div>
    </div>
  );
}