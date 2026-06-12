"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onLoggedOut?: () => void;
  variant?: "pill" | "menu";
  redirectTo?: string;
};

export function LogoutButton({
  className,
  label = "Sign out",
  onLoggedOut,
  variant = "pill",
  redirectTo,
}: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleLogout() {
    if (isPending) return;

    setIsPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const nextPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "";

    let redirectUrl = redirectTo || "/login";

    try {
      const timeout = setTimeout(() => controller.abort(), 8000);

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

      const data = (await res.json().catch(() => null)) as
        | { redirectUrl?: unknown }
        | null;

      if (typeof data?.redirectUrl === "string") {
        redirectUrl = data.redirectUrl;
      }

      onLoggedOut?.();
    } catch (err) {
      console.error("[Logout] Failed:", err);
    } finally {
      setIsPending(false);
      router.replace(redirectUrl);
      router.refresh();
    }
  }

  return (
    <Button
      className={className}
      variant={variant === "menu" ? "ghost" : "pill"}
      fullWidth={variant === "menu"}
      loading={isPending}
      loadingText="Signing out..."
      onClick={handleLogout}
      type="button"
      disabled={isPending}
      aria-busy={isPending}
    >
      {label}
    </Button>
  );
}