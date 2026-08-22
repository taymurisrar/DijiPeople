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
      {/*
        Hero.

        The page this replaces opened with a heading on flat page background and
        two buttons — technically complete and visually indistinguishable from
        the plain document underneath it. The wash, the rule of proof points and
        the eyebrow are all doing one job: giving the first screen enough
        structure that it reads as a product page rather than a memo.
      */}
      <section className="relative -mx-4 overflow-hidden rounded-[36px] px-4 py-14 sm:-mx-6 sm:px-10 sm:py-20 lg:-mx-8 lg:px-14">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_0%,var(--accent-soft)_0%,transparent_55%),radial-gradient(100%_100%_at_100%_0%,#e6edf6_0%,transparent_50%)]"
        />
        {/*
          A hairline grid, at 4% opacity. Enough to give the wash a surface;
          not enough to compete with a single word of the heading.
        */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.04] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="max-w-4xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent backdrop-blur">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Features
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">
            Run your workforce from hiring to payroll in one connected platform.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Most HR teams lose their time to the gaps between tools —
            re-entering a new hire, reconciling attendance against a
            spreadsheet, rebuilding the same payroll inputs every cycle.
            DijiPeople keeps those stages on the same record, so the data only
            gets entered once.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-accent-strong hover:shadow-[var(--shadow-md)]"
              href="/plans"
            >
              View plans
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-border bg-white/80 px-5 py-3 text-sm font-semibold text-foreground backdrop-blur transition hover:bg-white"
              href="/contact"
            >
              Talk to us
            </Link>
          </div>
          {/*
            Counted from the catalogue, never typed in. A marketing page that
            claims a number the product does not have is the same defect as a
            badge that counts nothing.
          */}
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-border/70 pt-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-soft">
                Capabilities
              </dt>
              <dd className="mt-0.5 font-serif text-2xl text-foreground">
                {catalog.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-soft">
                Areas covered
              </dt>
              <dd className="mt-0.5 font-serif text-2xl text-foreground">
                {orderedCategories.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-soft">
                Lifecycle stages on one record
              </dt>
              <dd className="mt-0.5 font-serif text-2xl text-foreground">
                {lifecycle.length}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Core outcomes */}
      <section className="grid gap-4 py-12 md:grid-cols-3">
        {CORE_OUTCOMES.map((outcome, index) => (
          <div
            className="rounded-[24px] border border-border bg-white/80 p-6 backdrop-blur transition hover:border-border-strong hover:shadow-[var(--shadow-sm)]"
            key={outcome.title}
          >
            <span
              aria-hidden
              className="font-mono text-xs font-semibold text-accent"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {outcome.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{outcome.body}</p>
          </div>
        ))}
      </section>

      {/* Connected lifecycle */}
      {lifecycle.length > 0 ? (
        <section className="relative overflow-hidden rounded-[28px] border border-border bg-foreground px-6 py-10 text-white sm:px-10 sm:py-12">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]"
          />
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-soft">
              The through-line
            </p>
            <h2 className="mt-3 font-serif text-3xl">
              One record, all the way through.
            </h2>
            <p className="mt-3 text-base leading-7 text-white/70">
              A candidate becomes an employee, whose attendance becomes
              timesheets, which become payroll inputs. Each stage reads what the
              last one produced.
            </p>
          </div>
          {/*
            A numbered flow rather than pills separated by arrow glyphs. The
            step number is what carries the sequence — arrows between wrapped
            pills point in whatever direction the line break left them.
          */}
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lifecycle.map((stage, index) => (
              <li
                className="relative rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5"
                key={stage.featureKey}
              >
                <span className="font-mono text-[11px] font-semibold text-accent-soft">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-1 text-sm font-semibold">{stage.label}</p>
                {index < lifecycle.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-white/30 lg:block"
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/*
        A contents rail.

        The catalogue runs to six sections and forty-odd cards. Without a way
        to jump, everything below the second section is reached by scrolling
        past things you already decided you did not need.
      */}
      {orderedCategories.length > 1 ? (
        <nav
          aria-label="Feature areas"
          className="sticky top-16 z-10 -mx-4 mt-10 overflow-x-auto border-y border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        >
          <ul className="flex min-w-max gap-2">
            {orderedCategories.map((categoryKey) => {
              const features = byCategory.get(categoryKey) ?? [];
              if (features.length === 0) return null;
              const heading =
                CATEGORY_STORIES[categoryKey]?.title ??
                features[0].categoryLabel;
              return (
                <li key={categoryKey}>
                  <a
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                    href={`#area-${categoryKey}`}
                  >
                    {heading}
                    <span className="text-xs text-muted-soft">
                      {features.length}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
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
              "scroll-mt-32 border-t border-border py-12",
              isAlternate
                ? "lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:gap-12"
                : "",
            ].join(" ")}
            id={`area-${categoryKey}`}
            key={categoryKey}
          >
            <div
              className={
                isAlternate ? "lg:sticky lg:top-32 lg:h-fit" : "max-w-3xl"
              }
            >
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                {String(index + 1).padStart(2, "0")} · {features.length}{" "}
                {features.length === 1 ? "capability" : "capabilities"}
              </p>
              <h2 className="mt-2 font-serif text-3xl text-foreground">
                {heading}
              </h2>
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
                "mt-8 grid gap-4",
                isAlternate
                  ? "lg:mt-0 sm:grid-cols-2"
                  : "sm:grid-cols-2 lg:grid-cols-3",
              ].join(" ")}
            >
              {features.map((feature) => (
                <li
                  /*
                   * `group` plus a border that warms on hover, rather than a
                   * flat box. The lift is 1px and the shadow is the token the
                   * rest of the site uses — enough for a card to answer when
                   * you point at it, not enough to bounce.
                   */
                  className="group rounded-[20px] border border-border bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-md)]"
                  key={feature.key}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white">
                    <FeatureIcon name={feature.icon} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {feature.label}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* Mid-page conversion */}
      <section className="my-6 overflow-hidden rounded-[28px] border border-accent/20 bg-[linear-gradient(110deg,var(--accent-soft)_0%,var(--surface-muted)_60%,var(--surface-muted)_100%)] p-6 sm:p-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
              See which plan fits your team.
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              One flat price per plan, shown in your region&rsquo;s currency.
            </p>
          </div>
          <Link
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/plans"
          >
            View plans
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* Platform capabilities — deliberately not given feature-section weight */}
      <section className="border-t border-border py-12">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Underneath
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            The platform underneath
          </h2>
          <p className="mt-3 text-base leading-7 text-muted">
            The controls that make the product fit an organization rather than
            the other way round.
          </p>
        </div>
        <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_CAPABILITIES.map((capability) => (
            <div
              className="border-l-2 border-accent-soft pl-4"
              key={capability.title}
            >
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
      <section className="relative my-10 overflow-hidden rounded-[28px] bg-foreground p-6 text-white sm:p-12">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(90%_140%_at_100%_0%,rgba(15,118,110,0.5)_0%,transparent_60%)]"
        />
        <h2 className="font-serif text-3xl sm:text-4xl">
          Ready to bring your HR operations together?
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
          Choose a plan and set up your workspace, or talk to us about what your
          organization needs.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/90"
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
