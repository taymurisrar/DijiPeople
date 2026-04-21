import {
  BriefcaseBusiness,
  ClipboardList,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react";
import { valueItems } from "./content";

const valueIcons = [
  Users2,
  ClipboardList,
  ShieldCheck,
  BriefcaseBusiness,
];

export function ValueSection() {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,249,248,0.98))] p-6 shadow-sm lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.06),transparent_20%),radial-gradient(circle_at_85%_18%,rgba(226,161,76,0.06),transparent_18%)]" />

      <div className="relative grid gap-8">
        <div className="max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Why DijiPeople
          </div>

          <h2 className="max-w-5xl text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-5xl">
            A modern HRM platform for businesses that need order, visibility,
            and clean execution.
          </h2>

          <p className="max-w-3xl text-base leading-7 text-muted sm:text-lg">
            DijiPeople helps teams centralize employee operations without
            turning everyday HR work into a messy patchwork of spreadsheets,
            inbox threads, and disconnected tools.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {valueItems.map((item, index) => {
            const Icon = valueIcons[index] ?? Users2;

            return (
              <article
                key={item.title}
                className="group rounded-[26px] border border-border bg-white/92 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-accent/20 hover:shadow-[0_18px_40px_rgba(16,33,43,0.08)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft shadow-sm transition group-hover:scale-105">
                  <Icon className="h-5 w-5 text-accent" />
                </div>

                <div className="mt-4 space-y-3">
                  <p className="text-lg font-semibold leading-8 text-foreground">
                    {item.title}
                  </p>
                  <p className="text-sm leading-7 text-muted">
                    {item.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}