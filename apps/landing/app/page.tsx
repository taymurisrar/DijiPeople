import Link from "next/link";
import { PlanCards } from "./_components/plan-cards";
import { PageShell } from "./_components/site-shell";
import { resolveDisplayCurrency } from "../lib/plans";
import Image from "next/image";
import { getCommercialConfig } from "../lib/commercial-config";
import { getPublicPlans } from "../lib/plans-server";

// Customer-facing copy. "Stripe webhook" and "PlanPrice record" are how this is
// built, not what a buyer is choosing between — internal vocabulary on a public
// page reads as unfinished and answers a question nobody asked.
const faqs = [
  {
    question: "Can DijiPeople support multiple companies or workspaces?",
    answer:
      "Yes. DijiPeople is built as a multi-tenant platform, so each organization gets its own workspace with separate branding, access, and billing.",
  },
  {
    question: "Who controls the pricing shown here?",
    answer:
      "DijiPeople does. Published prices come from our commercial configuration, so the price you see is the price you are charged.",
  },
  {
    question: "When does my workspace become available?",
    answer:
      "We begin preparing your workspace as soon as your payment is confirmed, and email you as soon as it is ready.",
  },
];

export default async function HomePage() {
  const [plansResponse, commercialConfig] = await Promise.all([
    getPublicPlans(),
    getCommercialConfig(),
  ]);
  const plans = plansResponse.plans;
  const defaultCurrency = resolveDisplayCurrency(
    plans,
    commercialConfig.currency,
  );

  return (
    <PageShell>
      <section className="grid gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Public HR SaaS for operational teams
          </div>
          <div className="space-y-4">
            <h1 className="max-w-4xl font-serif text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">
              DijiPeople
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              Run employee management, attendance, leave, payroll preparation,
              onboarding, documents, recruitment, and tenant configuration from
              one subscription-ready HR operations platform.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className="rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold text-white hover:bg-accent-strong" href="/plans">
              View plans
            </Link>
            <Link className="rounded-xl border border-border bg-white px-5 py-3 text-center text-sm font-semibold text-foreground hover:bg-surface-muted" href="/contact">
              Contact sales
            </Link>
            <Link className="rounded-xl border border-border bg-white px-5 py-3 text-center text-sm font-semibold text-foreground hover:bg-surface-muted" href="/subscribe">
              Start subscription
            </Link>
          </div>
        </div>

<div className="relative overflow-hidden">
  <Image
    src="/images/hero.png"
    alt="DijiPeople HR platform dashboard"
    width={1200}
    height={900}
    className="h-full w-full object-cover"
    priority
  />

  {/* Optional subtle overlay */}
  {/* <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent p-6">
    <h3 className="text-lg font-semibold text-white">
      HR operations. Unified.
    </h3>
    <p className="mt-1 text-sm text-white/80">
      Employee lifecycle, payroll, leave, onboarding, and recruitment in one platform.
    </p>
  </div> */}
</div>
      </section>

      <section className="grid gap-4 py-8 md:grid-cols-3">
        {[
          ["People operations", "Core HR records, policies, documents, and self-service."],
          ["Workforce execution", "Attendance, leave, timesheets, and payroll preparation."],
          ["SaaS control", "Plans, tenant features, branding, roles, and billing lifecycle."],
        ].map(([title, description]) => (
          <article className="rounded-[24px] border border-border bg-white p-5 shadow-sm" key={title}>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </section>

      <section className="space-y-5 py-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            Pricing preview
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">
            Simple pricing, published by us.
          </h2>
        </div>
        <PlanCards
          defaultCurrency={defaultCurrency}
          error={plansResponse.error}
          plans={plans}
          compact
        />
      </section>

      <section className="grid gap-5 py-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            Trust and operations
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">
            Built for controlled rollout.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {["Your data stays separated", "Secure card payments", "Role-based access", "Full change history"].map((item) => (
            <div className="rounded-2xl border border-border bg-white p-4 text-sm font-semibold text-foreground" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 py-8">
        <h2 className="text-3xl font-semibold text-foreground">FAQ</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {faqs.map((faq) => (
            <article className="rounded-[24px] border border-border bg-white p-5" key={faq.question}>
              <h3 className="text-base font-semibold text-foreground">{faq.question}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="my-8 rounded-[28px] bg-foreground p-6 text-white sm:p-8">
        <h2 className="text-2xl font-semibold">Ready to launch cleaner HR operations?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">
          Choose a plan, tell us about your company, and continue to secure
          payment.
        </p>
        <Link className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground" href="/subscribe">
          Start subscription
        </Link>
      </section>
    </PageShell>
  );
}
