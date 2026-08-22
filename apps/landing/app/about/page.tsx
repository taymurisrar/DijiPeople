import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "../_components/site-shell";
import {
  Eyebrow,
  PageHeading,
  SectionHeading,
} from "../_components/marketing/typography";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why DijiPeople exists, and who it's for: growing teams that have outgrown spreadsheets for HR, attendance and payroll.",
};

/*
 * This page described our architecture to prospective customers.
 *
 * It said the platform is "built around tenant isolation, admin-managed plans,
 * Stripe subscription billing, role-based access, and configurable HR
 * workflows", offered "an implementation path that feels operational,
 * controlled, and ready for phased rollout", and gave one of its three cards the
 * heading "Positioning". Tenant isolation is a real and important property of
 * the system, and it is not a reason anybody buys HR software — it is an answer
 * to a question a buyer would phrase as "can other companies see our data".
 *
 * Everything here now says what the reader gets, in words they would use.
 * Nothing claims a certification, an uptime figure or a customer count: this
 * repository holds evidence for none of those, and an About page is exactly
 * where inventing them is most tempting.
 */
export default function AboutPage() {
  return (
    <PageShell>
      <section className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Eyebrow>About DijiPeople</Eyebrow>
          <PageHeading className="mt-3">
            HR should be simple enough to run every day.
          </PageHeading>
        </div>
        <div className="space-y-5 text-base leading-7 text-muted">
          <p>
            DijiPeople keeps the everyday work of an HR team in one place:
            employee records, attendance and leave, hiring and onboarding,
            documents, and the numbers payroll needs each month.
          </p>
          <p>
            We built it for teams who have outgrown spreadsheets and a handful of
            disconnected tools, but don&rsquo;t want a year-long rollout to fix
            it. You can turn on the parts you need now and add the rest later.
          </p>
          <p>
            The point is that the same information moves through every stage. A
            candidate you hire becomes an employee record. The hours they work
            become timesheets. Those timesheets become payroll inputs. Nobody
            retypes anything, so nothing has to be reconciled afterwards.
          </p>
          <Link
            className="inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/contact"
          >
            Talk to the team
          </Link>
        </div>
      </section>

      <section className="border-t border-border py-10">
        <SectionHeading>What we&rsquo;re trying to do</SectionHeading>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Enter it once",
              body: "Information you've already given us shouldn't have to be given again. That's the whole idea, and most of the work.",
            },
            {
              title: "Fit how you already work",
              body: "Your structure, your roles, your approval steps. The product bends to the organization rather than the other way round.",
            },
            {
              title: "Start where you are",
              body: "Turn on what you need today, move between plans as your team grows, and bring your existing employee data with you.",
            },
          ].map((item) => (
            <article
              className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
              key={item.title}
            >
              <h3 className="text-lg font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border py-10">
        <SectionHeading>Who it&rsquo;s for</SectionHeading>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
          Organizations with enough people that HR admin has become
          somebody&rsquo;s full-time problem — commonly in healthcare,
          professional services, staffing and technology, though the work looks
          much the same wherever people are employed, paid and scheduled.
        </p>
      </section>
    </PageShell>
  );
}
