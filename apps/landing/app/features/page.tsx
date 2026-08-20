import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "../_components/site-shell";
import {
  ArrowRightIcon,
  FeatureIcon,
} from "../_components/marketing/feature-icon";
import { getCommercialConfig } from "../../lib/commercial-config";
import { landingEnv } from "../../lib/env";
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_STORIES,
  CORE_OUTCOMES,
  LIFECYCLE_STAGES,
  PLATFORM_CAPABILITIES,
} from "../../lib/feature-presentation";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Hiring, employee records, attendance, leave, timesheets and payroll in one connected HR platform — so the same data moves through every stage instead of being retyped between tools.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Features | DijiPeople",
    description:
      "Run your workforce from hiring to payroll in one connected HR platform.",
    url: "/features",
    type: "website",
  },
};

export default async function FeaturesPage() {
  // The feature list is the product's own catalogue, fetched server-side. This
  // page previously held a hardcoded array of twelve cards, which advertised
  // capabilities the catalogue does not contain and omitted ones it does.
const config = await getCommercialConfig();

const catalog = Array.isArray(config.featureCatalog)
  ? config.featureCatalog
  : [];

  // Group by the catalogue's own categories, then order commercially. A
  // category the presentation layer does not know about still renders, using
  // the catalogue's label — so a feature added server-side cannot disappear.
  const byCategory = new Map<string, typeof catalog>();
  for (const feature of catalog) {
    const existing = byCategory.get(feature.categoryKey) ?? [];
    existing.push(feature);
    byCategory.set(feature.categoryKey, existing);
  }

  const orderedCategories = [
    ...CATEGORY_DISPLAY_ORDER.filter((key) => byCategory.has(key)),
    ...[...byCategory.keys()].filter(
      (key) => !CATEGORY_DISPLAY_ORDER.includes(key),
    ),
  ];

  const availableKeys = new Set(catalog.map((feature) => feature.key));
  const lifecycle = LIFECYCLE_STAGES.filter((stage) =>
    availableKeys.has(stage.featureKey),
  );

  return (
    <PageShell>
      {/* Hero */}
      <section className="max-w-4xl py-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Features
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">
          Run your workforce from hiring to payroll in one connected platform.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
          Most HR teams lose their time to the gaps between tools — re-entering a
          new hire, reconciling attendance against a spreadsheet, rebuilding the
          same payroll inputs every cycle. DijiPeople keeps those stages on the
          same record, so the data only gets entered once.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/plans"
          >
            View plans
            <ArrowRightIcon />
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            href="/contact"
          >
            Talk to us
          </Link>
        </div>
      </section>

      {/* Core outcomes */}
      <section className="grid gap-4 border-t border-border py-10 md:grid-cols-3">
        {CORE_OUTCOMES.map((outcome) => (
          <div key={outcome.title}>
            <h2 className="text-lg font-semibold text-foreground">
              {outcome.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{outcome.body}</p>
          </div>
        ))}
      </section>

      {/* Connected lifecycle */}
      {lifecycle.length > 0 ? (
        <section className="border-t border-border py-10">
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl text-foreground">
              One record, all the way through.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted">
              A candidate becomes an employee, whose attendance becomes
              timesheets, which become payroll inputs. Each stage reads what the
              last one produced.
            </p>
          </div>
          <ol className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-3">
            {lifecycle.map((stage, index) => (
              <li className="flex items-center gap-2" key={stage.featureKey}>
                <span className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground">
                  {stage.label}
                </span>
                {index < lifecycle.length - 1 ? (
                  <span className="text-muted-soft" aria-hidden="true">
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Feature groups — alternating so the page does not read as one grid */}
      {orderedCategories.map((categoryKey, index) => {
        const features = byCategory.get(categoryKey) ?? [];
        if (features.length === 0) return null;

        const story = CATEGORY_STORIES[categoryKey];
        const heading = story?.title ?? features[0].categoryLabel;
        const isAlternate = index % 2 === 1;

        return (
          <section
            className={[
              "border-t border-border py-10",
              isAlternate ? "lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:gap-10" : "",
            ].join(" ")}
            key={categoryKey}
          >
            <div className={isAlternate ? "" : "max-w-3xl"}>
              <h2 className="font-serif text-3xl text-foreground">{heading}</h2>
              {story ? (
                <>
                  <p className="mt-3 text-base font-medium leading-7 text-foreground">
                    {story.problem}
                  </p>
                  <p className="mt-2 text-base leading-7 text-muted">
                    {story.body}
                  </p>
                </>
              ) : null}
            </div>

            <ul
              className={[
                "mt-6 grid gap-4",
                isAlternate ? "lg:mt-0 sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
              ].join(" ")}
            >
              {features.map((feature) => (
                <li
                  className="rounded-2xl border border-border bg-white p-4"
                  key={feature.key}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <FeatureIcon name={feature.icon} />
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    {feature.label}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* Mid-page conversion */}
      <section className="my-4 rounded-[28px] border border-border bg-surface-muted p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              See which plan fits your team.
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              One flat price per plan, shown in your region&rsquo;s currency.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/plans"
          >
            View plans
            <ArrowRightIcon />
          </Link>
        </div>
      </section>

      {/* Platform capabilities — deliberately not given feature-section weight */}
      <section className="border-t border-border py-10">
        <div className="max-w-3xl">
          <h2 className="font-serif text-3xl text-foreground">
            The platform underneath
          </h2>
          <p className="mt-3 text-base leading-7 text-muted">
            The controls that make the product fit an organization rather than
            the other way round.
          </p>
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_CAPABILITIES.map((capability) => (
            <div key={capability.title}>
              <h3 className="text-sm font-semibold text-foreground">
                {capability.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                {capability.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="my-8 rounded-[28px] bg-foreground p-6 text-white sm:p-10">
        <h2 className="font-serif text-3xl">
          Ready to bring your HR operations together?
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
          Choose a plan and set up your workspace, or talk to us about what your
          organization needs.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground"
            href="/plans"
          >
            View plans
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            href={`${landingEnv.workspaceUrl.replace(/\/+$/, "")}/login`}
          >
            Sign in
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
