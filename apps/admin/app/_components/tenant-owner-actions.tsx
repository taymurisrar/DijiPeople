"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  tenantId: string;
};

export function TenantOwnerActions({ tenantId }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(path: "reset-password" | "resend-activation") {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/tenants/${tenantId}/owner/${path}`,
        {
          method: "POST",
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.message ?? "Owner action failed.");
        return;
      }
      setMessage(
        path === "reset-password"
          ? "Password reset link sent to tenant owner."
          : "Activation link resent to tenant owner.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isPending}
          onClick={() => runAction("reset-password")}
          type="button"
        >
          Reset owner password
        </button>
        <button
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          disabled={isPending}
          onClick={() => runAction("resend-activation")}
          type="button"
        >
          Resend activation
        </button>
      </div>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
