"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TenantStatus = "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CHURNED";

type TenantStatusFormProps = {
  tenantId: string;
  currentStatus: TenantStatus;
};

export function TenantStatusForm({
  tenantId,
  currentStatus,
}: TenantStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<TenantStatus>(currentStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update tenant status.");
        return;
      }

      setMessage("Tenant status updated.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Tenant status</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Suspend a tenant to pause workspace access without changing module configuration.
        </p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Status
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as TenantStatus)}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        >
          <option value="ONBOARDING">Onboarding</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CHURNED">Churned</option>
        </select>
      </label>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Updating..." : "Update status"}
      </button>
    </form>
  );
}
