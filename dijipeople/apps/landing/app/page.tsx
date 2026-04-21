import { HeroSection } from "./_components/marketing/hero-section";
import { IndustrySection } from "./_components/marketing/industry-section";
import { LeadFormSection } from "./_components/marketing/lead-form-section";
import { PlansSection } from "./_components/marketing/plans-section";
import { SiteFooter } from "./_components/marketing/site-footer";
import { ValueSection } from "./_components/marketing/value-section";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <HeroSection />
        <ValueSection />
        <IndustrySection />
        <PlansSection />
        <LeadFormSection />
      </div>
      <SiteFooter />
    </main>
  );
}
