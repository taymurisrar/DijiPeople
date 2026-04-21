"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EmployeeHistoryRecord } from "../types";

export function EmployeeHistoryManager({
  employeeId,
  historyRecords,
}: {
  employeeId: string;
  historyRecords: EmployeeHistoryRecord[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    eventType: "profile_updated",
    eventDate: new Date().toISOString().slice(0, 10),
    title: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to add employee history entry.");
      setIsSubmitting(false);
      return;
    }

    setForm({
      eventType: "profile_updated",
      eventDate: new Date().toISOString().slice(0, 10),
      title: "",
      description: "",
    });
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Event type" value={form.eventType} onChange={(value) => setForm((current) => ({ ...current, eventType: value }))} />
        <Field label="Event date" type="date" value={form.eventDate} onChange={(value) => setForm((current) => ({ ...current, eventDate: value }))} />
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">Title</span>
          <input className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} />
        </label>
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">Description</span>
          <textarea className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} />
        </label>
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="md:col-span-2">
          <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Adding..." : "Add history entry"}
          </button>
        </div>
      </form>

      {historyRecords.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
          No employee history has been recorded yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Date</th>
                  <th className="px-5 py-4 font-medium">Type</th>
                  <th className="px-5 py-4 font-medium">Title</th>
                  <th className="px-5 py-4 font-medium">Changed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {historyRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4 text-muted">{formatDate(record.eventDate)}</td>
                    <td className="px-5 py-4 text-muted">{record.eventType.replace(/_/g, " ")}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-foreground">{record.title}</p>
                      {record.description ? (
                        <p className="mt-1 text-muted">{record.description}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {record.changedByUser
                        ? `${record.changedByUser.firstName} ${record.changedByUser.lastName}`
                        : "System"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
