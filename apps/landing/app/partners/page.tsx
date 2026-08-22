import type { Metadata } from "next";

import { PageShell } from "../_components/site-shell";
import {
  Eyebrow,
  Lede,
  PageHeading,
} from "../_components/marketing/typography";
import { fetchPrivacyPolicyHref } from "../../lib/legal-server";
import { PartnerInquiryForm } from "./partner-inquiry-form";

export const metadata: Metadata = {
  title: "Partner network",
  description:
    "Refer DijiPeople to businesses you work with, or deliver it for them. Clear terms, a signed agreement, and commission you can track.",
};

/*
 * Rewritten for the reader.
 *
 * A partner is usually a consultancy or an IT reseller, and this page addressed
 * them as a pipeline: "Introduce qualified businesses", "track attributed
 * opportunities and earned commission", "a scoped portal for lead submission
 * and status tracking". Every one of those describes our CRM rather than their
 * business, and "qualified" in particular tells a prospective partner we will be
 * grading their introductions before they have made one.
 *
 * The eyebrow also sat at `text-xs` / `tracking-[0.18em]` where the rest of the
 * site uses `text-sm` / `tracking-[0.16em]` — the same drift the features page
 * had, one page over.
 */
export default async function PartnersPage() {
  const privacyPolicyHref = await fetchPrivacyPolicyHref();

  return (
    <PageShell>
      <section className="grid gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-5">
          <Eyebrow>Partner network</Eyebrow>
          <PageHeading>
            Bring DijiPeople to the businesses you already work with.
          </PageHeading>
          <Lede>
            Refer clients to us, or deliver DijiPeople for them yourself. Either
            way you get a written agreement, a clear commission rate, and a place
            to see what happened to every introduction you made.
          </Lede>
          <div className="grid gap-3 pt-2">
            {[
              {
                title: "You know the terms up front",
                body: "A written partner agreement and a commission rate, both agreed before you refer anyone.",
              },
              {
                title: "Signing up is straightforward",
                body: "Apply, we review it, and you sign electronically. No paperwork in the post.",
              },
              {
                title: "You can see where things stand",
                body: "Submit a referral and follow it through in your partner portal.",
              },
              {
                title: "Your referrals stay yours",
                body: "Every introduction is linked to you, from first contact through to a paying customer.",
              },
            ].map((item) => (
              <div
                className="flex gap-3 rounded-2xl border border-border bg-white p-4"
                key={item.title}
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent"
                >
                  ✓
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted">
                    {item.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <PartnerInquiryForm privacyPolicyHref={privacyPolicyHref} />
      </section>
    </PageShell>
  );
}
