import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { jobOpeningRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../../_lib/business-unit-access";

type NewJobOpeningPageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

const emptySearchParams: { formId?: string } = {};

export default async function NewJobOpeningPage({
  searchParams,
}: NewJobOpeningPageProps) {
  const [businessUnitAccess, params, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    searchParams ?? Promise.resolve(emptySearchParams),
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not allow job opening creation."
          title="Create job opening is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "create",
    sessionUser,
    spec: jobOpeningRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    params.formId ?? "",
    "main",
  );

  return (
    <main className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="create"
        record={{
          status: "DRAFT",
          educationLevels: [],
          allowedWorkModes: [],
          skillMatchWeight: 40,
          experienceFitWeight: 20,
          educationFitWeight: 10,
          locationFitWeight: 15,
          availabilityFitWeight: 15,
          requireAllMandatorySkills: false,
          rejectIfExperienceBelowMinimum: false,
          rejectIfWorkModeMismatch: false,
          rejectIfLocationMismatch: false,
        }}
        runtime={runtime}
        spec={jobOpeningRuntimeSpec}
        title="Create job opening"
      />
    </main>
  );
}
