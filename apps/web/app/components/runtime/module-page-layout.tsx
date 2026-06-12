import type { ReactNode } from "react";
import { ModuleAccessDeniedState } from "./module-access-denied-state";

export interface ModuleBreadcrumb {
  readonly label: string;
  readonly href?: string;
}

export function ModulePageLayout({
  accessDenied = false,
  breadcrumbs,
  children,
  commandBarSlot,
  error,
  headerSlot,
  loading = false,
  subtitle,
  title,
}: {
  readonly accessDenied?: boolean;
  readonly breadcrumbs?: readonly ModuleBreadcrumb[];
  readonly children: ReactNode;
  readonly commandBarSlot?: ReactNode;
  readonly error?: ReactNode;
  readonly headerSlot?: ReactNode;
  readonly loading?: boolean;
  readonly subtitle?: string;
  readonly title: string;
}) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-3">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            {breadcrumbs.map((breadcrumb, index) => (
              <span key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span className="px-2">/</span> : null}
                <span className="font-medium">{breadcrumb.label}</span>
              </span>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl pt-1 pl-2 font-semibold text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          {headerSlot ? <div className="shrink-0">{headerSlot}</div> : null}
        </div>
      </div>

      {commandBarSlot ? <div>{commandBarSlot}</div> : null}

      {accessDenied ? (
        <ModuleAccessDeniedState />
      ) : error ? (
        <section className="rounded-lg border border-danger/20 bg-danger/5 p-5 text-sm text-danger">
          {error}
        </section>
      ) : loading ? (
        <section className="rounded-lg border border-border bg-surface p-8 text-sm text-muted shadow-sm">
          Loading...
        </section>
      ) : (
        children
      )}
    </section>
  );
}
