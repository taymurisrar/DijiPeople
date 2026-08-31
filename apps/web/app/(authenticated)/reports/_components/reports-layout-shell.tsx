"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ReportsNav, type ReportsNavItem } from "./reports-nav";

/*
 * The header and section row every reporting page sits under.
 *
 * A client component only because it needs `usePathname` to know which pill is
 * current — the same split `PayrollLayoutShell` uses. The nav items themselves
 * are computed on the server and passed in, so the decision about which
 * sections exist (which depends on the caller's catalog and on whether the
 * scheduling service is live) is made where the data is, not guessed here.
 */

export function ReportsLayoutShell({
  children,
  navItems,
}: {
  children: ReactNode;
  navItems: readonly ReportsNavItem[];
}) {
  const pathname = usePathname();

  return (
    <div className="dp-theme-scope grid gap-4">
      <section className="rounded-[22px] border border-border bg-surface px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Reports &amp; Analytics
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Reporting workspace
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Period-scoped, comparative analysis you can filter, break down,
              drill into and save. The dashboard answers what needs attention
              now; this answers what changed, and against what.
            </p>
          </div>
          <ReportsNav currentPath={pathname ?? ""} items={navItems} />
        </div>
      </section>

      {children}
    </div>
  );
}
