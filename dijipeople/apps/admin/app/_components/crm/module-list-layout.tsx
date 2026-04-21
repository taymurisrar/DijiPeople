import type { ReactNode } from "react";

export function ModuleListLayout({
  ribbon,
  controls,
  children,
  pagination,
}: {
  title: string;
  description?: string;
  ribbon?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {ribbon}
      {controls}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        {children}
      </section>
      {pagination}
    </div>
  );
}
