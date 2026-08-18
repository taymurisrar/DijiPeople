import type { Metadata } from "next";

import { PageShell } from "../_components/site-shell";
import { getCommercialConfig } from "../../lib/commercial-config";
import { resolveIntentParam } from "../../lib/acquisition-options";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact DijiPeople for product questions, sales qualification, implementation discussions, and HR operations support.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  // Interest areas come from the feature catalogue the product gates modules
  // on. The form previously offered its own list of display strings, which was
  // a second stale module list and did not match any real module key.
  const config = await getCommercialConfig();
  const interestAreas = config.featureCatalog.map((feature) => ({
    key: feature.key,
    label: feature.label,
  }));

  return (
    <PageShell>
      <section className="grid gap-8 py-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            Contact us
          </p>
          <h1 className="font-serif text-4xl text-foreground sm:text-5xl">
            Tell us what your HR operation needs next.
          </h1>
          <p className="text-base leading-7 text-muted">
            Tell us what you&rsquo;re looking for and we&rsquo;ll connect you
            with the right next step.
          </p>
          <div className="rounded-[24px] border border-border bg-white p-5 text-sm leading-6 text-muted">
            <p className="font-semibold text-foreground">
              What helps us answer quickly
            </p>
            <p className="mt-2">
              Your team size, the HR tools you use today, where you run payroll,
              when you&rsquo;d like to be live, and which areas you want to sort
              out first.
            </p>
          </div>
        </div>
        <ContactForm
          initialIntent={resolveIntentParam(intent)}
          interestAreas={interestAreas}
        />
      </section>
    </PageShell>
  );
}
