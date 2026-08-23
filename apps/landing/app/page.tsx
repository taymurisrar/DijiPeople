import Link from "next/link";
import Image from "next/image";

import { PlanPreview } from "./_components/plan-preview";
import { PageShell } from "./_components/site-shell";
import {
  ClosingCta,
  Eyebrow,
  Lede,
  PageHeading,
  SectionHeading,
} from "./_components/marketing/typography";
import { getCommercialConfig } from "../lib/commercial-config";

/*
 * Customer-facing copy.
 *
 * The rule this page kept breaking: a buyer is not a tenant, does not have a
 * "subscription-ready platform", and is not looking for "SaaS control". Those
 * are how the product is built, not what someone is choosing between. Internal
 * vocabulary on a public page reads as unfinished and answers a question nobody
 * asked — and "tenant", specifically, describes the reader as a row in our
 * database.
 */
const faqs = [
  {
    question: "Can we run more than one company on it?",
    answer:
      "Yes. Each company gets its own separate workspace, with its own branding, its own people, and its own billing. Nothing is shared between them.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Yes. The prices on this site are the ones we charge, shown in your region's currency, with no setup fee.",
  },
  {
    question: "How soon can we start using it?",
    answer:
      "We start setting up your workspace as soon as your payment goes through, and email you the moment it's ready.",
  },
];

/** What the product covers, in the terms an HR team would use. */
const areas = [
  {
    title: "Your people",
    body: "Employee records, org structure, documents and policies — with self-service so your team keeps their own details up to date.",
  },
  {
    title: "Their time",
    body: "Attendance, leave, timesheets and the payroll inputs that come out of them, without rebuilding a spreadsheet each month.",
  },
  {
    title: "How you run it",
    body: "Decide who can see what, turn on the modules you need, and apply your own branding across the whole workspace.",
  },
];

export default async function HomePage() {
  /*
   * One source for what a visitor can buy and what it costs: published
   * commercial configuration, resolved server-side for their market.
   *
   * This page used to also fetch `/public/plans` and reconcile the two. It
   * could not: that endpoint is not market-scoped, so the reconciliation was a
   * guess, and the guess disagreed with `/plans` and `/subscribe`. Asking one
   * question of one source is what makes the three pages agree by construction
   * rather than by three matching implementations.
   */
  const commercialConfig = await getCommercialConfig();

  return (
    <PageShell>
      <section className="grid gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            HR software for growing teams
          </div>
          <div className="space-y-4">
            {/*
              The heading was the word "DijiPeople" — the brand name where the
              value proposition belongs. Someone arriving from a search result
              learned only that they had found us, not what we do, and the page
              had no h1 describing the product at all.
            */}
            <PageHeading className="max-w-4xl lg:text-6xl">
              HR, attendance and payroll that finally talk to each other.
            </PageHeading>
            <Lede className="max-w-2xl">
              Keep your people records, attendance, leave, hiring and payroll
              preparation in one place — so a new hire is entered once, and the
              hours your team works are the hours payroll sees.
            </Lede>
          </div>
          {/*
            Two choices, not three.

            This offered "View plans", "Contact sales" and "Start subscription"
            side by side, which asks a first-time visitor to decide how ready
            they are before they know what the product costs. Plans is the
            honest first step and leads to checkout anyway.
          */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/plans"
            >
              See plans and pricing
            </Link>
            <Link
              className="rounded-xl border border-border bg-white px-5 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-surface-muted"
              href="/contact"
            >
              Talk to us
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <Image
            alt="The DijiPeople dashboard, showing employee records and attendance"
            className="h-full w-full object-cover"
            height={900}
            priority
            src="/images/hero.png"
            width={1200}
          />
        </div>
      </section>

      <section className="grid gap-4 py-8 md:grid-cols-3">
        {areas.map((area) => (
          <article
            className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
            key={area.title}
          >
            <h2 className="text-lg font-semibold text-foreground">
              {area.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{area.body}</p>
          </article>
        ))}
      </section>

      <section className="space-y-5 border-t border-border py-10">
        <div className="max-w-3xl">
          <Eyebrow>Pricing</Eyebrow>
          <SectionHeading className="mt-2">
            Priced per employee
          </SectionHeading>
        </div>
        <PlanPreview config={commercialConfig} />
        <p className="text-sm text-muted">
          <Link
            className="font-semibold text-accent underline-offset-4 hover:underline"
            href="/plans"
          >
            Compare all plans in detail
          </Link>{" "}
          — including annual pricing and what each one includes.
        </p>
      </section>

      <section className="grid gap-5 border-t border-border py-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Eyebrow>Peace of mind</Eyebrow>
          {/*
            Was "Built for controlled rollout" over four bare labels. Neither the
            heading nor the labels said anything a buyer could act on: "Your data
            stays separated" separated from what?
          */}
          <SectionHeading className="mt-2">
            Set up the way you&rsquo;d want it
          </SectionHeading>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: "Your data stays yours",
              body: "Each company's workspace is kept separate from every other one.",
            },
            {
              title: "Secure payments",
              body: "Cards are handled by our payment provider — we never see the details.",
            },
            {
              title: "You control access",
              body: "Decide who can see and change what, down to individual records.",
            },
            {
              title: "Nothing changes silently",
              body: "Every change is recorded, with who made it and when.",
            },
          ].map((item) => (
            <div
              className="rounded-2xl border border-border bg-white p-4"
              key={item.title}
            >
              <p className="text-sm font-semibold text-foreground">
                {item.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5 border-t border-border py-10">
        <SectionHeading>Common questions</SectionHeading>
        <div className="grid gap-4 lg:grid-cols-3">
          {faqs.map((faq) => (
            <article
              className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
              key={faq.question}
            >
              <h3 className="text-base font-semibold text-foreground">
                {faq.question}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <ClosingCta
        body="Pick the plan that fits your team and set up your workspace, or talk to us if you'd like help choosing."
        primary={{ href: "/plans", label: "See plans and pricing" }}
        secondary={{ href: "/contact", label: "Talk to us" }}
        title="Ready to get your HR in one place?"
      />
    </PageShell>
  );
}
