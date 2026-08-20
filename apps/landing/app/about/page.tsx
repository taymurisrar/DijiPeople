import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../_components/site-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn why DijiPeople exists and who it serves as an HR operations SaaS platform.",
};

export default function AboutPage() {
  return (
    <PageShell>
      <section className="grid gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            About DijiPeople
          </p>
          <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
            HR operations should be clear enough to run every day.
          </h1>
        </div>
        <div className="space-y-5 text-base leading-7 text-muted">
          <p>
            DijiPeople is a SaaS platform for organizations that need practical
            structure across HR records, workforce execution, onboarding,
            payroll preparation, documents, and access control.
          </p>
          <p>
            It exists for teams that have outgrown spreadsheets and disconnected
            tools, but still need an implementation path that feels operational,
            controlled, and ready for phased rollout.
          </p>
          <p>
            The platform is built around tenant isolation, admin-managed plans,
            Stripe subscription billing, role-based access, and configurable HR
            workflows.
          </p>
          <Link className="inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white" href="/contact">
            Talk to the team
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Mission", "Give growing teams a reliable operating system for people work."],
          ["Who it is for", "Healthcare, services, staffing, IT, and structured SMB operations."],
          ["Positioning", "Enterprise-minded HR SaaS without unnecessary operational sprawl."],
        ].map(([title, description]) => (
          <article className="rounded-[24px] border border-border bg-white p-5" key={title}>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
