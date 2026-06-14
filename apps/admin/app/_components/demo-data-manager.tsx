"use client";

import { useState } from "react";

type DemoSummary = {
  enabled: boolean;
  tenant: { name: string; slug: string } | null;
  totalRecords: number;
  counts: Record<string, number>;
  lastBatch: {
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string | null;
  } | null;
};

const CONFIRMATION = "DELETE DEMO DATA";

export function DemoDataManager({ initial }: { initial: DemoSummary }) {
  const [summary, setSummary] = useState(initial);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"delete" | "reseed" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const confirmed = confirmation === CONFIRMATION;

  async function mutate(method: "DELETE" | "POST") {
    setBusy(method === "DELETE" ? "delete" : "reseed");
    setNotice(null);
    try {
      const response = await fetch("/api/super-admin/demo-data", { method });
      const data = (await response.json().catch(() => null)) as
        | DemoSummary
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          data && "message" in data && data.message
            ? data.message
            : "Demo data operation failed.",
        );
      }
      const refreshed = await fetch("/api/super-admin/demo-data", {
        cache: "no-store",
      });
      setSummary((await refreshed.json()) as DemoSummary);
      setConfirmation("");
      setNotice(
        method === "DELETE"
          ? "Demo data was deleted."
          : "Demo data was recreated successfully.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Demo tenant"
          value={summary.tenant?.name ?? "Not seeded"}
        />
        <Metric label="Detected records" value={String(summary.totalRecords)} />
        <Metric
          label="Last batch"
          value={summary.lastBatch?.status ?? "No batch"}
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Record summary</h2>
        <p className="mt-1 text-sm text-slate-600">
          Counts are restricted to the explicitly tagged demo tenant.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.counts).map(([key, value]) => (
            <div
              key={key}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="text-sm font-medium capitalize text-slate-600">
                {key.replace(/([A-Z])/g, " $1")}
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-red-200 bg-red-50 p-5">
        <h2 className="text-xl font-semibold text-red-950">Danger zone</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-red-800">
          This permanently removes the tagged demo tenant and all tenant-owned
          data. Platform admins and non-demo tenants are not touched.
        </p>
        {!summary.enabled ? (
          <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            Demo reset is disabled. Set ENABLE_DEMO_DATA_RESET=true on the API.
          </p>
        ) : null}
        <label className="mt-5 block max-w-xl">
          <span className="text-sm font-semibold text-red-950">
            Type {CONFIRMATION} to continue
          </span>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-red-100"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={
              !summary.enabled || !confirmed || busy !== null || !summary.tenant
            }
            onClick={() => mutate("DELETE")}
            className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "delete" ? "Deleting..." : "Delete Demo Data"}
          </button>
          <button
            type="button"
            disabled={!summary.enabled || !confirmed || busy !== null}
            onClick={() => mutate("POST")}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "reseed" ? "Recreating..." : "Recreate Demo Data"}
          </button>
        </div>
        {notice ? (
          <p className="mt-4 text-sm font-medium text-slate-800">{notice}</p>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
