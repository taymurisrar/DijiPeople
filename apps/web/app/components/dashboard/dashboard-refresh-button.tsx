"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/common";

export function DashboardRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label="Refresh dashboard"
      title="Refresh dashboard"
      onClick={() => startTransition(() => router.refresh())}
      className="mr-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white/80 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground disabled:cursor-wait disabled:opacity-70"
    >
      <RefreshCw
        className={cn(
          "h-4 w-4 transition-transform",
          isPending && "animate-spin"
        )}
      />
    </button>
  );
}