"use client";

import { ReactNode } from "react";

type SettingsLayoutProps = {
  breadcrumb?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow?: string;
  sidebar: ReactNode;
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
    <main className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,252,0.94))] p-5 shadow-lg xl:top-6 xl:h-fit">
        {sidebar}
      </aside>

      <div className="grid content-start gap-6">
        <section className="h-fit rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,249,255,0.9))] p-8 shadow-lg">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl text-foreground">{title}</h1>
          <p className="mt-3 max-w-3xl text-muted">{description}</p>
          {breadcrumb ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted">
              {breadcrumb}
            </div>
          ) : null}
        </section>

        {children}
      </div>
    </main>
  );
}
