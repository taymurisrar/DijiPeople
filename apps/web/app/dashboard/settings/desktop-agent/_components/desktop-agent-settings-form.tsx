"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type AgentSettingsRecord = {
  enabled: boolean;
  heartbeatIntervalSeconds: number;
  idleThresholdSeconds: number;
  awayThresholdSeconds: number;
  captureActiveApp: boolean;
  captureWindowTitle: boolean;
  offlineQueueEnabled: boolean;
  heartbeatBatchSize: number;
  minimumSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  updateMessage: string | null;
  autoUpdateEnabled: boolean;
};

export function DesktopAgentSettingsForm({
  initialSettings,
}: {
  initialSettings: AgentSettingsRecord;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...initialSettings,
    updateMessage: initialSettings.updateMessage ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (form.awayThresholdSeconds <= form.idleThresholdSeconds) {
      setError("Away threshold must be greater than idle threshold.");
      return;
    }

    setIsSaving(true);
    const response = await fetch("/api/agent/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        updateMessage: form.updateMessage || null,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    setIsSaving(false);

    if (!response.ok) {
      setError(data?.message ?? "Unable to update desktop agent settings.");
      return;
    }

    setMessage("Desktop agent settings saved.");
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <CheckField
          checked={form.enabled}
          label="Enable desktop tracking"
          onChange={(enabled) =>
            setForm((current) => ({ ...current, enabled }))
          }
        />
        <CheckField
          checked={form.autoUpdateEnabled}
          label="Enable auto-update checks"
          onChange={(autoUpdateEnabled) =>
            setForm((current) => ({ ...current, autoUpdateEnabled }))
          }
        />
        <NumberField
          label="Heartbeat interval seconds"
          min={15}
          value={form.heartbeatIntervalSeconds}
          onChange={(heartbeatIntervalSeconds) =>
            setForm((current) => ({ ...current, heartbeatIntervalSeconds }))
          }
        />
        <NumberField
          label="Heartbeat batch size"
          min={1}
          value={form.heartbeatBatchSize}
          onChange={(heartbeatBatchSize) =>
            setForm((current) => ({ ...current, heartbeatBatchSize }))
          }
        />
        <NumberField
          label="Idle threshold seconds"
          min={30}
          value={form.idleThresholdSeconds}
          onChange={(idleThresholdSeconds) =>
            setForm((current) => ({ ...current, idleThresholdSeconds }))
          }
        />
        <NumberField
          label="Away threshold seconds"
          min={60}
          value={form.awayThresholdSeconds}
          onChange={(awayThresholdSeconds) =>
            setForm((current) => ({ ...current, awayThresholdSeconds }))
          }
        />
        <CheckField
          checked={form.captureActiveApp}
          label="Capture active app name"
          onChange={(captureActiveApp) =>
            setForm((current) => ({ ...current, captureActiveApp }))
          }
        />
        <CheckField
          checked={form.captureWindowTitle}
          label="Capture active window title"
          onChange={(captureWindowTitle) =>
            setForm((current) => ({ ...current, captureWindowTitle }))
          }
        />
        <CheckField
          checked={form.offlineQueueEnabled}
          label="Enable offline queue"
          onChange={(offlineQueueEnabled) =>
            setForm((current) => ({ ...current, offlineQueueEnabled }))
          }
        />
      </section>

      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <TextField
          label="Minimum supported version"
          value={form.minimumSupportedVersion}
          onChange={(minimumSupportedVersion) =>
            setForm((current) => ({ ...current, minimumSupportedVersion }))
          }
        />
        <TextField
          label="Latest version"
          value={form.latestVersion}
          onChange={(latestVersion) =>
            setForm((current) => ({ ...current, latestVersion }))
          }
        />
        <CheckField
          checked={form.forceUpdate}
          label="Force update"
          onChange={(forceUpdate) =>
            setForm((current) => ({ ...current, forceUpdate }))
          }
        />
        <div className="md:col-span-2">
          <TextField
            label="Update message"
            value={form.updateMessage}
            onChange={(updateMessage) =>
              setForm((current) => ({ ...current, updateMessage }))
            }
          />
        </div>
      </section>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div>
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save desktop agent settings"}
        </button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function TextField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function CheckField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-foreground">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-border"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
