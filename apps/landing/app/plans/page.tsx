import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "../_components/site-shell";
import { getCommercialConfig } from "../../lib/commercial-config";
import { PlansExperience } from "./plans-experience";

export const metadata: Metadata = {
  title: "Plans and Pricing",
  description:
    "DijiPeople pricing is per active employee, shown in your region's currency. Compare Starter, Growth and Enterprise, estimate your cost, and start when you're ready.",
  alternates: { canonical: "/plans" },
  openGraph: {
    title: "Plans and Pricing | DijiPeople",
    description:
      "Simple pricing that scales with your team — per active employee, in your region's currency.",
    url: "/plans",
    type: "website",
  },
};

/**
 * Pricing FAQ.
 *
 * Deliberately limited to questions answerable from how the product and the
 * commercial configuration actually behave. Refund terms, tax treatment and
 * cancellation rights are governed by legal configuration that does not exist
 * yet, so they are omitted rather than guessed — a wrong answer here is a
 * commitment, not a typo.
 */
const faqs = [
  {
    question: "What counts as a billable employee?",
    answer:
      "Active employees. Someone who has left stops counting from their effective end date, and future hires don't count until they start. Administrators who aren't employees don't take up a place.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can move between plans as your organization's needs change, and the capabilities available to your team change with the plan.",
  },
  {
    question: "How does annual billing work?",
    answer:
      "Annual plans are billed once a year rather than monthly. Where an annual price is lower than paying monthly across a year, the saving is shown on the plan.",
  },
  {
    question: "Which currency will I be charged in?",
    answer:
      "The currency configured for your region. It's resolved automatically from where you are, and shown on this page before you start.",
  },
  {
    question: "Is payroll included?",
    answer:
      "Payroll is part of the platform, and which plans include it is shown in the comparison above.",
  },
  {
    question: "Can we bring our existing HR data across?",
    answer:
      "Yes. DijiPeople supports importing employee data, and our team can help you plan the move.",
  },
  {
    question: "Do you support attendance devices?",
    answer:
      "Yes. DijiPeople integrates with supported biometric and attendance devices so punches arrive automatically rather than being keyed in.",
  },
];

/**
 * Reassurance shown under the FAQ.
 *
 * Every line describes something the product does. There are deliberately no
 * uptime figures, certifications, compliance claims or support-response
 * promises — none of those are backed by anything in this repository, and
 * publishing them would be inventing trust rather than earning it.
 */
const reassurance = [
  {
    title: "Move between plans",
    body: "Start where you are today and change as your team grows.",
  },
  {
    title: "Turn on what you need",
    body: "Enable the modules your organization uses and leave the rest off.",
  },
  {
    title: "Secure checkout",
    body: "Payments are handled by our payment provider — we never see your card details.",
  },
];

export default async function PlansPage() {
  const config = await getCommercialConfig();

  return (
    <PageShell>
      <section className="max-w-3xl py-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Plans and pricing
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          Simple pricing that scales with your team.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted">
          You pay per active employee, in your region&rsquo;s currency. Plans
          differ by which parts of the platform they include — compare them
          below, or estimate what your organization would pay.
        </p>
      </section>

      <PlansExperience config={config} />

      {/* FAQ */}
      <section className="border-t border-border py-10">
        <h2 className="font-serif text-3xl text-foreground">
          Pricing questions
        </h2>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <h3 className="text-base font-semibold text-foreground">
                {faq.question}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reassurance */}
      <section className="grid gap-4 border-t border-border py-10 md:grid-cols-3">
        {reassurance.map((item) => (
          <div key={item.title}>
            <h2 className="text-sm font-semibold text-foreground">
              {item.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* Final CTA */}
      <section className="my-8 rounded-[28px] bg-foreground p-6 text-white sm:p-10">
        <h2 className="font-serif text-3xl">
          Ready to bring your HR operations together?
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
          Pick the plan that fits your team, or talk to us if you&rsquo;d like
          help choosing.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground"
            href="/subscribe"
          >
            Start subscription
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            href="/contact"
          >
            Talk to us
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
