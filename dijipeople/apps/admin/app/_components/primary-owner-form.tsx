"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PrimaryOwnerFormProps = {
  tenantId: string;
  currentUserId?: string | null;
  users: Array<{
    id: string;
    label: string;
  }>;
};

export function PrimaryOwnerForm({
  tenantId,
  currentUserId,
  users,
}: PrimaryOwnerFormProps) {
  const router = useRouter();
  const [userId, setUserId] = useState(currentUserId ?? users[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}/primary-owner`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update primary owner.");
        return;
      }

      setMessage("Primary owner updated.");
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        No tenant users are available to assign as the primary owner.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        Primary owner
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Update owner"}
        </button>
        {message ? <span className="text-xs text-slate-500">{message}</span> : null}
      </div>
    </form>
  );
}
