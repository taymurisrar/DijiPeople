import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { jobOpeningRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { JobOpeningDetailWorkspace } from "../../_components/job-opening-detail-workspace";
import {
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
  JobOpeningRecord,
} from "../../types";

type JobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{
    formId?: string;
  }>;
};

type JobOpeningWithMatchCriteria = JobOpeningRecord & {
  matchCriteria?: JobOpeningMatchCriteria | null;
};

export default async function JobDetailPage({
  params,
  searchParams,
}: JobDetailPageProps) {
  const [{ jobId }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  let job: JobOpeningWithMatchCriteria;

  try {
    job = await apiRequestJson<JobOpeningWithMatchCriteria>(
      `/job-openings/${jobId}`,
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="grid gap-6">
          <AccessDeniedState
            description="This job opening is outside your accessible business-unit scope."
            title="You cannot view this job opening."
          />
        </main>
      );
    }

    throw error;
  }

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: job.id,
    sessionUser,
    spec: jobOpeningRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );
  const runtimeRecord = mapJobRecord(job);

  return (
    <main className="dp-theme-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        formSlot={<JobOpeningDetailWorkspace job={job} />}
        mode="read"
        record={runtimeRecord}
        recordId={job.id}
        runtime={runtime}
        spec={jobOpeningRuntimeSpec}
        title={job.title}
      />
    </main>
  );
}

function mapJobRecord(job: JobOpeningWithMatchCriteria) {
  const averageMatchScore = getAverageMatchScore(job.applications);
  const scoringConfigured = hasMatchCriteriaConfigured(job.matchCriteria);

  return {
    ...job,
    applicationCount: job.applications.length,
    scoringStatus: scoringConfigured ? "Configured" : "Not configured",
    averageMatchScore,
  };
}

function getAverageMatchScore(applications: JobOpeningRecord["applications"]) {
  const scores = applications
    .map((application) => application.matchScore)
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) return null;

  return Math.round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
}
