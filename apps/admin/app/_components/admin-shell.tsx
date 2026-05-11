"use client";

import { useEffect, useRef, useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

type AdminShellProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  children: React.ReactNode;
};

export function AdminShell({ user, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastActivitySyncAt = useRef(0);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let refreshInFlight: Promise<boolean> | null = null;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = resolveRequestUrl(args[0]);

      if (
        response.status === 401 &&
        isInternalApiRequest(url) &&
        !url.endsWith("/api/auth/refresh")
      ) {
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
          if (retry.status !== 401) {
            return retry;
          }
        }

        window.location.assign(
          `/login?reason=session-expired&next=${encodeURIComponent(
            `${window.location.pathname}${window.location.search}`,
          )}`,
        );
      }

      return response;
    };

    const syncActivity = () => {
      const now = Date.now();
      if (now - lastActivitySyncAt.current < 60_000) return;
      lastActivitySyncAt.current = now;
      void originalFetch("/api/auth/activity", { method: "POST" }).catch(
        () => undefined,
      );
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
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 px-3 py-3 md:px-4 md:py-4">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          isOpen={sidebarOpen}
          onCollapseToggle={() => setSidebarCollapsed((current) => !current)}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AdminTopbar
            email={user.email}
            firstName={user.firstName}
            lastName={user.lastName}
            onMenuToggle={() => setSidebarOpen((current) => !current)}
          />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
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
