"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PayrollNav } from "./payroll-nav";

export function PayrollLayoutShell({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const pathname = usePathname();

  return (
    <main className="grid gap-4">
      <section className="rounded-[22px] border border-border bg-surface px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Payroll
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
          </div>
          <PayrollNav currentPath={pathname} />
        </div>
      </section>

      {children}
    </main>
  );
}
