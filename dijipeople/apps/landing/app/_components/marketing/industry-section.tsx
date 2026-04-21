import {
  Activity,
  BriefcaseBusiness,
  Building2,
  Stethoscope,
} from "lucide-react";
import { industries } from "./content";

const industryIcons = {
  "Healthcare teams": Stethoscope,
  "Recruitment and staffing": BriefcaseBusiness,
  "IT and service companies": Activity,
  "Structured SMB operations": Building2,
} as const;

export function IndustrySection() {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,247,0.98))] p-6 shadow-sm lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,118,110,0.06),transparent_20%),radial-gradient(circle_at_bottom_left,rgba(226,161,76,0.06),transparent_24%)]" />

      <div className="relative grid gap-8">
        <div className="max-w-4xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
            Built for teams like yours
          </p>

          <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            Relevant for operational businesses, not generic software teams alone.
          </h2>

          <p className="max-w-3xl text-base leading-7 text-muted">
            DijiPeople is designed for businesses that need structured people
            operations, controlled workflows, and a practical system for hiring,
            approvals, onboarding, and ongoing HR execution.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {industries.map((industry) => {
            const Icon =
              industryIcons[industry.title as keyof typeof industryIcons] ??
              Building2;

            return (
              <article
                key={industry.title}
                className="group rounded-[26px] border border-border bg-white/92 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-accent/20 hover:shadow-[0_18px_40px_rgba(16,33,43,0.08)]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft shadow-sm transition group-hover:scale-105">
                    <Icon className="h-5 w-5 text-accent" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-7 text-foreground">
                      {industry.title}
                    </p>

                    <p className="mt-3 text-sm leading-7 text-muted">
                      {industry.description}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}