import Link from "next/link";
import { PlanCards } from "./_components/plan-cards";
import { PageShell } from "./_components/site-shell";
import { resolveDefaultCurrency } from "../lib/plans";
import Image from "next/image";
import { getDetectedCountry, getPublicPlans } from "../lib/plans-server";

const featureHighlights = [
  "Employee records, reporting lines, and documents",
  "Attendance, leave, timesheets, and approvals",
  "Recruitment, onboarding, and role-based access",
  "Tenant branding, configuration, and subscription control",
];

const faqs = [
  {
    question: "Can DijiPeople support multiple companies or workspaces?",
    answer:
      "Yes. DijiPeople is built as a multi-tenant platform with tenant-level branding, access, features, and billing records.",
  },
  {
    question: "Are prices managed by the admin team?",
    answer:
      "Yes. Public pricing is pulled from active admin-managed plans and active Stripe-ready plan prices.",
  },
  {
    question: "When does a public signup become active?",
    answer:
      "The workspace remains inactive until Stripe confirms payment through the webhook.",
  },
];

export default async function HomePage() {
  const plansResponse = await getPublicPlans();
  const plans = plansResponse.plans;
  const country = await getDetectedCountry();
  const defaultCurrency = resolveDefaultCurrency(plans, country);

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
            Real plans from the DijiPeople admin system.
          </h2>
        </div>
        <PlanCards
          availableCurrencies={plansResponse.availableCurrencies}
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
          {["Webhook-only activation", "Stripe-backed subscriptions", "Role-based access", "Audit-friendly lifecycle"].map((item) => (
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
          Choose a live plan, submit company details, and continue through
          secure Stripe Checkout.
        </p>
        <Link className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground" href="/subscribe">
          Start subscription
        </Link>
      </section>
    </PageShell>
  );
}
