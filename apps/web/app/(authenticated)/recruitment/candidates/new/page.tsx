import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentCandidateRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../../_lib/business-unit-access";

type NewCandidatePageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

const emptySearchParams: { formId?: string } = {};

export default async function NewCandidatePage({
  searchParams,
}: NewCandidatePageProps) {
  const [businessUnitAccess, params, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    searchParams ?? Promise.resolve(emptySearchParams),
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <div className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not allow candidate creation."
          title="Create candidate is unavailable for your current business unit access."
        />
      </div>
    );
  }

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "create",
    sessionUser,
    spec: recruitmentCandidateRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    params.formId ?? "",
    "main",
  );

  return (
    <div className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="create"
        record={{
          currentStatus: "APPLIED",
          willingToRelocate: false,
          skills: "",
          certifications: "",
          interests: "",
          hobbies: "",
          strengths: "",
        }}
        runtime={runtime}
        spec={recruitmentCandidateRuntimeSpec}
        title="Create candidate"
      />
    </div>
  );
}
