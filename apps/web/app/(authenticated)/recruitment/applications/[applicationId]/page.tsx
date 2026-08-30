import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentApplicationRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { ApplicationDetailWorkspace } from "../../_components/application-detail-workspace";
import { ApplicationRecord } from "../../types";

type ApplicationDetailPageProps = {
  params: Promise<{
    applicationId: string;
  }>;
  searchParams?: Promise<{
    formId?: string;
  }>;
};

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: ApplicationDetailPageProps) {
  const [{ applicationId }, resolvedSearchParams, sessionUser] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
    ]);

  let application: ApplicationRecord;

  try {
    application = await apiRequestJson<ApplicationRecord>(
      `/applications/${applicationId}`,
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <div className="grid gap-6">
          <AccessDeniedState
            description="This application is outside your accessible business-unit scope."
            title="You cannot view this application record."
          />
        </div>
      );
    }

    throw error;
  }

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: application.id,
    sessionUser,
    spec: recruitmentApplicationRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );
  const runtimeRecord = mapApplicationRecord(application);

  return (
    <div className="dp-theme-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        formSlot={<ApplicationDetailWorkspace application={application} />}
        mode="read"
        record={runtimeRecord}
        recordId={application.id}
        runtime={runtime}
        spec={recruitmentApplicationRuntimeSpec}
        title={runtimeRecord.applicationName}
      />
    </div>
  );
}

function mapApplicationRecord(application: ApplicationRecord) {
  return {
    ...application,
    applicationName: application.candidate.fullName,
    candidateName: application.candidate.fullName,
    candidateEmail: application.candidate.email,
    jobTitle: application.jobOpening.title,
    jobCode: application.jobOpening.code ?? "",
    currentCity: application.candidate.currentCity ?? "",
    preferredWorkMode: application.candidate.preferredWorkMode ?? "",
  };
}
