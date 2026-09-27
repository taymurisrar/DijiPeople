import { OnboardingTemplateForm } from "../../_components/onboarding-template-form";

export default function NewOnboardingTemplatePage() {
  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Onboarding
        </p>
        <h2 className="font-serif text-4xl text-foreground">
          New onboarding template
        </h2>
      </div>

      <OnboardingTemplateForm mode="create" />
    </div>
  );
}
