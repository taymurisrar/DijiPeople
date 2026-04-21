"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onLoggedOut?: () => void;
  variant?: "pill" | "menu";
};

export function LogoutButton({
  className,
  label = "Sign out",
  onLoggedOut,
  variant = "pill",
}: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    onLoggedOut?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      className={
        className ??
        (variant === "menu"
          ? "flex w-full items-center rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface hover:text-accent"
          : "rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent")
      }
      onClick={handleLogout}
      type="button"
    >
      {isPending ? "Signing out..." : label}
    </button>
  );
}
