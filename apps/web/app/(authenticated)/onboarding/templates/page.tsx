import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { Button } from "@/app/components/ui/button";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { OnboardingTemplatesList } from "../_components/onboarding-templates-list";
import type { OnboardingTemplateRecord } from "../types";

export default async function OnboardingTemplatesPage() {
  const templates = await apiRequestJson<OnboardingTemplateRecord[]>(
    "/onboarding/templates",
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Onboarding
          </p>
          <h2 className="font-serif text-4xl text-foreground">
            Onboarding templates
          </h2>
        </div>

        <PermissionGate permission={PERMISSION_KEYS.ONBOARDING_CREATE}>
          <Button href="/onboarding/templates/new">New template</Button>
        </PermissionGate>
      </div>

      <OnboardingTemplatesList templates={templates} />
    </div>
  );
}
