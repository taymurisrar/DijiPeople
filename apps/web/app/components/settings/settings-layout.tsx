"use client";

import { ReactNode } from "react";

type SettingsLayoutProps = {
  breadcrumb?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow?: string;
  sidebar?: ReactNode;
  title: string;
};

export function SettingsLayout({
  breadcrumb,
  children,
  description,
  eyebrow = "Settings",
  sidebar,
  title,
}: SettingsLayoutProps) {
  return (
    <main className="flex w-full min-w-0 max-w-none gap-6">
      {sidebar ? (
        <aside className="shrink-0 rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,252,0.94))] p-5 shadow-lg xl:sticky xl:top-6 xl:h-fit">
          {sidebar}
        </aside>
      ) : null}

      <div className="grid w-full min-w-0 max-w-none flex-1 content-start gap-6">
        <section className="h-fit w-full min-w-0 max-w-none rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,249,255,0.9))] p-7 shadow-lg">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            {eyebrow}
          </p>

          <h1 className="mt-2 font-medium text-2xl text-foreground">
            {title}
          </h1>

          <p className="mt-3 max-w-3xl text-sm text-muted">{description}</p>

          {breadcrumb ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs uppercase tracking-[0.16em] text-muted">
              {breadcrumb}
            </div>
          ) : null}
        </section>

        {children}
      </div>
    </main>
  );
}
