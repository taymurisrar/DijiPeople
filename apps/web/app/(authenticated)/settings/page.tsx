"use client";

import { useMemo } from "react";
import { AccessDeniedState } from "../_components/access-denied-state";
import { useCurrentUserAccess } from "../_components/authenticated-shell-provider";
import { SettingsWorkspaceLanding } from "./_components/settings-runtime-landing";

export default function SettingsPage() {
  const { user } = useCurrentUserAccess();
  const canUseGlobalSettings = useMemo(() => {
    const roles = new Set(user?.roleKeys ?? []);
    return [
      "global-admin",
      "system-admin",
      "system-customizer",
      "hr",
      "payroll-manager",
    ].some((role) => roles.has(role));
  }, [user?.roleKeys]);

  if (!canUseGlobalSettings) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <AccessDeniedState
            title="Settings are reserved for administrators."
            description="Employees can manage their personal display preferences from My Preferences."
            actionHref="/my-profile"
            actionLabel="Open My Preferences"
          />
        </div>
      </main>
    );
  }

  return <SettingsWorkspaceLanding />;
}
