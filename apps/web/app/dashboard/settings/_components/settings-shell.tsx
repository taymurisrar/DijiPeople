"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SettingsLayout } from "@/app/components/settings";
import { findSettingsItemByPath } from "../_lib/settings-navigation";
import { SettingsNav } from "./settings-nav";

type SettingsShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function SettingsShell({
  children,
  title,
  description,
  eyebrow = "Tenant Settings",
  actions,
}: SettingsShellProps) {
  const pathname = usePathname();
  const currentMatch = findSettingsItemByPath(pathname);

  const resolvedEyebrow = currentMatch?.groupLabel ?? eyebrow;

  const breadcrumb = currentMatch ? (
    <>
      <span>{currentMatch.groupLabel}</span>
      <span className="text-muted">/</span>
      <span className="text-foreground">{currentMatch.label}</span>
    </>
  ) : null;

  return (
    <SettingsLayout
      breadcrumb={breadcrumb}
      description={description}
      eyebrow={resolvedEyebrow}
      title={title}
      sidebar={
        <aside className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Tenant Settings
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Configuration
            </h2>

            <p className="mt-3 text-sm leading-6 text-muted">
              Manage tenant setup, access, policies, payroll, customization,
              and governance from one structured administration workspace.
            </p>
          </div>

          <SettingsNav currentPath={pathname} />
        </aside>
      }
    >
      {actions ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {actions}
        </div>
      ) : null}

      {children}
    </SettingsLayout>
  );
}