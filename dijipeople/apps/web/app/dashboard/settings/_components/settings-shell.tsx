"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { SettingsLayout } from "@/app/components/settings";
import { findSettingsItemByPath } from "../_lib/settings-navigation";
import { SettingsNav } from "./settings-nav";

type SettingsShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function SettingsShell({
  children,
  description,
  eyebrow,
  title,
}: SettingsShellProps) {
  const pathname = usePathname();
  const currentMatch = findSettingsItemByPath(pathname);

  return (
    <SettingsLayout
      breadcrumb={
        currentMatch ? (
          <>
            <span>{currentMatch.group.label}</span>
            <span>/</span>
            <span className="text-foreground">{currentMatch.item.label}</span>
          </>
        ) : null
      }
      description={description}
      eyebrow={currentMatch ? currentMatch.group.label : eyebrow}
      sidebar={
        <>
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Tenant Settings
        </p>
        <h2 className="mt-3 font-serif text-3xl text-foreground">Configuration</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Structure tenant configuration by function so organization, access,
          policies, and workflows stay manageable as the workspace grows.
        </p>
        <div className="mt-6">
          <SettingsNav currentPath={pathname} />
        </div>
        </>
      }
      title={title}
    >
      {children}
    </SettingsLayout>
  );
}
