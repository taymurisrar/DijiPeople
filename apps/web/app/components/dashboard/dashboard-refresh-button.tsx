"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DashboardRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="rounded-xl border border-border bg-surface px-4 py-2 mr-3 text-sm font-semibold text-foreground transition hover:bg-muted/10 disabled:cursor-wait disabled:opacity-70"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      {isPending ? "Refreshing..." : "Refresh"}
    </button>
  );
}
