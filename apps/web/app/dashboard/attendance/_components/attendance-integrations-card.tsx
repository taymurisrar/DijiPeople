"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AttendanceIntegrationRecord } from "../types";

const integrationTypes = [
  "API_PUSH",
  "FILE_IMPORT",
  "MACHINE_SYNC",
  "WEBHOOK",
  "MANUAL",
  "BROWSER",
];

export function AttendanceIntegrationsCard({
  integrations,
}: {
  integrations: AttendanceIntegrationRecord[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    integrationType: "FILE_IMPORT",
    description: "",
    endpointUrl: "",
    username: "",
    configJson: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/attendance/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(payload.message ?? "Unable to create attendance integration.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setForm({
      name: "",
      integrationType: "FILE_IMPORT",
      description: "",
      endpointUrl: "",
      username: "",
      configJson: "",
    });
    router.refresh();
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Integration sources
      </p>
      <h4 className="mt-2 text-2xl font-semibold text-foreground">
        Prepare device and API integrations
      </h4>
      <p className="mt-2 text-sm text-muted">
        These configs stay vendor-neutral so future machine sync or webhook
        ingestion can plug into the same attendance pipeline.
      </p>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <input
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="Integration name"
          value={form.name}
        />
        <select
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              integrationType: event.target.value,
            }))
          }
          value={form.integrationType}
        >
          {integrationTypes.map((type) => (
            <option key={type} value={type}>
              {formatValue(type)}
            </option>
          ))}
        </select>
        <input
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              endpointUrl: event.target.value,
            }))
          }
          placeholder="Endpoint URL (optional)"
          value={form.endpointUrl}
        />
        <input
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              username: event.target.value,
            }))
          }
          placeholder="Username (optional)"
          value={form.username}
        />
        <textarea
          className="min-h-24 rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 md:col-span-2"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder="Description"
          value={form.description}
        />
        <textarea
          className="min-h-24 rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 md:col-span-2"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              configJson: event.target.value,
            }))
          }
          placeholder='Optional JSON config, for example {"siteCode":"HQ-01"}'
          value={form.configJson}
        />
        <div className="md:col-span-2">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Saving..." : "Add integration"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {integrations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted">
            No attendance integrations configured yet.
          </p>
        ) : (
          integrations.map((integration) => (
            <article
              key={integration.id}
              className="rounded-2xl border border-border bg-white/80 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    {integration.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatValue(integration.integrationType)}
                  </p>
                </div>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                  {integration.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {integration.description ? (
                <p className="mt-2 text-sm text-muted">{integration.description}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
