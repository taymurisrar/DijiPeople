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
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,247,255,0.92))] p-8 shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Payroll Foundation
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">{title}</h2>
        <p className="mt-3 max-w-3xl text-muted">{description}</p>
        <div className="mt-6">
          <PayrollNav currentPath={pathname} />
        </div>
      </section>

      {children}
    </main>
  );
}

