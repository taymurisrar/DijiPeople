import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildPublishedStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { jobOpeningRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import {
  hasMatchCriteriaConfigured,
  JobOpeningListResponse,
  JobOpeningRecord,
} from "../types";

type RecruitmentJobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecruitmentJobsPage({
  searchParams,
}: RecruitmentJobsPageProps) {
  const [businessUnitAccess, params, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    searchParams,
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include job opening records."
          title="Job openings are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const page = parsePositiveInteger(getSearchParam(params.page), 1);
  const pageSize = parsePositiveInteger(getSearchParam(params.pageSize), 25);
  const jobQuery = buildJobQuery(params, page, pageSize);
  const [jobs, runtime] = await Promise.all([
    apiRequestJson<JobOpeningListResponse>(`/job-openings?${jobQuery}`),
    buildPublishedStandardRouteRuntime({
      pageKind: "list",
      sessionUser,
      spec: jobOpeningRuntimeSpec,
    }),
  ]);

  return (
    <main className="grid gap-6">
      <StandardModuleListPage
        commandRecord={{
          jobOpeningCount: jobs.meta.total,
        }}
        pagination={{
          page: jobs.meta.page,
          pageSize: jobs.meta.pageSize,
          totalItems: jobs.meta.total,
          pathname: "/recruitment/jobs",
          searchParams: toPaginationSearchParams(params),
        }}
        records={jobs.items.map(mapJobRecord)}
        runtime={runtime}
        spec={jobOpeningRuntimeSpec}
        title="Job Openings"
      />
    </main>
  );
}

function mapJobRecord(job: JobOpeningRecord) {
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

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildJobQuery(
  params: Record<string, string | string[] | undefined>,
  page: number,
  pageSize: number,
) {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  ["search", "status"].forEach((key) => {
    const value = getSearchParam(params[key]);
    if (value) {
      query.set(key, value);
    }
  });

  return query.toString();
}

function toPaginationSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      getSearchParam(value) || undefined,
    ]),
  );
}
