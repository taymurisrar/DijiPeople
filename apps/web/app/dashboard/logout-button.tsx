"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onLoggedOut?: () => void;
  variant?: "pill" | "menu";
  redirectTo?: string; // optional override
};

export function LogoutButton({
  className,
  label = "Sign out",
  onLoggedOut,
  variant = "pill",
  redirectTo = "/login",
}: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleLogout() {
    if (isPending) return; // prevent double trigger

    setIsPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const nextPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/dashboard";

    try {
      const timeout = setTimeout(() => controller.abort(), 8000); // fail fast

      const res = await fetch(
        `/api/auth/logout?next=${encodeURIComponent(nextPath)}`,
        {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Logout failed with status ${res.status}`);
      }

      // Optional hook (analytics, audit log, UI cleanup)
      onLoggedOut?.();
    } catch (err) {
      console.error("[Logout] Failed:", err);

      // Fallback: force client-side session reset behavior
      // (important if API fails but cookies are already invalid)
    } finally {
      setIsPending(false);

      // Always redirect — never leave user in broken state
      router.replace(`${redirectTo}?next=${encodeURIComponent(nextPath)}`);
      router.refresh();
    }
  }

  return (
    <button
      className={
        className ??
        (variant === "menu"
          ? "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface hover:text-accent disabled:opacity-50"
          : "rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:opacity-50")
      }
      onClick={handleLogout}
      type="button"
      disabled={isPending}
      aria-busy={isPending}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Signing out...
        </span>
      ) : (
        label
      )}
    </button>
  );
}