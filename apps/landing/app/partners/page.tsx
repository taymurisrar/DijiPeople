import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";
import { PartnerInquiryForm } from "./partner-inquiry-form";

export const metadata: Metadata = {
  title: "Partner network",
  description:
    "Refer and deliver DijiPeople with a structured partner agreement, onboarding and commission model.",
};

export default function PartnersPage() {
  return (
    <PageShell>
      <section className="grid gap-10 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            DijiPeople partner network
          </p>
          <h1 className="font-serif text-4xl leading-tight text-foreground sm:text-5xl">
            Grow with a structured referral and delivery partnership.
          </h1>
          <p className="text-lg leading-8 text-muted">
            Introduce qualified businesses to DijiPeople, collaborate through a
            transparent onboarding and agreement process, and track attributed
            opportunities and earned commission in your partner portal.
          </p>
          <div className="grid gap-3 pt-2">
            {[
              "A documented partner agreement and commission model",
              "Secure onboarding, review, and e-signature",
              "A scoped portal for lead submission and status tracking",
              "Clear attribution from lead through customer conversion",
            ].map((item) => (
              <div
                key={item}
                className="flex gap-3 rounded-2xl border border-border bg-white p-4 text-sm font-medium text-foreground"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                  ✓
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
        <PartnerInquiryForm />
      </section>
    </PageShell>
  );
}
