import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function AdminWorkspace({ children }: { children: ReactNode }) {
  return <main className="space-y-4">{children}</main>;
}

export function AdminCommandBar({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="relative z-20 overflow-visible rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-12 min-w-0 items-center justify-between gap-3 overflow-visible">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1.5">{left}</div>
        </div>
        {right ? (
          <div className="flex shrink-0 items-center justify-end gap-2 overflow-visible">
            {right}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function AdminCommandButton({
  children,
  disabled = false,
  href,
  icon: Icon,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  href?: string;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  const className =
    "inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-950/15 disabled:cursor-not-allowed disabled:opacity-45";
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <a className={className} href={href}>
        {content}
      </a>
    );
  }

  return (
    <button
      className={className}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

export function AdminPageHeader({
  actions,
  description,
  eyebrow,
  metadata,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  metadata?: Array<{ label: string; value?: ReactNode }>;
  title: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          {description ? (
            <div className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {description}
            </div>
          ) : null}
          {metadata?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {metadata.map((item) => (
                <span
                  className="inline-flex items-center gap-1.5"
                  key={item.label}
                >
                  <span className="font-medium text-slate-400">
                    {item.label}
                  </span>
                  <span className="text-slate-700">
                    {item.value || "Not specified"}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AdminSectionCard({
  actions,
  children,
  className = "",
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            {title ? (
              <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            ) : null}
            {description ? (
              <div className="mt-1 text-sm leading-6 text-slate-600">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={title || description || actions ? "p-5" : ""}>
        {children}
      </div>
    </section>
  );
}

export function AdminKeyValueGrid({
  items,
}: {
  items: Array<{ label: string; value?: ReactNode }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
          key={item.label}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {item.label}
          </div>
          <div className="mt-1 truncate text-sm font-medium text-slate-850">
            {item.value || (
              <span className="text-slate-400">Not specified</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
