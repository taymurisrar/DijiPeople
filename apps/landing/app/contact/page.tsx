import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact | DijiPeople",
  description:
    "Contact DijiPeople for product questions, sales qualification, implementation discussions, and HR operations support.",
};

export default function ContactPage() {
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
            Submit the form and your request will create a real lead record in
            the DijiPeople admin system for follow-up and qualification.
          </p>
          <div className="rounded-[24px] border border-border bg-white p-5 text-sm leading-6 text-muted">
            <p className="font-semibold text-foreground">Sales qualification</p>
            <p className="mt-2">
              Helpful details include team size, current HR tools, payroll
              region, implementation timeline, and the modules you want to roll
              out first.
            </p>
          </div>
        </div>
        <ContactForm />
      </section>
    </PageShell>
  );
}
