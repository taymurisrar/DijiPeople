import type { Metadata } from "next";
import { LeadFormSection } from "../_components/marketing/lead-form-section";
import { PageShell } from "../_components/site-shell";

export const metadata: Metadata = {
  title: "Request a demo",
  description: "Request a tailored DijiPeople HR platform demonstration.",
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
