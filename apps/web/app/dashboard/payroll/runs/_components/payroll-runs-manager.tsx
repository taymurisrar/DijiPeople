"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollPeriodRecord, PayrollRunRecord } from "../../payroll-run-types";

export function PayrollRunsManager({
  canCreate,
  periods,
  runs,
}: {
  canCreate: boolean;
  periods: PayrollPeriodRecord[];
  runs: PayrollRunRecord[];
}) {
  const router = useRouter();
  const eligiblePeriods = periods.filter(
    (period) => period.status === "OPEN" || period.status === "INPUT_CLOSED",
  );
  const [form, setForm] = useState({
    payrollPeriodId: eligiblePeriods[0]?.id ?? "",
    runNumber: "1",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        runNumber: Number(form.runNumber),
        notes: form.notes || undefined,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to create payroll run.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {canCreate ? (
        <form
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-3"
          onSubmit={submit}
        >
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Period</span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3"
              value={form.payrollPeriodId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  payrollPeriodId: event.target.value,
                }))
              }
            >
              {eligiblePeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Run number</span>
            <input
              className="rounded-2xl border border-border bg-white px-4 py-3"
              min={1}
              type="number"
              value={form.runNumber}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  runNumber: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Notes</span>
            <input
              className="rounded-2xl border border-border bg-white px-4 py-3"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <div className="md:col-span-3">
            {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white"
              type="submit"
            >
              Create run
            </button>
          </div>
        </form>
      ) : null}
      <div className="grid gap-3">
        {runs.map((run) => (
          <article
            className="rounded-[20px] border border-border bg-surface p-5 shadow-sm"
            key={run.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">
                  Run #{run.runNumber} / {run.status}
                </h3>
                <p className="text-sm text-muted">
                  {run.payrollPeriod?.name ?? "Payroll period"}
                </p>
              </div>
              <Link
                className="text-sm font-medium text-accent"
                href={`/dashboard/payroll/runs/${run.id}`}
              >
                Open
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
