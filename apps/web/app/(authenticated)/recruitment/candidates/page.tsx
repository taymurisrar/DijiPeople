import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildPublishedStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentCandidateRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import { CandidateListResponse, CandidateRecord } from "../types";

type RecruitmentCandidatesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecruitmentCandidatesPage({
  searchParams,
}: RecruitmentCandidatesPageProps) {
  const [businessUnitAccess, params, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    searchParams,
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <div className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include candidate records."
          title="Candidates are unavailable for your current business unit access."
        />
      </div>
    );
  }

  const page = parsePositiveInteger(getSearchParam(params.page), 1);
  const pageSize = parsePositiveInteger(getSearchParam(params.pageSize), 25);
  const candidateQuery = buildCandidateQuery(params, page, pageSize);
  const [candidates, runtime] = await Promise.all([
    apiRequestJson<CandidateListResponse>(`/candidates?${candidateQuery}`),
    buildPublishedStandardRouteRuntime({
      pageKind: "list",
      sessionUser,
      spec: recruitmentCandidateRuntimeSpec,
    }),
  ]);

  return (
    <div className="grid gap-6">
      <StandardModuleListPage
        commandRecord={{
          candidateCount: candidates.meta.total,
        }}
        pagination={{
          page: candidates.meta.page,
          pageSize: candidates.meta.pageSize,
          totalItems: candidates.meta.total,
          pathname: "/recruitment/candidates",
          searchParams: toPaginationSearchParams(params),
        }}
        records={candidates.items.map(mapCandidateRecord)}
        runtime={runtime}
        spec={recruitmentCandidateRuntimeSpec}
        title="Candidates"
      />
    </div>
  );
}

function mapCandidateRecord(candidate: CandidateRecord) {
  return {
    ...candidate,
    applicationCount: candidate.applications.length,
    lastApplicationAt: candidate.applications[0]?.appliedAt ?? null,
  };
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

function buildCandidateQuery(
  params: Record<string, string | string[] | undefined>,
  page: number,
  pageSize: number,
) {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  ["search", "currentStatus", "source", "skill", "city"].forEach((key) => {
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
