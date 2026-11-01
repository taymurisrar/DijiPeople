"use client";

import { ReactNode } from "react";

type SettingsLayoutProps = {
  breadcrumb?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow?: string;
  showHeader?: boolean;
  sidebar?: ReactNode;
  title: string;
};

export function SettingsLayout({
  breadcrumb,
  children,
  description,
  eyebrow = "Settings",
  showHeader = true,
  sidebar,
  title,
}: SettingsLayoutProps) {
  return (
    /*
     * DP-QA-041 - a row at every width gave the 260px sidebar (plus padding) the
     * whole of a 412px phone and left the content column 0px wide, off-screen.
     * Below md the sidebar stacks under the content; from md up it is the
     * familiar left rail.
     */
    <div className="flex w-full min-w-0 max-w-none flex-col gap-6 md:flex-row">
      {sidebar ? (
        <aside className="order-last w-full min-w-0 shrink-0 rounded-[28px] border border-border bg-surface p-5 shadow-lg md:order-first md:w-auto xl:sticky xl:top-6 xl:h-fit">
          {sidebar}
        </aside>
      ) : null}

      {/*
       * `grid-cols-[minmax(0,1fr)]` rather than a bare `grid`: a grid column
       * defaults to `auto`, which sizes to its widest content and refuses to
       * shrink, so one wide child (a table, a code block) stretches the whole
       * settings page past the viewport. `min-w-0` on this element does not
       * help — the constraint has to be on the column track. With this, wide
       * children stay inside the column and scroll within themselves.
       */}
      <div className="grid w-full min-w-0 max-w-none flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6">
        {showHeader ? (
          <header className="rounded-[28px] border border-border bg-surface px-6 py-5 shadow-sm">
            {breadcrumb ? (
              <nav
                aria-label="Breadcrumb"
                className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted"
              >
                {breadcrumb}
              </nav>
            ) : null}

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
              {description}
            </p>
          </header>
        ) : null}

        {children}
      </div>
    </div>
  );
}
