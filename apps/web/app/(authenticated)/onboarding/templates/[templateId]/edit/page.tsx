import { apiRequestJson } from "@/lib/server-api";
import { OnboardingTemplateForm } from "../../../_components/onboarding-template-form";
import type { OnboardingTemplateRecord } from "../../../types";

type EditOnboardingTemplatePageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function EditOnboardingTemplatePage({
  params,
}: EditOnboardingTemplatePageProps) {
  const { templateId } = await params;
  const template = await apiRequestJson<OnboardingTemplateRecord>(
    `/onboarding/templates/${templateId}`,
  );

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Onboarding
        </p>
        <h2 className="font-serif text-4xl text-foreground">
          Edit onboarding template
        </h2>
      </div>

      <OnboardingTemplateForm mode="edit" template={template} />
    </div>
  );
}
