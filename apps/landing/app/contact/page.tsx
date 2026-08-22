import type { Metadata } from "next";

import { PageShell } from "../_components/site-shell";
import { Eyebrow, PageHeading } from "../_components/marketing/typography";
import { getCommercialConfig } from "../../lib/commercial-config";
import { fetchPrivacyPolicyHref } from "../../lib/legal-server";
import { resolveIntentParam } from "../../lib/acquisition-options";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Ask us about DijiPeople — what it does, what it costs, how a move from your current tools would work, or anything else.",
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
  const [config, privacyPolicyHref] = await Promise.all([
    getCommercialConfig(),
    fetchPrivacyPolicyHref(),
  ]);
  const interestAreas = config.featureCatalog.map((feature) => ({
    key: feature.key,
    label: feature.label,
  }));

  return (
    <PageShell>
      <section className="grid gap-8 py-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <Eyebrow>Contact us</Eyebrow>
          <PageHeading>Let&rsquo;s work out what you need.</PageHeading>
          <p className="text-base leading-7 text-muted">
            Whether you want a demo, a question answered, or help deciding
            between plans — send us a note and we&rsquo;ll come back to you.
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
          privacyPolicyHref={privacyPolicyHref}
        />
      </section>
    </PageShell>
  );
}
