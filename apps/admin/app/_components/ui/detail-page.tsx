import type { ReactNode } from "react";

export function DetailPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

export function DetailHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-indigo-100 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.22),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.2),_transparent_32%),linear-gradient(135deg,#ffffff_0%,#eef2ff_100%)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          {description ? (
            <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

export function CommandBar({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur">
      {children}
    </section>
  );
}

export function SummaryCards({ children }: { children: ReactNode }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3 text-xl font-semibold text-slate-950">{value}</div>
      {hint ? <div className="mt-2 text-sm text-slate-500">{hint}</div> : null}
    </article>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-950">{value || "—"}</div>
    </div>
  );
}

export function StatusPipeline({
  steps,
  current,
}: {
  steps: string[];
  current: string;
}) {
  const currentIndex = Math.max(0, steps.indexOf(current));
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step}
            className={[
              "rounded-2xl border px-4 py-3 text-sm font-medium",
              index < currentIndex
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : index === currentIndex
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-slate-50 text-slate-500",
            ].join(" ")}
          >
            {step.replaceAll("_", " ")}
          </div>
        ))}
      </div>
    </section>
  );
}
