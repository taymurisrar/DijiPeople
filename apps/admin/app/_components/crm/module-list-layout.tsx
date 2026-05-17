import type { ReactNode } from "react";

export function ModuleListLayout({
  title,
  description,
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
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] border border-indigo-100 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(135deg,#ffffff_0%,#eef2ff_100%)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
          Platform lifecycle
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </section>
      {ribbon}
      {controls}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        {children}
      </section>
      {pagination}
    </div>
  );
}
