import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "../_components/site-shell";
import { FeatureIcon } from "../_components/marketing/feature-icon";
import {
  ClosingCta,
  Eyebrow,
  Lede,
  PageHeading,
  SectionHeading,
} from "../_components/marketing/typography";
import { getCommercialConfig } from "../../lib/commercial-config";
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

/*
 * This page was rebuilt because it read as a different website.
 *
 * Two problems, and they compounded. **Theme**: it had its own visual language —
 * radial-gradient washes, a hairline grid overlay, `backdrop-blur` surfaces,
 * `font-mono` eyebrows where every other page used sans, serif headings at three
 * different sizes, a sticky contents rail nothing else on the site had, and two
 * inverted dark panels with gradients over them. Nine distinct treatments on one
 * page, against roughly three everywhere else.
 *
 * **Structure**: the order did not build an argument. A hero counting its own
 * capabilities ("Capabilities 41, Areas covered 6") — numbers that flatter us
 * and tell a buyer nothing — then outcomes, then the lifecycle, then a jump
 * rail, then six category sections whose layout alternated between two column
 * arrangements, then a mid-page CTA interrupting them, then platform
 * capabilities, then a second CTA. A reader could not tell which parts were the
 * page and which were interruptions.
 *
 * What it does now, in order: say what the product is, show the one thing that
 * makes it different (the stages share a record), list what is in it in a single
 * consistent grid, note the platform underneath, and close. Every heading, card
 * and CTA is the shared component the rest of the site uses, so this page cannot
 * drift away from the others again without taking them with it.
 */
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
  ].filter((key) => (byCategory.get(key) ?? []).length > 0);

  const availableKeys = new Set(catalog.map((feature) => feature.key));
  const lifecycle = LIFECYCLE_STAGES.filter((stage) =>
    availableKeys.has(stage.featureKey),
  );

  return (
    <PageShell>
      {/* Hero — the same plain opening every other page uses. */}
      <section className="max-w-3xl py-10 sm:py-14">
        <Eyebrow>Features</Eyebrow>
        <PageHeading className="mt-3">
          Everything your HR team runs, in one place.
        </PageHeading>
        <Lede className="mt-5">
          Most HR teams lose their time to the gaps between tools — re-entering a
          new hire, checking attendance against a spreadsheet, rebuilding the
          same payroll inputs every month. DijiPeople keeps those stages on the
          same record, so information gets entered once.
        </Lede>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/plans"
          >
            View plans
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            href="/contact"
          >
            Talk to us
          </Link>
        </div>
      </section>

      {/*
        The through-line — the page's actual argument, so it comes first.

        This was an inverted dark panel with a grid pattern washed over it, which
        made the one idea worth reading look like a decorative break. It is a
        plain numbered row now, on the same card surface as everything else.
      */}
      {lifecycle.length > 0 ? (
        <section className="border-t border-border py-10">
          <div className="max-w-3xl">
            <SectionHeading>One record, all the way through</SectionHeading>
            <p className="mt-3 text-base leading-7 text-muted">
              A candidate becomes an employee, whose attendance becomes
              timesheets, which become payroll inputs. Each stage reads what the
              one before it produced — nothing is retyped, and nothing has to be
              reconciled afterwards.
            </p>
          </div>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lifecycle.map((stage, index) => (
              <li
                className="rounded-2xl border border-border bg-white p-4 shadow-sm"
                key={stage.featureKey}
              >
                <span className="text-xs font-semibold text-accent">
                  Step {index + 1}
                </span>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {stage.label}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* What you get from it, before the list of what is in it. */}
      <section className="grid gap-4 border-t border-border py-10 md:grid-cols-3">
        {CORE_OUTCOMES.map((outcome) => (
          <article
            className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
            key={outcome.title}
          >
            <h2 className="text-lg font-semibold text-foreground">
              {outcome.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{outcome.body}</p>
          </article>
        ))}
      </section>

      {/*
        The catalogue.

        One layout for every category — the alternating two-column arrangement
        meant a reader re-learned where to look every other section, for no gain.
        The story sits above its grid, and the grid is the same three columns
        throughout.
      */}
      {orderedCategories.map((categoryKey) => {
        const features = byCategory.get(categoryKey) ?? [];
        const story = CATEGORY_STORIES[categoryKey];
        const heading = story?.title ?? features[0].categoryLabel;

        return (
          <section
            className="border-t border-border py-10"
            id={`area-${categoryKey}`}
            key={categoryKey}
          >
            <div className="max-w-3xl">
              <SectionHeading>{heading}</SectionHeading>
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

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li
                  className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
                  key={feature.key}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
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

      {/*
        Platform capabilities, deliberately lighter than a feature section.

        Giving "role-based access" the same card as payroll describes the
        software to an engineer rather than the product to a buyer.
      */}
      <section className="border-t border-border py-10">
        <div className="max-w-3xl">
          <SectionHeading>The platform underneath</SectionHeading>
          <p className="mt-3 text-base leading-7 text-muted">
            The controls that let the product fit your organization, rather than
            the other way round.
          </p>
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
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

      <ClosingCta
        body="Pick the plan that fits your team, or tell us what your organization needs and we'll help you choose."
        primary={{ href: "/plans", label: "View plans" }}
        secondary={{ href: "/contact", label: "Talk to us" }}
        title="Ready to bring your HR operations together?"
      />
    </PageShell>
  );
}
