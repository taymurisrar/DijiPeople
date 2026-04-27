"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type CustomerOption = {
  id: string;
  companyName: string;
  status: string;
};

type Props = {
  tenantId: string;
  customerAccountId?: string | null;
  options: CustomerOption[];
};

export function TenantCustomerAccountForm({
  tenantId,
  customerAccountId,
  options,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(customerAccountId ?? "");
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}/customer-account`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerAccountId: selectedId,
          forceReassignWithActiveBilling: force,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.message ?? "Unable to update customer account.");
        return;
      }
      setMessage("Tenant customer account updated.");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-slate-700">
        Linked customer account
        <select
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          onChange={(event) => setSelectedId(event.target.value)}
          value={selectedId}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.companyName} ({option.status})
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          checked={force}
          onChange={(event) => setForce(event.target.checked)}
          type="checkbox"
        />
        Force reassignment when active billing exists
      </label>
      <button
        className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={isPending || !selectedId}
        type="submit"
      >
        {isPending ? "Saving..." : "Update customer link"}
      </button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </form>
  );
}
