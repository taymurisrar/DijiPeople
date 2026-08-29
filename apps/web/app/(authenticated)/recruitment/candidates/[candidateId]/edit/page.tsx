import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentCandidateRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import {
  candidateLookupDisplayValues,
  candidateLookupOptions,
  mapCandidateRuntimeRecord,
} from "../../../_components/candidate-runtime-record";
import type { CandidateRecord } from "../../../types";

type EditCandidatePageProps = {
  params: Promise<{
    candidateId: string;
  }>;
  searchParams?: Promise<{
    formId?: string;
  }>;
};

const emptySearchParams: { formId?: string } = {};

export default async function EditCandidatePage({
  params,
  searchParams,
}: EditCandidatePageProps) {
  const [{ candidateId }, resolvedSearchParams, sessionUser] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve(emptySearchParams),
      getSessionUser(),
    ]);

  let candidate: CandidateRecord;

  try {
    candidate = await apiRequestJson<CandidateRecord>(
      `/candidates/${candidateId}`,
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <div className="grid gap-6">
          <AccessDeniedState
            description="This candidate is outside your accessible business-unit scope."
            title="You cannot edit this candidate record."
          />
        </div>
      );
    }

    throw error;
  }

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "edit",
    recordId: candidate.id,
    sessionUser,
    spec: recruitmentCandidateRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
    "main",
  );

  return (
    <div className="dp-theme-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        lookupDisplayValues={candidateLookupDisplayValues(candidate)}
        lookupOptions={candidateLookupOptions(candidate)}
        mode="edit"
        record={mapCandidateRuntimeRecord(candidate)}
        recordId={candidate.id}
        runtime={runtime}
        spec={recruitmentCandidateRuntimeSpec}
        title={candidate.fullName || "Candidate"}
      />
    </div>
  );
}
