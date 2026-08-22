"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { usePlatformDefaults } from "./platform-defaults-provider";
import type { PlatformRole } from "@/lib/platform-rbac";

type AdminShellProps = {
  rememberSession: boolean;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    /* Navigation gating still uses the alias list; display uses `role`. */
    roleKeys?: string[];
    permissionKeys?: string[];
    role?: PlatformRole;
  };
  children: React.ReactNode;
};

export function AdminShell({
  user,
  children,
  rememberSession,
}: AdminShellProps) {
  const { appearance } = usePlatformDefaults();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastActivitySyncAt = useRef(0);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let refreshInFlight: Promise<boolean> | null = null;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = resolveRequestUrl(args[0]);

      if (
        response.status === 401 &&
        isInternalApiRequest(url) &&
        !isAuthApiRequest(url)
      ) {
        if (!rememberSession) {
          window.location.assign(sessionExpiredLoginUrl());
          return response;
        }

        refreshInFlight =
          refreshInFlight ??
          originalFetch("/api/auth/refresh", { method: "POST" })
            .then((refreshResponse) => refreshResponse.ok)
            .catch(() => false)
            .finally(() => {
              refreshInFlight = null;
            });

        if (await refreshInFlight) {
          const retry = await originalFetch(...args);
          if (retry.status !== 401) return retry;
        }

        setSessionExpired(true);
      }

      return response;
    };

    const syncActivity = () => {
      const now = Date.now();
      if (now - lastActivitySyncAt.current < 60_000) return;

      lastActivitySyncAt.current = now;
      void window
        .fetch("/api/auth/activity", { method: "POST" })
        .catch(() => undefined);
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "focus"];

    events.forEach((eventName) =>
      window.addEventListener(eventName, syncActivity, { passive: true }),
    );

    return () => {
      window.fetch = originalFetch;
      events.forEach((eventName) =>
        window.removeEventListener(eventName, syncActivity),
      );
    };
  }, [rememberSession]);

  return (
    <div
      className="admin-theme min-h-screen"
      data-theme={appearance.themePreset}
      style={
        {
          "--admin-primary": appearance.primaryColor,
          "--admin-accent": appearance.accentColor,
          "--admin-navigation": appearance.navigationColor,
          "--admin-surface-tint": appearance.surfaceTint,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-0 px-3 py-3 md:px-4 md:py-4 lg:gap-4">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          isOpen={sidebarOpen}
          onCollapseToggle={() => setSidebarCollapsed((current) => !current)}
          onClose={() => setSidebarOpen(false)}
          roleKeys={user.roleKeys}
          permissionKeys={user.permissionKeys}
        />

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <AdminTopbar
            email={user.email}
            firstName={user.firstName}
            lastName={user.lastName}
            onMenuToggle={() => setSidebarOpen((current) => !current)}
            role={user.role}
          />

          {/*
            `overflow-x-clip`, not `overflow-x-hidden`.

            They look identical and are not. `hidden` on one axis forces the
            other axis to compute to `auto`, which makes this div a scroll
            container — and a sticky descendant sticks to its nearest scroll
            container, which here has auto height and never scrolls. So every
            `position: sticky` under this element was silently inert: the page
            scrolled, the container did not, and nothing stuck. `clip` is
            allowed to pair with `visible` on the other axis, so it contains
            horizontal overflow without creating a scrollport.

            The symptom was reported as "Fields & signatures should be sticky"
            about a panel that already declared `sticky`.
          */}
          <div className="min-w-0 overflow-x-clip">{children}</div>
        </main>
      </div>
      {sessionExpired ? (
        <SessionExpiredDialog
          email={user.email}
          onCancel={() => window.location.assign(sessionExpiredLoginUrl())}
        />
      ) : null}
    </div>
  );
}

function SessionExpiredDialog({
  email,
  onCancel,
}: {
  email: string;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message ?? "Unable to sign in.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unable to reach the sign-in service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expired-session-title"
    >
      <form
        onSubmit={signIn}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Session expired
        </p>
        <h2
          id="expired-session-title"
          className="mt-2 text-xl font-semibold text-slate-950"
        >
          Sign in to continue
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your work remains on this page. Re-enter your password to restore the
          remembered admin session.
        </p>
        <label className="mt-5 grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Account
          <input
            readOnly
            value={email}
            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="mt-3 grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Password
          <input
            autoFocus
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            Go to login
          </button>
          <button
            disabled={busy || !password}
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}

function sessionExpiredLoginUrl() {
  return `/login?reason=session-expired&next=${encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  )}`;
}

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isInternalApiRequest(url: string) {
  if (url.startsWith("/api/")) return true;

  try {
    const resolved = new URL(url, window.location.origin);
    return (
      resolved.origin === window.location.origin &&
      resolved.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}

function isAuthApiRequest(url: string) {
  try {
    return new URL(url, window.location.origin).pathname.startsWith(
      "/api/auth/",
    );
  } catch {
    return url.startsWith("/api/auth/");
  }
}
