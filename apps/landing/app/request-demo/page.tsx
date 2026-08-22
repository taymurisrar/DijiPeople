import type { Metadata } from "next";
import { LeadFormSection } from "../_components/marketing/lead-form-section";
import { PageShell } from "../_components/site-shell";

export const metadata: Metadata = {
  title: "Request a demo",
  description:
    "Book a walkthrough of DijiPeople with your own team structure and priorities in mind.",
};

export default function RequestDemoPage() {
  return (
    <PageShell>
      <div className="py-10 lg:py-16">
        <LeadFormSection />
      </div>
    </PageShell>
  );
}
